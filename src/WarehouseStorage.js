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

function lineMaxSendQty(line) {
  const sold = Math.max(0, Number(line?.sold_quantity ?? line?.quantity) || 0);
  const remaining = line?.remaining_to_send;
  if (remaining != null && Number.isFinite(Number(remaining))) {
    return Math.max(0, Math.floor(Number(remaining)));
  }
  return sold;
}

function emptyLineState(line) {
  const max = lineMaxSendQty(line);
  return {
    selected: false,
    quantity: max > 0 ? Math.min(max, 1) : 0,
  };
}

export default function WarehouseStorage() {
  const [sales, setSales] = React.useState([]);
  const [saleId, setSaleId] = React.useState('');
  const [detail, setDetail] = React.useState(null);
  const [lineState, setLineState] = React.useState({});
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
      setLineState({});
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
        const nextState = {};
        for (const line of nextDetail.items || []) {
          nextState[String(line.id)] = emptyLineState(line);
        }
        setLineState(nextState);
        if (!nextDetail.items?.length) {
          setError('This receipt has no sale lines to send to warehouse.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load receipt.');
          setDetail(null);
          setLineState({});
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [saleId]);

  const selectedLines = (detail?.items || []).filter(
    (line) => lineState[String(line.id)]?.selected,
  );

  const handleSend = async (e) => {
    e.preventDefault();
    if (!saleId || !selectedLines.length) {
      setError('Select a receipt and at least one product line.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const lines = selectedLines
        .filter((line) => lineMaxSendQty(line) > 0)
        .map((line) => {
        const st = lineState[String(line.id)] || {};
        const max = lineMaxSendQty(line);
        const qty = Math.max(1, Math.min(max, Math.floor(Number(st.quantity) || 1)));
        return { sale_item_id: line.id, quantity: qty };
      });
      const out = await submitStorageSend({ sale_id: saleId, lines });
      const sends = out?.storage_sends || (out?.storage_send ? [out.storage_send] : []);
      const numbers = sends.map((s) => s.storage_number).filter(Boolean).join(', ');
      const totalLabels = Math.max(
        0,
        Number(out?.total_labels_printed)
          || sends.reduce((n, s) => n + Math.max(0, Number(s.labels_printed) || 0), 0),
      );
      setNotice(
        numbers
          ? `${numbers} sent to Floor 1 (${totalLabels} label${totalLabels === 1 ? '' : 's'} on Zebra).`
          : 'Sent to Floor 1. Labels printed.',
      );
      setLineState((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = { ...next[key], selected: false };
        }
        return next;
      });
    } catch (err) {
      setError(err?.message || 'Send failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="warehouse-storage-page">
      <p className="warehouse-storage-page__intro">
        Choose a Kitwe POS receipt, select one or more sold lines, and send quantity to Floor 1 stock.
        Existing SKUs increase quantity; new products are created on Floor 1. Zebra labels print automatically
        (Code 128 SKU, product name, customer, sale date).
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

      {detail?.items?.length ? (
        <form onSubmit={handleSend}>
          <p style={{ fontWeight: 700, marginBottom: 10 }}>Products on receipt</p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {detail.items.map((line) => {
              const st = lineState[String(line.id)] || emptyLineState(line);
              const maxSend = lineMaxSendQty(line);
              const sold = Math.max(0, Number(line.sold_quantity ?? line.quantity) || 0);
              const alreadySent = Math.max(0, Number(line.already_sent) || 0);
              const fullySent = maxSend < 1;
              return (
                <div
                  key={line.id}
                  style={{
                    border: '1px solid var(--br-border, #ddd)',
                    borderRadius: 10,
                    padding: 12,
                    opacity: fullySent ? 0.6 : 1,
                    background: st.selected ? 'var(--br-surface-elevated, #f0f9ff)' : 'var(--br-surface, #fff)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: fullySent ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="checkbox"
                      disabled={fullySent}
                      checked={Boolean(st.selected)}
                      onChange={(ev) => {
                        setLineState((prev) => ({
                          ...prev,
                          [String(line.id)]: {
                            ...(prev[String(line.id)] || emptyLineState(line)),
                            selected: ev.target.checked,
                          },
                        }));
                      }}
                      style={{ marginTop: 4 }}
                    />
                    <span>
                      <strong>{line.display_name}</strong>
                      <span style={{ color: 'var(--br-muted)', marginLeft: 8 }}>
                        sold {sold}
                        {alreadySent > 0 ? ` · sent ${alreadySent}` : ''}
                        {maxSend > 0 ? ` · send 1–${maxSend}` : ' · fully sent'}
                        {line.is_set && maxSend > 0
                          ? ` · ${line.labels_per_send_unit || 1} component label(s) per set`
                          : ''}
                      </span>
                    </span>
                  </label>
                  {st.selected && maxSend > 0 ? (
                    <label style={{ display: 'block', marginTop: 10, marginLeft: 28 }}>
                      <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Qty to Floor 1</span>
                      <input
                        type="number"
                        min={1}
                        max={maxSend}
                        style={{ ...fieldStyle, maxWidth: 120 }}
                        value={st.quantity}
                        onChange={(ev) => {
                          const raw = ev.target.value;
                          const n = Math.floor(Number(raw) || 1);
                          const clamped = Math.min(maxSend, Math.max(1, n));
                          setLineState((prev) => ({
                            ...prev,
                            [String(line.id)]: {
                              ...(prev[String(line.id)] || emptyLineState(line)),
                              quantity: raw === '' ? '' : clamped,
                            },
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={busy || !selectedLines.length}
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
              opacity: busy || !selectedLines.length ? 0.6 : 1,
            }}
          >
            <FaShareSquare aria-hidden />
            Send To Warehouse
          </button>
        </form>
      ) : null}

      {!loading && !sales.length ? (
        <p style={{ color: 'var(--br-muted)' }}>No Kitwe POS receipts found.</p>
      ) : null}
    </div>
  );
}
