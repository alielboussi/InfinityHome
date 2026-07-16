import React from 'react';
import supabase from './supabase';
import generateQuotePdf from './quotespdf';

const EMPTY_ARR = [];

function titleCaseWords(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function resolveQuoteItemName(it) {
  return it?.name_override || it?.name || it?.product_name || it?.quote_product_name || it?.description || 'Item';
}

function resolveQuoteItemDesc(it) {
  return it?.description || '';
}

function resolveUnitLabel(unitMap, unitId) {
  if (!unitId) return '';
  const unit = unitMap.get(Number(unitId)) || unitMap.get(String(unitId));
  return unit?.name || unit?.abbreviation || '';
}

function escapeHtml(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintableHtml(customer, quotes) {
  const name = titleCaseWords(customer?.name || 'Customer');
  const phone = customer?.phone || '-';
  const addressParts = [customer?.address, customer?.city].filter(Boolean);
  const address = addressParts.length ? addressParts.join(', ') : '-';

  const quoteBlocks = (quotes || []).map(q => {
    const quoteLabel = q.quote_number || `Q-${String(q.id).slice(0, 8)}`;
    const dateLabel = q.created_at ? new Date(q.created_at).toLocaleString() : '';
    const itemLines = (q.items || []).map(it => {
      const itemName = resolveQuoteItemName(it);
      const qty = Number(it.quantity || it.qty || 0);
      return `<div class="item-line">- Qty ${escapeHtml(qty)} - ${escapeHtml(itemName)}</div>`;
    }).join('');

    return `
      <div class="section">
        <div class="section-title">Quote: ${escapeHtml(quoteLabel)}</div>
        ${dateLabel ? `<div class="muted">${escapeHtml(dateLabel)}</div>` : ''}
        <div class="item-list">${itemLines || '<div class="muted">No items</div>'}</div>
      </div>
    `;
  }).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Converted Quote Layby</title>
        <style>
          @page { size: 58mm auto; margin: 3mm; }
          body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; width: 58mm; margin: 0; color: #000; }
          .header { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
          .muted { color: #333; font-size: 11px; margin-top: 2px; }
          .line { margin: 2px 0; }
          .section { margin-top: 8px; }
          .section-title { font-weight: 700; margin-bottom: 2px; }
          .item-list { margin-top: 4px; }
          .item-line { margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="header">Converted Quote Layby</div>
        <div class="line"><strong>Name:</strong> ${escapeHtml(name)}</div>
        <div class="line"><strong>Phone:</strong> ${escapeHtml(phone)}</div>
        <div class="line"><strong>Address:</strong> ${escapeHtml(address)}</div>
        ${quoteBlocks || '<div class="muted">No converted quotes.</div>'}
      </body>
    </html>
  `;
}

function buildQuotePdfNoPrices(customer, quote, unitsMap) {
  const items = (quote?.items || []).map(it => {
    const unit = unitsMap.get(Number(it.unit_id)) || unitsMap.get(String(it.unit_id));
    return {
      ...it,
      unit_label: unit?.name || '',
      unit_abbr: unit?.abbreviation || '',
    };
  });

  const payload = {
    ...quote,
    customer_name: titleCaseWords(customer?.name || ''),
    customer_phone: customer?.phone || '',
    customer_address: customer?.address || '',
    customer_city: customer?.city || '',
    customer_email: customer?.email || '',
    customer_tpin: customer?.tpin || '',
  };

  return generateQuotePdf(payload, items, { mode: 'blob', noPrices: true, headerTextOverride: 'Delivery Note' });
}

export default function ConvertedQuoteLaybysModal({ open, onClose }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [customers, setCustomers] = React.useState(EMPTY_ARR);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [unitsMap, setUnitsMap] = React.useState(new Map());
  const inFlightRef = React.useRef(false);
  const loadedOnceRef = React.useRef(false);

  const loadConvertedQuotes = React.useCallback(async ({ force = false } = {}) => {
    if (inFlightRef.current) return;
    if (!force && loadedOnceRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError('');
    try {
      const [{ data: quotes, error: quoteErr }, { data: units, error: unitErr }] = await Promise.all([
        supabase
          .from('quotations')
          .select('id, quote_number, customer_id, created_at, status')
          .eq('status', 'converted')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('quotation_units')
          .select('id, name, abbreviation')
          .order('name', { ascending: true })
      ]);

      if (quoteErr) throw quoteErr;
      if (unitErr) throw unitErr;

      const quoteRows = quotes || [];
      const quoteIds = quoteRows.map(q => q.id).filter(Boolean);
      const customerIds = Array.from(new Set(quoteRows.map(q => q.customer_id).filter(Boolean)));

      let customerMap = {};
      if (customerIds.length) {
        const { data: custRows, error: custErr } = await supabase
          .from('customers')
          .select('id, name, phone, address, city, tpin')
          .in('id', customerIds);
        if (custErr) throw custErr;
        (custRows || []).forEach(c => { customerMap[String(c.id)] = c; });
      }

      let itemsByQuote = new Map();
      if (quoteIds.length) {
        const { data: items, error: itemsErr } = await supabase
          .from('quotation_items')
          .select('*')
          .in('quotation_id', quoteIds)
          .order('sort_order', { ascending: true });
        if (itemsErr) throw itemsErr;
        (items || []).forEach(it => {
          const key = String(it.quotation_id);
          const arr = itemsByQuote.get(key) || [];
          arr.push(it);
          itemsByQuote.set(key, arr);
        });
      }

      const unitMap = new Map();
      (units || []).forEach(u => { unitMap.set(Number(u.id), u); unitMap.set(String(u.id), u); });
      setUnitsMap(unitMap);

      const customersList = customerIds.map(cid => {
        const cust = customerMap[String(cid)] || { id: cid, name: 'Unknown', phone: '', address: '', city: '' };
        const quotesForCustomer = quoteRows
          .filter(q => String(q.customer_id) === String(cid))
          .map(q => ({
            ...q,
            items: itemsByQuote.get(String(q.id)) || []
          }));
        return { ...cust, quotes: quotesForCustomer };
      }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

      setCustomers(customersList);
      setSelectedCustomerId(prev => {
        if (prev && customersList.find(c => String(c.id) === String(prev))) return prev;
        return customersList[0]?.id || '';
      });
      loadedOnceRef.current = true;
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    loadConvertedQuotes();
  }, [open, loadConvertedQuotes]);

  React.useEffect(() => {
    if (open) return;
    loadedOnceRef.current = false;
    inFlightRef.current = false;
  }, [open]);

  const filteredCustomers = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(c => {
      const nameMatch = String(c.name || '').toLowerCase().includes(term);
      if (nameMatch) return true;
      const quotes = c.quotes || EMPTY_ARR;
      return quotes.some(q => (q.items || EMPTY_ARR).some(it => {
        const itemName = resolveQuoteItemName(it).toLowerCase();
        const itemDesc = resolveQuoteItemDesc(it).toLowerCase();
        const sku = String(it?.sku || '').toLowerCase();
        return itemName.includes(term) || itemDesc.includes(term) || sku.includes(term);
      }));
    });
  }, [customers, search]);

  React.useEffect(() => {
    if (!filteredCustomers.length) {
      setSelectedCustomerId('');
      return;
    }
    const found = filteredCustomers.find(c => String(c.id) === String(selectedCustomerId));
    if (!found) setSelectedCustomerId(filteredCustomers[0]?.id || '');
  }, [filteredCustomers, selectedCustomerId]);

  const selectedCustomer = filteredCustomers.find(c => String(c.id) === String(selectedCustomerId));

  const handlePrintQuote = (quote) => {
    if (!selectedCustomer) return;
    const html = buildPrintableHtml(selectedCustomer, quote ? [quote] : []);
    const win = window.open('', 'print-converted-quote', 'width=420,height=700');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 250);
  };

  const handleOpenPdfQuote = async (quote) => {
    if (!selectedCustomer || !quote) return;
    const blob = await buildQuotePdfNoPrices(selectedCustomer, quote, unitsMap);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  if (!open) return null;

  return (
    <div className="wt-overlay" onClick={onClose}>
      <div className="wt-conv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wt-conv-header">
          <div className="wt-conv-title">Converted Quote Laybys</div>
          <div className="wt-conv-actions">
            <button className="wt-btn wt-btn-warn wt-conv-btn" type="button" onClick={() => loadConvertedQuotes({ force: true })}>Refresh</button>
            <button className="wt-close wt-conv-close" type="button" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="wt-conv-body">
          <div className="wt-conv-customers">
            <div className="wt-conv-section-title">Customers</div>
            <input
              className="wt-input wt-conv-search"
              placeholder="Search customer or item"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {loading && <div className="wt-conv-empty">Loading...</div>}
            {!loading && error && <div className="wt-conv-empty">{error}</div>}
            {!loading && !error && filteredCustomers.length === 0 && (
              <div className="wt-conv-empty">No converted quotes found.</div>
            )}
            {!loading && !error && filteredCustomers.map(c => (
              <button
                type="button"
                key={c.id}
                className={"wt-conv-customer" + (String(c.id) === String(selectedCustomerId) ? ' active' : '')}
                onClick={() => setSelectedCustomerId(c.id)}
              >
                <div className="wt-conv-customer-name">{titleCaseWords(c.name || 'Unknown')}</div>
                <div className="wt-conv-customer-phone">{c.phone || '-'}</div>
              </button>
            ))}
          </div>
          <div className="wt-conv-items">
            <div className="wt-conv-section-title">Items (No Prices)</div>
            {!selectedCustomer && <div className="wt-conv-empty">Select a customer to view items.</div>}
            {selectedCustomer && (
              <>
                <div className="wt-conv-customer-card">
                  <div className="wt-conv-customer-title">{titleCaseWords(selectedCustomer.name || 'Unknown')}</div>
                  <div className="wt-conv-customer-meta">Phone: {selectedCustomer.phone || '-'}</div>
                  <div className="wt-conv-customer-meta">Address: {(selectedCustomer.address || selectedCustomer.city) ? `${selectedCustomer.address || ''}${selectedCustomer.address && selectedCustomer.city ? ', ' : ''}${selectedCustomer.city || ''}` : '-'}</div>
                </div>
                <div className="wt-conv-quotes">
                  {(selectedCustomer.quotes || []).map(q => (
                    <div key={q.id} className="wt-conv-quote">
                      <div className="wt-conv-quote-head">
                        <div className="wt-conv-quote-info">
                          <div>{q.quote_number || `Q-${String(q.id).slice(0, 8)}`}</div>
                          <div className="wt-conv-quote-date">{q.created_at ? new Date(q.created_at).toLocaleString() : ''}</div>
                        </div>
                        <div className="wt-conv-quote-actions">
                          <button
                            type="button"
                            className="wt-conv-print-icon"
                            aria-label="Print 58mm"
                            title="Print 58mm"
                            onClick={() => handlePrintQuote(q)}
                          >
                            🖨
                          </button>
                          <button
                            type="button"
                            className="wt-conv-pdf-icon"
                            aria-label="Open PDF"
                            title="Open PDF"
                            onClick={() => handleOpenPdfQuote(q)}
                          >
                            PDF
                          </button>
                        </div>
                      </div>
                      {(q.items || []).length === 0 ? (
                        <div className="wt-conv-empty">No items on this quote.</div>
                      ) : (
                        <div className="wt-conv-quote-items">
                          {q.items.map((it, idx) => {
                            const unitLabel = resolveUnitLabel(unitsMap, it.unit_id);
                            const desc = resolveQuoteItemDesc(it);
                            return (
                              <div key={`${q.id}-${idx}`} className="wt-conv-item">
                                <div className="wt-conv-item-main">
                                  <div className="wt-conv-item-name">{resolveQuoteItemName(it)}</div>
                                  {desc && <div className="wt-conv-item-desc">{desc}</div>}
                                  {(unitLabel || it.sku) && (
                                    <div className="wt-conv-item-meta">
                                      {unitLabel && <span>Unit: {unitLabel}</span>}
                                      {unitLabel && it.sku && <span className="wt-conv-meta-sep">•</span>}
                                      {it.sku && <span>SKU: {it.sku}</span>}
                                    </div>
                                  )}
                                </div>
                                <div className="wt-conv-item-qty">Qty: {Number(it.quantity || it.qty || 0)}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
