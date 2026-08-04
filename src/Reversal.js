import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import BackToDashboard from './BackToDashboard';
import { getCurrentUser, getHomeDashboardPath } from './accessControl';
import { findExistingReceiptSale } from './utils/receiptNumber';
import { fetchCanonicalFinancials } from './utils/financials';
import { selectPrice } from './utils/setInventoryUtils';
import { applySalesAdjustment } from './services/salesAdjustment';
import { sendAdjustmentWhatsApp } from './services/whatsapp';
import { logUserActivity } from './utils/userActivityLog';
import './reversal.css';

const STEPS = {
  RECEIPT: 'receipt',
  OPERATION: 'operation',
  WORK: 'work',
  DONE: 'done',
};

function formatCurrency(amount, currency = 'K') {
  const n = Number(amount || 0);
  const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${formatted}`;
}

function lineLabel(line, productsMap) {
  if (line?.display_name) return line.display_name;
  const p = productsMap?.[line?.product_id];
  return p?.name || (line?.product_id ? `Product #${line.product_id}` : 'Line item');
}

function ModalPortal({ open, children, onBackdropClick, overlayClassName = 'allsales-modal-overlay', modalClassName = 'allsales-modal' }) {
  if (!open) return null;
  return createPortal(
    <div className={overlayClassName} onClick={onBackdropClick} role="presentation">
      <div className={modalClassName} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default function Reversal() {
  const navigate = useNavigate();
  const homePath = getHomeDashboardPath(getCurrentUser());
  const [step, setStep] = useState(STEPS.RECEIPT);
  const [receiptInput, setReceiptInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [productsMap, setProductsMap] = useState({});
  const [customerName, setCustomerName] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [outstandingAmount, setOutstandingAmount] = useState(0);

  const [operation, setOperation] = useState('');
  const [selectedRemoveIds, setSelectedRemoveIds] = useState(new Set());
  const [addLines, setAddLines] = useState([]);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [catalogProducts, setCatalogProducts] = useState([]);

  const resetWork = () => {
    setOperation('');
    setSelectedRemoveIds(new Set());
    setAddLines([]);
    setShowPicker(false);
    setPickerSearch('');
    setError('');
    setSuccess('');
  };

  const loadCatalog = useCallback(async () => {
    if (catalogProducts.length) return;
    try {
      const { data } = await fromPublic('products').select('id, name, sku, price, promotional_price, currency');
      setCatalogProducts(data || []);
    } catch {
      setCatalogProducts([]);
    }
  }, [catalogProducts.length]);

  useEffect(() => {
    if (showPicker) loadCatalog();
  }, [showPicker, loadCatalog]);

  const loadSaleByReceipt = async (receiptRaw) => {
    setLoading(true);
    setError('');
    try {
      const existing = await findExistingReceiptSale(fromPublic('sales'), 'sales', receiptRaw);
      if (!existing) throw new Error('Receipt not found. Check the number and try again.');

      const { data: saleRow, error: saleErr } = await fromPublic('sales')
        .select('id, customer_id, location_id, layby_id, status, currency, discount, receipt_number, total_amount, sale_date, created_at')
        .eq('id', existing.id)
        .maybeSingle();
      if (saleErr || !saleRow) throw new Error(saleErr?.message || 'Sale not found');

      const status = String(saleRow.status || '').toLowerCase();
      if (!['completed', 'layby'].includes(status)) {
        throw new Error('Only completed or layby sales can be adjusted.');
      }

      const { data: itemRows, error: itemsErr } = await db
        .from('sales_items')
        .select('id, product_id, display_name, quantity, unit_price, currency, color')
        .eq('sale_id', saleRow.id)
        .order('id', { ascending: true });
      if (itemsErr) throw itemsErr;
      if (!itemRows?.length) throw new Error('This sale has no line items.');

      const productIds = [...new Set((itemRows || []).map((it) => it.product_id).filter(Boolean))];
      let prodMap = {};
      if (productIds.length) {
        const { data: prods } = await fromPublic('products').select('id, name, sku').in('id', productIds);
        (prods || []).forEach((p) => { prodMap[p.id] = p; });
      }

      let custName = '';
      if (saleRow.customer_id) {
        const { data: cust } = await fromPublic('customers').select('name').eq('id', saleRow.customer_id).maybeSingle();
        custName = cust?.name || '';
      }

      const finMap = await fetchCanonicalFinancials(db, [saleRow.id]);
      const fin = finMap.get(String(saleRow.id)) || {};
      const paid = Number(fin.paid_amount || 0);
      const outstanding = Number(fin.outstanding_amount ?? Math.max(0, Number(saleRow.total_amount || 0) - paid));

      setSale(saleRow);
      setItems(itemRows || []);
      setProductsMap(prodMap);
      setCustomerName(custName);
      setPaidAmount(paid);
      setOutstandingAmount(outstanding);
      resetWork();
      setStep(STEPS.OPERATION);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const previewTotal = useMemo(() => {
    if (!sale) return 0;
    const kept = items.filter((it) => !selectedRemoveIds.has(Number(it.id)));
    const addSubtotal = addLines.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
    const keptSubtotal = kept.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
    return Math.max(0, keptSubtotal + addSubtotal - Number(sale.discount || 0));
  }, [sale, items, selectedRemoveIds, addLines]);

  const previewOutstanding = useMemo(() => Math.max(0, previewTotal - paidAmount), [previewTotal, paidAmount]);

  const filteredCatalog = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return catalogProducts.slice(0, 80);
    return catalogProducts.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const sku = String(p.sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    }).slice(0, 80);
  }, [catalogProducts, pickerSearch]);

  const toggleRemove = (id) => {
    setSelectedRemoveIds((prev) => {
      const next = new Set(prev);
      const num = Number(id);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const addProductLine = (product) => {
    const line = {
      _key: `add-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      product_id: product.id,
      display_name: null,
      quantity: 1,
      unit_price: Number(selectPrice(product.promotional_price, product.price) || 0),
      currency: sale?.currency || product.currency || 'K',
      color: '',
    };
    setAddLines((rows) => [...rows, line]);
    setShowPicker(false);
    setPickerSearch('');
  };

  const updateAddLineQty = (key, qty) => {
    setAddLines((rows) => rows.map((r) => (r._key === key ? { ...r, quantity: Math.max(1, Number(qty) || 1) } : r)));
  };

  const removeAddLine = (key) => {
    setAddLines((rows) => rows.filter((r) => r._key !== key));
  };

  const validateBeforeSubmit = () => {
    if (!operation) return 'Choose an operation.';
    if (operation === 'reversal' && selectedRemoveIds.size === 0) return 'Select at least one product to reverse.';
    if (operation === 'replacement') {
      if (selectedRemoveIds.size === 0) return 'Select the product line to replace.';
      if (!addLines.length) return 'Add at least one replacement product.';
    }
    if (operation === 'addition' && !addLines.length) return 'Add at least one product.';
    const remaining = items.filter((it) => !selectedRemoveIds.has(Number(it.id))).length + addLines.length;
    if (remaining === 0) return 'Sale must retain at least one line item.';
    return '';
  };

  const handleSubmit = async () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const { data, error: adjErr } = await applySalesAdjustment({
        saleId: sale.id,
        operation,
        removeItemIds: [...selectedRemoveIds],
        addItems: addLines.map((line) => ({
          product_id: line.product_id,
          display_name: line.display_name,
          quantity: Number(line.quantity || 0),
          unit_price: Number(line.unit_price || 0),
          currency: line.currency || sale.currency,
          color: line.color || null,
        })),
      });
      if (adjErr) throw adjErr;

      const wa = await sendAdjustmentWhatsApp({
        saleId: sale.id,
        laybyId: data.laybyId || sale.layby_id || null,
        eventType: operation,
        topupRequired: Boolean(data.topupRequired),
      });
      if (!wa.ok) {
        console.warn('WhatsApp notification failed:', wa.error);
      }

      logUserActivity({
        actionType: sale.layby_id ? 'layby' : 'sale',
        actionLabel: `${operation.charAt(0).toUpperCase()}${operation.slice(1)} adjustment`,
        details: `Receipt ${sale.receipt_number} • New total ${formatCurrency(data.newTotal, sale.currency)} • Paid ${formatCurrency(data.paid, sale.currency)}`,
        reference: sale.receipt_number || String(sale.id),
        entityType: sale.layby_id ? 'layby' : 'sale',
        entityId: sale.layby_id ? String(sale.layby_id) : String(sale.id),
      });

      setSuccess(`Adjustment saved. New total: ${formatCurrency(data.newTotal, sale.currency)}${data.topupRequired ? ' — top-up required.' : ''}${!wa.ok ? ' (WhatsApp notification failed.)' : ''}`);
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    setSale(null);
    setItems([]);
    setReceiptInput('');
    resetWork();
    setStep(STEPS.RECEIPT);
  };

  const saleTypeLabel = sale
    ? (String(sale.status).toLowerCase() === 'layby' || sale.layby_id ? 'Layby sale' : 'Completed sale')
    : '';

  return (
    <div className="reversal-container">
      <div className="reversal-header">
        <BackToDashboard />
        <h2>Reversal / Replacement / Addition</h2>
      </div>

      {error && step !== STEPS.RECEIPT && (
        <div className="reversal-status-msg error" role="alert">{error}</div>
      )}
      {success && (
        <div className="reversal-status-msg success" role="status">{success}</div>
      )}

      {sale && step !== STEPS.RECEIPT && (
        <div className="reversal-sale-card">
          <div className="reversal-sale-meta">
            <div><strong>Receipt:</strong> {sale.receipt_number || '—'}</div>
            <div><strong>Type:</strong> {saleTypeLabel}</div>
            <div><strong>Customer:</strong> {customerName || '—'}</div>
            <div><strong>Current total:</strong> {formatCurrency(sale.total_amount, sale.currency)}</div>
            <div><strong>Paid:</strong> {formatCurrency(paidAmount, sale.currency)}</div>
            <div><strong>Outstanding:</strong> {formatCurrency(outstandingAmount, sale.currency)}</div>
          </div>
          {step === STEPS.DONE && (
            <div className="reversal-actions">
              <button type="button" className="allsales-edit-btn" onClick={startOver}>Adjust another receipt</button>
            </div>
          )}
        </div>
      )}

      {step === STEPS.OPERATION && sale && (
        <>
          <p>Select what you want to do with this {saleTypeLabel.toLowerCase()}:</p>
          <div className="reversal-op-grid">
            <button type="button" className={`reversal-op-btn${operation === 'reversal' ? ' active' : ''}`} onClick={() => { setOperation('reversal'); setStep(STEPS.WORK); setAddLines([]); }}>
              Reversal
              <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>Return product(s) to stock and reduce total</div>
            </button>
            <button type="button" className={`reversal-op-btn${operation === 'replacement' ? ' active' : ''}`} onClick={() => { setOperation('replacement'); setStep(STEPS.WORK); setSelectedRemoveIds(new Set()); setAddLines([]); }}>
              Replacement
              <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>Swap product(s) for others</div>
            </button>
            <button type="button" className={`reversal-op-btn${operation === 'addition' ? ' active' : ''}`} onClick={() => { setOperation('addition'); setStep(STEPS.WORK); setSelectedRemoveIds(new Set()); setAddLines([]); }}>
              Addition
              <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>Add product(s) to this receipt</div>
            </button>
          </div>
        </>
      )}

      {step === STEPS.WORK && sale && operation && (
        <>
          {(operation === 'reversal' || operation === 'replacement') && (
            <>
              <h3>{operation === 'replacement' ? 'Select line to replace' : 'Select product(s) to reverse'}</h3>
              <table className="reversal-items-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const selected = selectedRemoveIds.has(Number(it.id));
                    const lineTotal = Number(it.unit_price || 0) * Number(it.quantity || 0);
                    return (
                      <tr key={it.id} className={selected ? 'selected' : ''}>
                        <td>
                          <input
                            type={operation === 'replacement' ? 'radio' : 'checkbox'}
                            name="remove-line"
                            checked={selected}
                            onChange={() => {
                              if (operation === 'replacement') {
                                setSelectedRemoveIds(new Set([Number(it.id)]));
                              } else {
                                toggleRemove(it.id);
                              }
                            }}
                          />
                        </td>
                        <td>{lineLabel(it, productsMap)}</td>
                        <td>{it.quantity}</td>
                        <td>{formatCurrency(it.unit_price, it.currency || sale.currency)}</td>
                        <td>{formatCurrency(lineTotal, it.currency || sale.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {(operation === 'replacement' || operation === 'addition') && (
            <div style={{ marginTop: 20 }}>
              <h3>{operation === 'replacement' ? 'Replacement product(s)' : 'Product(s) to add'}</h3>
              <button type="button" className="allsales-edit-btn" onClick={() => setShowPicker(true)}>Add from catalog</button>
              {addLines.length > 0 && (
                <table className="reversal-items-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {addLines.map((line) => (
                      <tr key={line._key}>
                        <td>{lineLabel(line, Object.fromEntries(catalogProducts.map((p) => [p.id, p])))}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) => updateAddLineQty(line._key, e.target.value)}
                            style={{ width: 64 }}
                          />
                        </td>
                        <td>{formatCurrency(line.unit_price, line.currency || sale.currency)}</td>
                        <td>
                          <button type="button" className="allsales-edit-btn" onClick={() => removeAddLine(line._key)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="reversal-preview">
            <div><strong>Preview new total:</strong> {formatCurrency(previewTotal, sale.currency)}</div>
            <div><strong>Paid:</strong> {formatCurrency(paidAmount, sale.currency)}</div>
            <div><strong>Preview outstanding:</strong> {formatCurrency(previewOutstanding, sale.currency)}</div>
            {operation === 'replacement' && previewOutstanding < 1 && previewTotal <= paidAmount && (
              <div style={{ marginTop: 6, color: '#047857' }}>Replacement total is covered by payments — sale will be marked completed.</div>
            )}
            {(operation === 'replacement' || operation === 'addition') && previewOutstanding >= 1 && (
              <div style={{ marginTop: 6, color: '#b45309' }}>Top-up required — sale will remain or become a layby.</div>
            )}
          </div>

          <div className="reversal-actions">
            <button type="button" className="allsales-edit-btn" onClick={() => { setStep(STEPS.OPERATION); resetWork(); setOperation(''); }} disabled={submitting}>
              Back
            </button>
            <button type="button" className="allsales-edit-btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Apply adjustment'}
            </button>
          </div>
        </>
      )}

      <ModalPortal
        open={step === STEPS.RECEIPT}
        onBackdropClick={() => {}}
        overlayClassName="reversal-receipt-overlay"
        modalClassName="reversal-receipt-modal"
      >
        <h3>Enter receipt number</h3>
        <p className="reversal-receipt-lead">Look up a completed sale or layby.</p>
        <label className="reversal-receipt-field">
          <span className="reversal-receipt-label">Receipt #</span>
          <input
            className="reversal-receipt-input"
            value={receiptInput}
            onChange={(e) => setReceiptInput(e.target.value)}
            placeholder="e.g. #1234"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && receiptInput.trim()) loadSaleByReceipt(receiptInput.trim()); }}
          />
        </label>
        {error && step === STEPS.RECEIPT && (
          <div className="reversal-status-msg error reversal-receipt-error" role="alert">{error}</div>
        )}
        <div className="reversal-receipt-actions">
          <button
            type="button"
            className="reversal-receipt-cancel"
            disabled={loading}
            onClick={() => navigate(homePath)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="allsales-edit-btn"
            disabled={loading || !receiptInput.trim()}
            onClick={() => loadSaleByReceipt(receiptInput.trim())}
          >
            {loading ? 'Looking up…' : 'Continue'}
          </button>
        </div>
      </ModalPortal>

      <ModalPortal
        open={showPicker}
        onBackdropClick={(e) => { if (e.target.classList.contains('allsales-modal-overlay')) setShowPicker(false); }}
      >
        <h3>Add product</h3>
        <input
          className="reversal-picker-search"
          placeholder="Search by name or SKU…"
          value={pickerSearch}
          onChange={(e) => setPickerSearch(e.target.value)}
        />
        <div className="reversal-picker-list">
          {filteredCatalog.map((p) => (
            <div key={p.id} className="reversal-picker-row">
              <span>{p.name}{p.sku ? ` (${p.sku})` : ''} — {formatCurrency(selectPrice(p.promotional_price, p.price), p.currency || sale?.currency || 'K')}</span>
              <button type="button" className="allsales-edit-btn" onClick={() => addProductLine(p)}>Add</button>
            </div>
          ))}
          {!filteredCatalog.length && <div style={{ padding: 12, color: '#94a3b8' }}>No products found.</div>}
        </div>
        <div className="reversal-actions">
          <button type="button" className="allsales-edit-btn" onClick={() => setShowPicker(false)}>Close</button>
        </div>
      </ModalPortal>
    </div>
  );
}
