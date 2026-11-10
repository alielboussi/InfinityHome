import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import { listDeliveryProductionQueue, listReturnOrders } from './services/warehouseDeliveryMobileApi';
import { formatWarehouseAdminDateTime } from './utils/warehouseAdminFormat';
import {
  DELIVERY_ADMIN_HOLD_LABEL,
  deliveryAdminInventoryFootnote,
  deliveryAdminStageLabel,
  isCompletedAwaitingDelivery,
  orderAdminStatusDisplay,
  readDeliveryAdminMeta,
  repairAdminStatusDisplay,
  repairOnDeliveryAdminVirtualHold,
  orderOnDeliveryAdminVirtualHold,
} from './utils/warehouseDeliveryAdminQueue';
import {
  REPAIR_DEPARTMENTS,
  repairDepartmentLabel,
  resolveReturnRepairDepartment,
} from './utils/warehouseReturnRepairDepartment';

function InventoryHoldNote({ text }) {
  if (!text) return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px dashed #94a3b8',
        background: '#f1f5f9',
        fontSize: 13,
        color: '#334155',
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {text}
    </div>
  );
}

function stageBadge(stage, kind) {
  const label = deliveryAdminStageLabel(stage, kind);
  const colors = {
    awaiting_driver: { bg: '#fef3c7', fg: '#92400e' },
    collected_by_driver: { bg: '#dbeafe', fg: '#1e40af' },
    delivery_completed: { bg: '#dcfce7', fg: '#166534' },
    in_progress: { bg: '#f1f5f9', fg: '#334155' },
  };
  const c = colors[String(stage || '').toLowerCase()] || { bg: '#f1f5f9', fg: '#334155' };
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 12,
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: 6,
      background: c.bg,
      color: c.fg,
    }}
    >
      {label}
    </span>
  );
}

function RepairAdminCard({ row }) {
  const admin = readDeliveryAdminMeta(row);
  const stage = admin?.stage || row.delivery_admin_stage
    || (row.status === 'in_progress' ? 'in_progress' : null);
  const statusLabel = repairAdminStatusDisplay(row);
  const useAwaitingStyle = isCompletedAwaitingDelivery(row);
  const holdNote = deliveryAdminInventoryFootnote(row, 'repair');
  return (
    <article
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
          {stage && !useAwaitingStyle ? stageBadge(stage, 'repair') : (
            <div style={{
              fontWeight: 600,
              color: useAwaitingStyle ? '#92400e' : undefined,
            }}
            >
              {statusLabel}
            </div>
          )}
          {row.outbound_delivery_number ? (
            <div style={{ color: 'var(--dash-muted)', fontSize: 14, marginTop: 4 }}>
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
        {row.customer_phone ? ` · ${row.customer_phone}` : ''}
      </div>
      <InventoryHoldNote text={holdNote} />
    </article>
  );
}

function OrderAdminCard({ row }) {
  const statusLabel = orderAdminStatusDisplay(row);
  const holdNote = deliveryAdminInventoryFootnote(row, 'order');
  return (
    <article
      style={{
        border: '1px solid var(--dash-border-soft)',
        borderRadius: 10,
        padding: 16,
        background: 'var(--dash-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{row.quote_number || row.production_job_id || row.assembly_id}</div>
          <div style={{ color: 'var(--dash-muted)', marginTop: 4 }}>
            {String(row.department || 'production').toUpperCase()}
          </div>
        </div>
        <div style={{ fontWeight: 600, color: '#92400e', textAlign: 'right' }}>{statusLabel}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <strong>{row.assembly_name}</strong>
        {row.family_sku ? ` · ${row.family_sku}` : ''}
        {' · Qty '}
        {row.quantity}
      </div>
      <InventoryHoldNote text={holdNote} />
    </article>
  );
}

function holdSummaryLine(rows, kind) {
  const n = rows.filter((row) => (
    kind === 'order' ? orderOnDeliveryAdminVirtualHold(row) : repairOnDeliveryAdminVirtualHold(row)
  )).length;
  if (n < 1) return null;
  return `${n} ${n === 1 ? 'unit' : 'units'} ${DELIVERY_ADMIN_HOLD_LABEL.toLowerCase()}`;
}

export default function WarehouseRepairsAdmin() {
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let loadError = '';
      try {
        const res = await listReturnOrders({ admin_registry: true });
        setRows(res?.return_orders || []);
      } catch (err) {
        loadError = err?.message || 'Failed to load repair registry.';
        setRows([]);
      }
      try {
        const queue = await listDeliveryProductionQueue();
        setOrders(queue?.orders || []);
      } catch {
        if (!loadError) {
          loadError = 'Repair list loaded but the delivery queue API failed — deploy latest API or retry.';
        }
        setOrders([]);
      }
      setError(loadError);
    } catch (err) {
      setError(err?.message || 'Failed to load repairs.');
      setRows([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const dept = resolveReturnRepairDepartment(row);
      const admin = readDeliveryAdminMeta(row);
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
        dept,
        repairDepartmentLabel(dept),
        admin?.stage,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((row) => (
      [row.assembly_name, row.family_sku, row.department, row.quote_number, row.production_job_id]
        .join(' ').toLowerCase().includes(q)
    ));
  }, [orders, search]);

  const byDepartment = useMemo(() => {
    const buckets = Object.fromEntries(REPAIR_DEPARTMENTS.map((d) => [d.id, []]));
    for (const row of filtered) {
      const dept = row.repair_department || resolveReturnRepairDepartment(row);
      if (buckets[dept]) buckets[dept].push(row);
      else buckets.upholstery.push(row);
    }
    return buckets;
  }, [filtered]);

  const orderHoldSummary = holdSummaryLine(filteredOrders, 'order');

  const repairHoldSummaryByDept = useMemo(() => {
    const out = {};
    for (const dept of REPAIR_DEPARTMENTS) {
      const sectionRows = byDepartment[dept.id] || [];
      const line = holdSummaryLine(sectionRows, 'repair');
      if (line) out[dept.id] = line;
    }
    return out;
  }, [byDepartment]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dash-bg)', color: 'var(--dash-text)', padding: 24 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Repairs &amp; delivery queue</h1>
      </div>
      <p style={{ color: 'var(--dash-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Registry for Kitwe returns and finished production orders. Workshop complete →
        {' '}
        <strong>ready for delivery</strong>
        {' '}
        in the Delivery app →
        {' '}
        <strong>collected by driver</strong>
        {' '}
        (signature) →
        {' '}
        <strong>completed</strong>
        {' '}
        when Hassan accepts. No Floor 1 / Floor 2 stock is credited for these lines.
      </p>

      <input
        type="search"
        placeholder="Search return #, product, sender, customer, order…"
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

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Production orders (Delivery app)</h2>
        {orderHoldSummary ? (
          <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 14 }}>{orderHoldSummary}</p>
        ) : (
          <div style={{ marginBottom: 12 }} />
        )}
        {!loading && filteredOrders.length === 0 ? (
          <div style={{ color: 'var(--dash-muted)' }}>No orders awaiting driver.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredOrders.map((row) => (
              <OrderAdminCard key={`${row.assembly_id}-${row.production_job_id || row.quote_id}`} row={row} />
            ))}
          </div>
        )}
      </section>

      {!loading && filtered.length === 0 && (
        <div style={{ color: 'var(--dash-muted)' }}>No repair records found.</div>
      )}

      {REPAIR_DEPARTMENTS.map((dept) => {
        const sectionRows = byDepartment[dept.id] || [];
        if (!sectionRows.length && !loading) return null;
        return (
          <section key={dept.id} style={{ marginBottom: 32 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{dept.label}</h2>
            {repairHoldSummaryByDept[dept.id] ? (
              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 14 }}>
                {repairHoldSummaryByDept[dept.id]}
              </p>
            ) : (
              <div style={{ marginBottom: 12 }} />
            )}
            {sectionRows.length === 0 ? (
              <div style={{ color: 'var(--dash-muted)', marginBottom: 8 }}>No repairs in this department.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {sectionRows.map((row) => (
                  <RepairAdminCard key={row.id} row={row} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
