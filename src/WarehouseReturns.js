import React from 'react';
import {
  createReturnOrder,
  listReturnKitweProducts,
  listReturnOrders,
  listReturnQuoteCustomers,
  getPosSaleDetailForStorage,
  listPosSalesForStorage,
} from './services/warehouseDeliveryMobileApi';
import { loadKitwePosSalesForStoragePage, loadKitwePosSaleDetailForStoragePage } from './utils/warehouseStoragePosSales';
import { fetchWarehouseCatalog } from './services/warehouseCatalog';
import { buildKitweReturnProductOptions } from './utils/kitweSetStock';
import db from './dataClient';
import {
  WAREHOUSE_RETURN_REASON_GROUPS,
  returnReasonShowsLeatherCode,
} from './utils/warehouseReturnReasons';
import { formatReturnElapsedDuration, returnOrderUnitLabel } from './utils/warehouseReturnOrder';

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--br-border, #ccc)',
  background: 'var(--br-surface, #fff)',
  fontSize: 15,
};

export default function WarehouseReturns() {
  const [products, setProducts] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [assemblyId, setAssemblyId] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [unitLines, setUnitLines] = React.useState([{ reason: '', reason_group: '', leather_code: '' }]);
  const [customerId, setCustomerId] = React.useState('');
  const [receiptSales, setReceiptSales] = React.useState([]);
  const [receiptSaleId, setReceiptSaleId] = React.useState('');
  const [receiptDetail, setReceiptDetail] = React.useState(null);
  const [receiptLineState, setReceiptLineState] = React.useState({});
  const customerReturnMode = Boolean(String(customerId || '').trim());
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [recent, setRecent] = React.useState([]);

  const mapLoadError = (err) => {
    const msg = String(err?.message || '').trim();
    if (/unknown op/i.test(msg)) {
      return 'Returns API is not on the server yet. Deploy the latest backend (warehouse-mobile return ops), then refresh.';
    }
    return msg || 'Failed to load returns data.';
  };

  const loadKitweProductsFromCatalog = React.useCallback(async () => {
    const data = await fetchWarehouseCatalog();
    return buildKitweReturnProductOptions(data.assemblies || [], data.assemblyInventory || []);
  }, []);

  const loadReturnQuoteCustomers = React.useCallback(async () => {
    try {
      const res = await listReturnQuoteCustomers();
      if (res?.customers?.length) return res.customers;
    } catch {
      /* fall through to Firestore (same pool as Quotationer) */
    }
    const { data, error } = await db
      .from('quote_customers')
      .select('id, name, phone')
      .order('name');
    if (error) throw error;
    return (data || [])
      .map((row) => ({
        id: row.id,
        name: String(row.name || '').trim(),
        phone: String(row.phone || '').trim(),
      }))
      .filter((row) => row.id && row.name);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let products = [];
      let productsApiError = '';
      let listRes = { return_orders: [] };
      let customers = [];

      await Promise.all([
        listReturnKitweProducts()
          .then((prodRes) => { products = prodRes?.products || []; })
          .catch((err) => { productsApiError = mapLoadError(err); }),
        listReturnOrders({ trackage_only: false })
          .then((res) => { listRes = res; })
          .catch(() => {}),
        loadReturnQuoteCustomers()
          .then((rows) => { customers = rows; })
          .catch(() => {}),
      ]);

      if (!products.length) {
        try {
          products = await loadKitweProductsFromCatalog();
        } catch (catalogErr) {
          if (productsApiError) throw new Error(productsApiError);
          throw catalogErr;
        }
      }

      setProducts(products);
      setRecent((listRes?.return_orders || []).slice(0, 20));
      setCustomers(customers);
      if (!products.length && productsApiError) {
        setError(`${productsApiError} No Kitwe products with stock were found in the catalog.`);
      }
    } catch (err) {
      setError(mapLoadError(err));
      setProducts([]);
      setRecent([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [loadKitweProductsFromCatalog, loadReturnQuoteCustomers]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!customerReturnMode) {
      setReceiptSaleId('');
      setReceiptDetail(null);
      setReceiptLineState({});
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        let rows = [];
        try {
          const res = await listPosSalesForStorage();
          rows = res?.sales || [];
        } catch {
          /* fallback below */
        }
        if (!rows.length) rows = await loadKitwePosSalesForStoragePage();
        if (!cancelled) setReceiptSales(rows);
      } catch {
        if (!cancelled) setReceiptSales([]);
      }
    })();
    return () => { cancelled = true; };
  }, [customerReturnMode]);

  React.useEffect(() => {
    if (!customerReturnMode || !receiptSaleId) {
      setReceiptDetail(null);
      setReceiptLineState({});
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        let nextDetail = null;
        try {
          const res = await getPosSaleDetailForStorage({ sale_id: receiptSaleId });
          nextDetail = { sale: res?.sale, items: res?.items || [] };
        } catch {
          /* fallback */
        }
        if (!nextDetail?.items?.length) {
          const local = await loadKitwePosSaleDetailForStoragePage(receiptSaleId);
          if (local?.items?.length || !nextDetail?.sale) nextDetail = local;
        }
        if (!nextDetail?.sale) throw new Error('Failed to load receipt.');
        if (cancelled) return;
        setReceiptDetail(nextDetail);
        const next = {};
        for (const line of nextDetail.items || []) {
          next[String(line.id)] = {
            selected: false,
            quantity: line.quantity,
            reason: '',
            reason_group: '',
            leather_code: '',
          };
        }
        setReceiptLineState(next);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load receipt lines.');
          setReceiptDetail(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [customerReturnMode, receiptSaleId]);

  const selectedProduct = products.find((p) => String(p.assembly_id) === String(assemblyId));
  const maxQty = selectedProduct?.kitwe_qty ?? 999;
  const qtyNum = Math.max(1, Math.min(maxQty, Math.floor(Number(quantity) || 1)));

  React.useEffect(() => {
    setUnitLines((prev) => {
      const next = [...prev];
      while (next.length < qtyNum) next.push({ reason: '', reason_group: '', leather_code: '' });
      while (next.length > qtyNum) next.pop();
      return next;
    });
  }, [qtyNum]);

  const applyReasonToAllUnits = (reason, reason_group) => {
    setUnitLines((prev) => prev.map((line) => ({ ...line, reason, reason_group: reason_group || line.reason_group })));
  };

  const reasonGroupFromSelectEvent = (ev) => {
    const sel = ev.target;
    const opt = sel.options?.[sel.selectedIndex];
    return String(opt?.getAttribute('data-group') || '').trim() || null;
  };

  const updateUnitLine = (index, patch) => {
    setUnitLines((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      if (patch.reason != null && !returnReasonShowsLeatherCode(patch.reason)) {
        next.leather_code = '';
      }
      return next;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (customerReturnMode) {
        if (!receiptSaleId) throw new Error('Select a POS receipt number.');
        const selected = (receiptDetail?.items || []).filter(
          (line) => receiptLineState[String(line.id)]?.selected,
        );
        if (!selected.length) throw new Error('Select at least one product from the receipt.');
        const lines = selected.map((line) => {
          const st = receiptLineState[String(line.id)] || {};
          const reason = String(st.reason || '').trim();
          if (!reason) throw new Error(`Choose a return reason for ${line.display_name}.`);
          const qty = Math.max(1, Math.min(line.quantity, Math.floor(Number(st.quantity) || 1)));
          return {
            sale_item_id: line.id,
            quantity: qty,
            reason,
            reason_group: String(st.reason_group || '').trim() || undefined,
            leather_code: String(st.leather_code || '').trim() || undefined,
          };
        });
        const out = await createReturnOrder({
          sale_id: receiptSaleId,
          customer_id: customerId,
          lines,
        });
        const count = out?.return_orders?.length || 1;
        setNotice(
          `Return note ${out?.return_number || ''} created from receipt `
          + `(${count} ${count === 1 ? 'job' : 'jobs'} in workshop Repairs).`,
        );
        setCustomerId('');
        setReceiptSaleId('');
        setReceiptDetail(null);
        setReceiptLineState({});
      } else {
        const lines = unitLines.map((line, index) => {
          const reason = String(line.reason || '').trim();
          if (!reason) throw new Error(`Choose a reason for unit ${index + 1}.`);
          return {
            reason,
            reason_group: String(line.reason_group || '').trim() || undefined,
            leather_code: String(line.leather_code || '').trim() || undefined,
            quantity: 1,
          };
        });
        const out = await createReturnOrder({
          assembly_id: assemblyId,
          lines,
        });
        const count = out?.return_orders?.length || 1;
        setNotice(
          `Return note ${out?.return_number || out?.return_order?.return_number || ''} created `
          + `(${count} separate ${count === 1 ? 'job' : 'jobs'} in Production). Kitwe stock reduced; repaired units return to Floor 1 until shipped back to Kitwe.`,
        );
        setAssemblyId('');
        setUnitLines([{ reason: '', reason_group: '', leather_code: '' }]);
        setQuantity(1);
      }
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to create return.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>Loading Kitwe products…</div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Kitwe product returns</h2>
      <p style={{ color: 'var(--br-text-muted, #666)', marginBottom: 20 }}>
        {customerReturnMode
          ? 'With a customer selected, choose their POS receipt and the sold lines to return — workshop Repairs queues by department (Upholstery, Carpentry, Painting).'
          : 'Without a customer, pick a Kitwe catalog product. Kitwe stock is deducted on create. After repair, the unit stays on Floor 1 (shown as awaiting Hassan ship-back) until production sends a WHR delivery and Hassan accepts it on Warehouse Deliveries.'}
      </p>

      {error ? (
        <div style={{ background: '#ffeaea', border: '1px solid #f5a', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div style={{ background: '#e8f8ef', border: '1px solid #8c8', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Customer (optional)</span>
          <select
            value={customerId}
            onChange={(ev) => {
              setCustomerId(ev.target.value);
              setAssemblyId('');
            }}
            style={fieldStyle}
            disabled={loading || !customers.length}
          >
            <option value="">
              {customers.length
                ? 'No customer — Kitwe catalog product'
                : 'Add customers under Quotationer → Manage Customers, then refresh'}
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` · ${c.phone}` : ''}
              </option>
            ))}
          </select>
        </label>

        {customerReturnMode ? (
          <>
            <label>
              <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>POS receipt number (required)</span>
              <select
                required
                value={receiptSaleId}
                onChange={(ev) => setReceiptSaleId(ev.target.value)}
                style={fieldStyle}
              >
                <option value="">Choose receipt…</option>
                {receiptSales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.receipt_number}
                    {s.sale_date ? ` · ${String(s.sale_date).slice(0, 10)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {receiptDetail?.items?.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <span style={{ fontWeight: 700 }}>Products on receipt</span>
                {receiptDetail.items.map((line) => {
                  const st = receiptLineState[String(line.id)] || {};
                  return (
                    <div
                      key={line.id}
                      style={{
                        border: '1px solid var(--br-border, #ddd)',
                        borderRadius: 10,
                        padding: 12,
                        background: 'var(--br-surface, #fafafa)',
                      }}
                    >
                      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(st.selected)}
                          onChange={(ev) => {
                            setReceiptLineState((prev) => ({
                              ...prev,
                              [String(line.id)]: { ...prev[String(line.id)], selected: ev.target.checked },
                            }));
                          }}
                        />
                        <span><strong>{line.display_name}</strong> (sold {line.quantity})</span>
                      </label>
                      {st.selected ? (
                        <>
                          <label style={{ display: 'block', marginTop: 10 }}>
                            <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Qty to return</span>
                            <input
                              type="number"
                              min={1}
                              max={line.quantity}
                              value={st.quantity ?? line.quantity}
                              onChange={(ev) => {
                                setReceiptLineState((prev) => ({
                                  ...prev,
                                  [String(line.id)]: { ...prev[String(line.id)], quantity: ev.target.value },
                                }));
                              }}
                              style={fieldStyle}
                            />
                          </label>
                          <label style={{ display: 'block', marginTop: 10 }}>
                            <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Reason</span>
                            <select
                              required
                              value={st.reason || ''}
                              onChange={(ev) => {
                                const reason = ev.target.value;
                                const reason_group = reasonGroupFromSelectEvent(ev);
                                setReceiptLineState((prev) => ({
                                  ...prev,
                                  [String(line.id)]: {
                                    ...prev[String(line.id)],
                                    reason,
                                    reason_group,
                                    leather_code: returnReasonShowsLeatherCode(reason) ? prev[String(line.id)]?.leather_code : '',
                                  },
                                }));
                              }}
                              style={fieldStyle}
                            >
                              <option value="">Choose reason…</option>
                              {WAREHOUSE_RETURN_REASON_GROUPS.map((group) => (
                                <optgroup key={group.id} label={group.label}>
                                  {group.reasons.map((r) => (
                                    <option key={`${group.id}-${r}-${line.id}`} value={r} data-group={group.id}>{r}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </label>
                          {returnReasonShowsLeatherCode(st.reason) ? (
                            <label style={{ display: 'block', marginTop: 10 }}>
                              <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Leather code (optional)</span>
                              <input
                                type="text"
                                value={st.leather_code || ''}
                                onChange={(ev) => {
                                  setReceiptLineState((prev) => ({
                                    ...prev,
                                    [String(line.id)]: { ...prev[String(line.id)], leather_code: ev.target.value },
                                  }));
                                }}
                                style={fieldStyle}
                              />
                            </label>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <>
        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Product (Kitwe)</span>
          <select
            required
            value={assemblyId}
            onChange={(ev) => setAssemblyId(ev.target.value)}
            style={fieldStyle}
          >
            <option value="">Choose product…</option>
            {products.map((p) => (
              <option key={p.assembly_id} value={p.assembly_id}>
                {p.name} (Kitwe qty: {p.kitwe_qty})
              </option>
            ))}
          </select>
          {!products.length ? (
            <p style={{ marginTop: 8, color: 'var(--br-text-muted, #666)', fontSize: 14 }}>
              No Kitwe warehouse products with stock yet. Accept a factory delivery or add stock on Kitwe Products first.
            </p>
          ) : null}
        </label>

        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Quantity</span>
          <input
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(ev) => setQuantity(ev.target.value)}
            style={fieldStyle}
            required
          />
        </label>

        {qtyNum > 1 ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>Reason per unit ({qtyNum})</span>
              <button
                type="button"
                onClick={() => {
                  const first = String(unitLines[0]?.reason || '').trim();
                  const group = String(unitLines[0]?.reason_group || '').trim();
                  if (first) applyReasonToAllUnits(first, group);
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--br-border, #ccc)',
                  background: 'var(--br-surface, #fff)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Copy unit 1 reason to all
              </button>
            </div>
            {unitLines.map((line, index) => (
              <div
                key={`unit-${index}`}
                style={{
                  border: '1px solid var(--br-border, #ddd)',
                  borderRadius: 10,
                  padding: 12,
                  background: 'var(--br-surface, #fafafa)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Unit {index + 1}</div>
                <label>
                  <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Reason</span>
                  <select
                    required
                    value={line.reason}
                    onChange={(ev) => {
                      const reason = ev.target.value;
                      const reason_group = reasonGroupFromSelectEvent(ev);
                      updateUnitLine(index, { reason, reason_group });
                    }}
                    style={fieldStyle}
                  >
                    <option value="">Choose reason…</option>
                    {WAREHOUSE_RETURN_REASON_GROUPS.map((group) => (
                      <optgroup key={group.id} label={group.label}>
                        {group.reasons.map((r) => (
                          <option key={`${group.id}-${r}-${index}`} value={r} data-group={group.id}>{r}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {returnReasonShowsLeatherCode(line.reason) ? (
                  <label style={{ display: 'block', marginTop: 10 }}>
                    <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Leather code (optional)</span>
                    <input
                      type="text"
                      value={line.leather_code}
                      onChange={(ev) => updateUnitLine(index, { leather_code: ev.target.value })}
                      style={fieldStyle}
                      placeholder="e.g. LC-204"
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <>
            <label>
              <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Reason for return</span>
              <select
                required
                value={unitLines[0]?.reason || ''}
                onChange={(ev) => {
                  const reason = ev.target.value;
                  const reason_group = reasonGroupFromSelectEvent(ev);
                  updateUnitLine(0, { reason, reason_group });
                }}
                style={fieldStyle}
              >
                <option value="">Choose reason…</option>
                {WAREHOUSE_RETURN_REASON_GROUPS.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.reasons.map((r) => (
                      <option key={`${group.id}-${r}`} value={r} data-group={group.id}>{r}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {returnReasonShowsLeatherCode(unitLines[0]?.reason) ? (
              <label>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Leather code (optional)</span>
                <input
                  type="text"
                  value={unitLines[0]?.leather_code || ''}
                  onChange={(ev) => updateUnitLine(0, { leather_code: ev.target.value })}
                  style={fieldStyle}
                  placeholder="e.g. LC-204"
                />
              </label>
            ) : null}
          </>
        )}
          </>
        )}

        <button
          type="submit"
          disabled={
            busy
            || (customerReturnMode
              ? !receiptSaleId
              : !assemblyId || unitLines.some((l) => !String(l.reason || '').trim()))
          }
          style={{
            padding: '12px 18px',
            fontWeight: 700,
            borderRadius: 8,
            border: 'none',
            background: '#0f7fff',
            color: '#fff',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Submitting…' : 'Create return order'}
        </button>
      </form>

      {recent.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h3>Recent returns</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {recent.map((row) => (
              <li
                key={row.id}
                style={{
                  border: '1px solid var(--br-border, #ddd)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: 'var(--br-surface, #fafafa)',
                }}
              >
                <strong>{returnOrderUnitLabel(row)}</strong>
                {' · '}{row.assembly_name} × {row.quantity}
                <br />
                <span style={{ color: '#666', fontSize: 14 }}>
                  {row.reason} · {row.status.replace(/_/g, ' ')}
                  {row.work_started_at && !row.work_completed_at
                    ? ` · in progress ${formatReturnElapsedDuration(row.work_started_at)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
