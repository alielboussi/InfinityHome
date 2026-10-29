import React from 'react';
import { listReturnOrders } from './services/warehouseDeliveryMobileApi';
import { formatReturnElapsedDuration } from './utils/warehouseReturnOrder';

export default function WarehouseReturnsTrackage() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listReturnOrders({ trackage_only: true });
      setRows(res?.return_orders || []);
    } catch (err) {
      setError(err?.message || 'Failed to load trackage.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 20 }}>Loading trackage…</div>;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Returns trackage</h2>
      <p style={{ color: 'var(--br-text-muted, #666)' }}>
        Time from factory accept to completion (repair turnaround).
      </p>
      {error ? (
        <div style={{ background: '#ffeaea', padding: 12, borderRadius: 8, marginBottom: 12 }}>{error}</div>
      ) : null}
      {!rows.length ? (
        <p>No completed returns yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((row) => {
            const elapsed = formatReturnElapsedDuration(
              row.work_started_at || row.accepted_at,
              row.work_completed_at,
            );
            return (
              <article
                key={row.id}
                style={{
                  border: '1px solid var(--br-border, #ddd)',
                  borderRadius: 10,
                  padding: 14,
                  background: 'var(--br-surface, #fff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{row.return_number}</strong>
                  <span style={{ fontWeight: 700, color: '#0369a1' }}>{elapsed}</span>
                </div>
                <div style={{ marginTop: 6 }}>{row.assembly_name} × {row.quantity}</div>
                <div style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
                  Reason: {row.reason}
                  {row.customer_name ? ` · ${row.customer_name}` : ''}
                  {row.leather_code ? ` · Leather: ${row.leather_code}` : ''}
                </div>
                <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
                  Status: {row.status.replace(/_/g, ' ')}
                  {row.outbound_delivery_number ? ` · Shipment ${row.outbound_delivery_number}` : ''}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
