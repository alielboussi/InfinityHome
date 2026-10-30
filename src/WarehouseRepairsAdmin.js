import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import { listReturnOrders } from './services/warehouseDeliveryMobileApi';
import { formatWarehouseAdminDateTime } from './utils/warehouseAdminFormat';

export default function WarehouseRepairsAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listReturnOrders({ admin_registry: true });
      setRows(res?.return_orders || []);
    } catch (err) {
      setError(err?.message || 'Failed to load repairs.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.return_number,
        row.assembly_name,
        row.assembly_sku,
        row.created_by_name,
        row.created_by_email,
        row.reason,
        row.customer_name,
        row.leather_code,
        row.status,
        row.outbound_delivery_number,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dash-bg)', color: 'var(--dash-text)', padding: 24 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Repairs</h1>
      </div>
      <p style={{ color: 'var(--dash-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Kitwe returns submitted by Hassan Awad. Kitwe stock is reduced when a return is created;
        factory warehouse stock increases when production completes the repair.
      </p>

      <input
        type="search"
        placeholder="Search return #, product, sender, customer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          minWidth: 280,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--dash-border)',
          background: 'var(--dash-surface-2)',
          color: 'var(--dash-text)',
          marginBottom: 16,
        }}
      />

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: 'var(--dash-muted)' }}>No repair records found.</div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {filtered.map((row) => (
          <article
            key={row.id}
            style={{
              border: '1px solid var(--dash-border-soft)',
              borderRadius: 10,
              padding: 16,
              background: 'var(--dash-surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{row.return_number || row.id}</div>
                <div style={{ color: 'var(--dash-muted)', marginTop: 4 }}>
                  {formatWarehouseAdminDateTime(row.created_at)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{String(row.status || '').replace(/_/g, ' ')}</div>
                {row.outbound_delivery_number ? (
                  <div style={{ color: 'var(--dash-muted)', fontSize: 14 }}>
                    Shipment {row.outbound_delivery_number}
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <strong>{row.assembly_name}</strong>
              {row.assembly_sku ? ` · ${row.assembly_sku}` : ''}
              {' · Qty '}
              {row.quantity}
            </div>
            <div style={{ color: 'var(--dash-muted)', marginTop: 6 }}>
              Sent by: {row.created_by_name || row.created_by_email || '—'}
            </div>
            <div style={{ color: 'var(--dash-muted)', marginTop: 4 }}>
              Reason: {row.reason || '—'}
              {row.leather_code ? ` · Leather: ${row.leather_code}` : ''}
              {row.customer_name ? ` · Customer: ${row.customer_name}` : ''}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
