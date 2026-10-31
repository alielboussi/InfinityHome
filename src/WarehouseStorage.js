import React from 'react';
import { FaShareSquare } from 'react-icons/fa';
import {
  getPosSaleDetailForStorage,
  listPosSalesForStorage,
  submitStorageSend,
} from './services/warehouseDeliveryMobileApi';
import { loadKitwePosSalesForStoragePage, loadKitwePosSaleDetailForStoragePage } from './utils/warehouseStoragePosSales';

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--br-border, #ccc)',
  background: 'var(--br-surface, #fff)',
  fontSize: 15,
};

export default function WarehouseStorage() {
  const [sales, setSales] = React.useState([]);
  const [saleId, setSaleId] = React.useState('');
  const [detail, setDetail] = React.useState(null);
  const [saleItemId, setSaleItemId] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const loadSales = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let rows = [];
      try {
        const res = await listPosSalesForStorage();
        rows = res?.sales || [];
      } catch {
        /* API may be undeployed or 403 — read Kitwe POS receipts directly */
      }
      if (!rows.length) {
        rows = await loadKitwePosSalesForStoragePage();
      }
      setSales(rows);
    } catch (err) {
      setError(err?.message || 'Failed to load POS receipts.');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadSales(); }, [loadSales]);

  React.useEffect(() => {
    if (!saleId) {
      setDetail(null);
      setSaleItemId('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setError('');
      try {
        let nextDetail = null;
        try {
          const res = await getPosSaleDetailForStorage({ sale_id: saleId });
          nextDetail = {
            sale: res?.sale,
            items: res?.items || [],
          };
        } catch {
          /* API may be undeployed — load from Firestore like the receipt list fallback */
        }
        if (!nextDetail?.items?.length) {
          try {
            const local = await loadKitwePosSaleDetailForStoragePage(saleId);
            if (local?.items?.length || !nextDetail?.sale) nextDetail = local;
          } catch (localErr) {
            if (!nextDetail?.sale) throw localErr;
          }
        }
        if (!nextDetail?.sale) throw new Error('Failed to load receipt.');
        if (cancelled) return;
        setDetail(nextDetail);
        setSaleItemId('');
        setQuantity(1);
        if (!nextDetail.items?.length) {
          setError('This receipt has no sale lines to send to warehouse.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load receipt.');
          setDetail(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [saleId]);

  const selectedLine = detail?.items?.find((i) => String(i.id) === String(saleItemId));
  const maxQty = selectedLine?.quantity ?? 1;

  React.useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!saleId || !saleItemId) {
      setError('Select a receipt line.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const out = await submitStorageSend({
        sale_id: saleId,
        sale_item_id: saleItemId,
        quantity: Math.max(1, Math.min(maxQty, Math.floor(Number(quantity) || 1))),
      });
      const sn = out?.storage_send?.storage_number || '';
      setNotice(
        sn
          ? `${sn} sent to factory warehouse. Zebra labels printed (${out?.storage_send?.quantity || quantity}×).`
          : 'Sent to warehouse. Labels printed.',
      );
      setSaleItemId('');
      setQuantity(1);
    } catch (err) {
      setError(err?.message || 'Send failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-pad" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>Warehouse Storage</h1>
      <p style={{ color: 'var(--br-muted, #64748b)', marginBottom: 20, lineHeight: 1.5 }}>
        Choose a Kitwe POS receipt, pick a sold line, and send quantity to factory warehouse stock.
        Labels print on the Zebra printer automatically.
      </p>

      {error ? <p style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</p> : null}
      {notice ? <p style={{ color: '#047857', marginBottom: 12 }}>{notice}</p> : null}

      {loading ? <p>Loading receipts…</p> : (
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>Receipt number</span>
          <select
            style={fieldStyle}
            value={saleId}
            onChange={(ev) => setSaleId(ev.target.value)}
          >
            <option value="">— Select receipt —</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.receipt_number}
                {s.sale_date ? ` · ${String(s.sale_date).slice(0, 10)}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {detailLoading ? <p>Loading receipt lines…</p> : null}

      {detail?.sale ? (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: 'var(--br-surface-elevated, #f8fafc)' }}>
          <div><strong>Receipt:</strong> {detail.sale.receipt_number}</div>
          {detail.sale.customer_name ? (
            <div><strong>Customer:</strong> {detail.sale.customer_name}{detail.sale.customer_phone ? ` · ${detail.sale.customer_phone}` : ''}</div>
          ) : null}
        </div>
      ) : null}

      {detail?.sale && !detailLoading && !detail?.items?.length && !error ? (
        <p style={{ color: 'var(--br-muted)' }}>No product lines on this receipt.</p>
      ) : null}

      {detail?.items?.length ? (
        <form onSubmit={handleSend}>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>Sale line</span>
            <select
              style={fieldStyle}
              value={saleItemId}
              onChange={(ev) => {
                setSaleItemId(ev.target.value);
                const line = detail.items.find((i) => String(i.id) === ev.target.value);
                setQuantity(line?.quantity ?? 1);
              }}
              required
            >
              <option value="">— Select product —</option>
              {detail.items.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.display_name} (sold {line.quantity})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>Qty to send to warehouse</span>
            <input
              type="number"
              min={1}
              max={maxQty}
              style={fieldStyle}
              value={quantity}
              onChange={(ev) => setQuantity(ev.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={busy || !saleItemId}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 20px',
              borderRadius: 10,
              border: 'none',
              background: '#0369a1',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            <FaShareSquare aria-hidden />
            Send to warehouse
          </button>
        </form>
      ) : null}

      {!loading && !sales.length ? (
        <p style={{ color: 'var(--br-muted)' }}>No Kitwe POS receipts found.</p>
      ) : null}
    </div>
  );
}
