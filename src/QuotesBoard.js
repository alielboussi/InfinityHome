import React from 'react';
import { useNavigate } from 'react-router-dom';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import { openOrCreateQuotationPdf } from './QuotationerPdfService';
import { convertQuoteToLayby } from './services/quoteConversion';
import { cacheClear } from './utils/staleCache';
import { LAYBY_ROWS_CACHE_KEY } from './utils/laybyRollup';
import BackToDashboard from './BackToDashboard';
import { canDeleteQuotationData, canEditQuotation, isQuotationerOnlyUser } from './accessControl';
import { computeQuotationDisplayTotal, quotationHasOutstandingDue, sortQuotationRows } from './utils/quotationDisplay';

const readLocalUser = () => {
  try {
    const raw = localStorage.getItem('user');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.id || parsed.email)) return parsed;
  } catch {}
  return null;
};

const titleCaseWords = (text) => String(text || '')
  .split(/\s+/)
  .filter(Boolean)
  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

const CANONICAL_APP_ORIGIN = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://infinity-home-pi.vercel.app').replace(/\/+$/, '');

async function fetchQuotationRead(action, params = {}) {
  let headers = undefined;
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers = { Authorization: `Bearer ${token}` };
  } catch {}

  const relQuotationRead = `/api/quotation-read?${new URLSearchParams({ action, ...params }).toString()}`;
  const relAdminRead = `/api/admin?${new URLSearchParams({ adminAction: 'quotation-read', action, ...params }).toString()}`;
  const canonicalQuotationRead = `${CANONICAL_APP_ORIGIN}/api/quotation-read?${new URLSearchParams({ action, ...params }).toString()}`;

  const attempts = [relQuotationRead, relAdminRead, canonicalQuotationRead];

  let lastError = null;
  for (const url of attempts) {
    const resp = await fetch(url, headers ? { headers } : undefined);
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && payload?.ok) {
      return payload.rows || [];
    }
    lastError = payload?.error || `quotation-read failed (${resp.status})`;
  }
  throw new Error(lastError || 'quotation-read failed');
}

export default function QuotesBoard() {
  const [quotes, setQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [customerMap, setCustomerMap] = React.useState({});
  const [salePaidBySaleId, setSalePaidBySaleId] = React.useState(() => new Map());
  const navigate = useNavigate();
  const user = React.useMemo(() => readLocalUser(), []);
  const isQuotationerOnly = isQuotationerOnlyUser(user);
  const canDelete = canDeleteQuotationData(user);

  const normalizeQuoteItemForSale = React.useCallback((item) => {
    const rawQty = Number(item.quantity || 0);
    const rawPrice = Number(item.unit_price || 0);
    if (Number.isFinite(rawQty) && rawQty > 0 && Number.isInteger(rawQty)) {
      return { quantity: rawQty, unit_price: rawPrice };
    }
    const safeQty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
    const qtyInt = Math.max(1, Math.round(safeQty));
    const lineTotal = safeQty * rawPrice;
    const unitPrice = qtyInt ? (lineTotal / qtyInt) : rawPrice;
    return { quantity: qtyInt, unit_price: unitPrice };
  }, []);

  const btn = React.useMemo(() => ({
    background: 'var(--br-surface)',
    border: '1px solid var(--br-border)',
    color: 'var(--br-text)',
    borderRadius: 8,
    padding: '10px 14px',
    fontWeight: 600,
    boxShadow: 'var(--br-glow)',
    cursor: 'pointer',
  }), []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let data = [];
      let error = null;
      try {
        data = await fetchQuotationRead('list-quotes', { limit: '200' });
      } catch (readErr) {
        const fallback = await db
          .from('quotations')
          .select('id, quote_number, customer_id, created_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id')
          .order('created_at', { ascending: false })
          .limit(200);
        data = fallback.data || [];
        error = fallback.error || readErr;
      }
      if (!cancelled) {
        if (!error) {
          setQuotes(sortQuotationRows(data || []));
          try {
            const ids = Array.from(new Set((data || []).map(q => q.customer_id).filter(Boolean)));
            let map = {};
            (data || []).forEach(q => {
              if (q?.customer_id && q?.customer_name) {
                map[String(q.customer_id)] = titleCaseWords(q.customer_name);
              }
            });
            if (ids.length) {
              const missing = ids.filter(id => !map[String(id)]);
              const { data: cust } = missing.length ? await db.from('customers').select('id, name').in('id', missing) : { data: [] };
              (cust || []).forEach(c => { map[String(c.id)] = titleCaseWords(c.name); });
            }
            if (!cancelled) setCustomerMap(map);
          } catch {}
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadPaymentFlags() {
      const saleIds = Array.from(new Set(
        (quotes || []).map(q => q.sale_id).filter(Boolean).map(String)
      ));
      if (!saleIds.length) {
        if (!cancelled) setSalePaidBySaleId(new Map());
        return;
      }
      try {
        const { data: salesPays } = await fromPublic('sales_payments')
          .select('sale_id, amount, discount_amount')
          .in('sale_id', saleIds);
        const paidBySale = new Map();
        (salesPays || []).forEach((row) => {
          if (row?.sale_id == null) return;
          const key = String(row.sale_id);
          paidBySale.set(key, (paidBySale.get(key) || 0) + Number(row.amount || 0) + Number(row.discount_amount || 0));
        });
        if (!cancelled) setSalePaidBySaleId(paidBySale);
      } catch {
        if (!cancelled) setSalePaidBySaleId(new Map());
      }
    }
    loadPaymentFlags();
    return () => { cancelled = true; };
  }, [quotes]);

  const quoteIsEditable = React.useCallback((q) => {
    const paidAmount = q?.sale_id ? Number(salePaidBySaleId.get(String(q.sale_id)) || 0) : 0;
    const hasOutstandingDue = quotationHasOutstandingDue(q, paidAmount);
    return canEditQuotation(user, q, { hasOutstandingDue });
  }, [user, salePaidBySaleId]);

  const filtered = quotes.filter(q => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const byNum = (q.quote_number || `Q-${String(q.id).slice(0, 8)}`).toLowerCase().includes(s);
    const custName = (customerMap[String(q.customer_id)] || '').toLowerCase();
    const byCust = custName.includes(s);
    const byAmt = String(computeQuotationDisplayTotal(q).toFixed(2)).toLowerCase().includes(s) || String(q.total || '').toLowerCase().includes(s);
    return byNum || byCust || byAmt;
  });

  async function handleConvert(q) {
    try {
      const [{ data: items }, { data: quoteRow }] = await Promise.all([
        db.from('quotation_items').select('*').eq('quotation_id', q.id).order('sort_order'),
        db.from('quotations').select('*').eq('id', q.id).maybeSingle(),
      ]);
      const quote = quoteRow || q;
      await convertQuoteToLayby({
        quote,
        items,
        normalizeItem: normalizeQuoteItemForSale,
        quotationStatus: 'converted',
      });
      // WhatsApp is sent from Layby Management when the first payment is recorded (not on convert).
      cacheClear(LAYBY_ROWS_CACHE_KEY);

      let data = [];
      try {
        data = await fetchQuotationRead('list-quotes', { limit: '200' });
      } catch {
        const fallback = await db.from('quotations').select('id, quote_number, customer_id, created_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id').order('created_at', { ascending: false }).limit(200);
        data = fallback.data || [];
      }
      setQuotes(data || []);
      alert('Converted to layby successfully.');
    } catch (e) {
      alert('Convert failed: ' + (e?.message || e));
    }
  }

  async function handleDownloadPdf(q) {
    try {
      const [{ data: items }, { data: quoteRow }, { data: units }] = await Promise.all([
        db.from('quotation_items').select('*').eq('quotation_id', q.id).order('sort_order'),
        db.from('quotations').select('*').eq('id', q.id).single(),
        db.from('quotation_units').select('*')
      ]);
      let paid = 0;
      if (quoteRow?.sale_id) {
        try {
          const { data: pays } = await fromPublic('sales_payments').select('amount').eq('sale_id', quoteRow.sale_id);
          paid = (pays || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        } catch {}
      }
      let customerName = '';
      if (quoteRow?.customer_id) {
        const { data: cust } = await db.from('customers').select('name').eq('id', quoteRow.customer_id).maybeSingle();
        customerName = titleCaseWords(cust?.name || '');
      }
      await openOrCreateQuotationPdf(
        { ...quoteRow, customer_name: customerName, paid_amount: paid, outstanding_amount: Math.max(0, Number(quoteRow?.total || 0) - paid) },
        (items || []).map(it => ({
          ...it,
          unit_label: units?.find(u => u.id === it.unit_id)?.name || '-',
        })),
        { name: 'Best Rest Furniture' }
      );
    } catch (e) {
      alert('Download failed: ' + (e.message || e));
    }
  }

  async function handleDeleteQuote(q) {
    const ok = window.confirm('Delete this quote? This cannot be undone.');
    if (!ok) return;
    try {
      await db.from('quotation_items').delete().eq('quotation_id', q.id);
      const { error } = await db.from('quotations').delete().eq('id', q.id);
      if (error) throw error;
      setQuotes(prev => prev.filter(row => row.id !== q.id));
      alert('Quote deleted.');
    } catch (e) {
      alert('Delete failed: ' + (e?.message || e));
    }
  }

  function handleEditQuote(q) {
    navigate(`/quotationer?quoteId=${q.id}`);
  }

  return (
    <div className="content quotes-page" style={{ padding: 12 }}>
      <div className="quotes-header page-header-row" style={{ marginBottom: 12 }}>
        {!isQuotationerOnly && <BackToDashboard />}
        {isQuotationerOnly && (
          <button
            type="button"
            className="action-button"
            style={{ padding: '8px 12px', fontSize: 13, background: '#0f7fff', color: '#fff', border: '1px solid #0c6ed8', borderRadius: 6 }}
            onClick={() => navigate('/quotationer')}
          >
            Back to Dashboard
          </button>
        )}
        <h2 className="quotes-title" style={{ margin: 0 }}>Quotes</h2>
      </div>

      <input
        className="quotes-input"
        style={{ width: 340 }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, customer, or amount"
      />

      {loading ? <div style={{ color: '#8ab' }}>Loading...</div> : (
        <div className="table-container" style={{ marginTop: 12 }}>
          <table className="table quotes-table">
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id}>
                  <td>{q.quote_number || `Q-${String(q.id).slice(0, 8)}`}</td>
                  <td>{customerMap[String(q.customer_id)] || titleCaseWords(q.customer_name || q.customer || '') || (q.customer_id ? `#${String(q.customer_id).slice(0,8)}` : '-')}</td>
                  <td>{new Date(q.created_at).toLocaleString()}</td>
                  <td>{(q.status === 'converted' || q.status === 'invoice') ? 'Invoice' : 'Quote'}</td>
                  <td style={{ textAlign: 'right' }}>{computeQuotationDisplayTotal(q).toFixed(2)}</td>
                  <td style={{ minWidth: 200 }}>
                    <div className="quotes-list-actions">
                      {quoteIsEditable(q) && (
                        <button
                          type="button"
                          className="quotes-list-action-btn"
                          style={btn}
                          onClick={() => handleEditQuote(q)}
                        >
                          Edit Quote
                        </button>
                      )}
                      <button type="button" className="quotes-list-action-btn" style={btn} onClick={() => handleDownloadPdf(q)}>
                        Download PDF
                      </button>
                      {!isQuotationerOnly && (
                        <>
                          {q.status !== 'converted' && (
                            <button type="button" className="quotes-list-action-btn" style={btn} onClick={() => handleConvert(q)}>Convert to Layby</button>
                          )}
                          {q.status === 'converted' && q.sale_id && (
                            <button type="button" className="quotes-list-action-btn" style={btn} onClick={() => navigate(`/layby-management?laybyId=${encodeURIComponent(q.layby_id || '')}&saleId=${encodeURIComponent(q.sale_id)}`)}>Go to Layby</button>
                          )}
                          {canDelete && (
                            <button type="button" className="quotes-list-action-btn" style={btn} onClick={() => handleDeleteQuote(q)}>Delete Quote</button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
