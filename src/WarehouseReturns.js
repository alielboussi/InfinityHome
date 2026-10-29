import React from 'react';
import {
  createReturnOrder,
  listReturnKitweProducts,
  listReturnOrders,
  listReturnQuoteCustomers,
} from './services/warehouseDeliveryMobileApi';
import { WAREHOUSE_RETURN_REASON_GROUPS } from './utils/warehouseReturnReasons';
import { formatReturnElapsedDuration } from './utils/warehouseReturnOrder';

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
  const [reason, setReason] = React.useState('');
  const [leatherCode, setLeatherCode] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [customerId, setCustomerId] = React.useState('');
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

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prodRes, listRes, custRes] = await Promise.all([
        listReturnKitweProducts(),
        listReturnOrders({ trackage_only: false }),
        listReturnQuoteCustomers(),
      ]);
      setProducts(prodRes?.products || []);
      setRecent((listRes?.return_orders || []).slice(0, 20));
      setCustomers(custRes?.customers || []);
    } catch (err) {
      setError(mapLoadError(err));
      setProducts([]);
      setRecent([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const selectedProduct = products.find((p) => String(p.assembly_id) === String(assemblyId));
  const maxQty = selectedProduct?.kitwe_qty ?? 999;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const out = await createReturnOrder({
        assembly_id: assemblyId,
        reason,
        leather_code: leatherCode.trim() || undefined,
        quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
        customer_id: customerId || undefined,
      });
      setNotice(`Return ${out?.return_order?.return_number || ''} created. Kitwe stock updated; factory stock adds when repair is completed.`);
      setAssemblyId('');
      setReason('');
      setLeatherCode('');
      setQuantity(1);
      setCustomerId('');
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
        Select a warehouse product with Kitwe stock (not sets). Quantity is deducted from Kitwe when the return is created; factory warehouse stock is added when production taps Complete (repair done). Ship back to Kitwe uses driver signature on step 5.
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
        </label>

        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Reason for return</span>
          <select
            required
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            style={fieldStyle}
          >
            <option value="">Choose reason…</option>
            {WAREHOUSE_RETURN_REASON_GROUPS.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.reasons.map((r) => (
                  <option key={`${group.id}-${r}`} value={r}>{r}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Leather code (optional)</span>
          <input
            type="text"
            value={leatherCode}
            onChange={(ev) => setLeatherCode(ev.target.value)}
            style={fieldStyle}
            placeholder="e.g. LC-204"
          />
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

        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Customer (optional)</span>
          <select
            value={customerId}
            onChange={(ev) => setCustomerId(ev.target.value)}
            style={fieldStyle}
            disabled={loading || !customers.length}
          >
            <option value="">
              {customers.length ? 'No customer' : 'No quote customers found'}
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` · ${c.phone}` : ''}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={busy || !assemblyId || !reason}
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
                <strong>{row.return_number}</strong> · {row.assembly_name} × {row.quantity}
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
