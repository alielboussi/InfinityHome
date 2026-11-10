import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import { listReturnOrders } from './services/warehouseDeliveryMobileApi';
import { formatWarehouseAdminDateTime } from './utils/warehouseAdminFormat';
import { formatReturnElapsedDuration, returnOrderLifecycleBadge } from './utils/warehouseReturnOrder';
import {
  deliveryAdminStageLabel,
  readDeliveryAdminMeta,
} from './utils/warehouseDeliveryAdminQueue';
import {
  REPAIR_DEPARTMENTS,
  repairDepartmentLabel,
  resolveReturnRepairDepartment,
} from './utils/warehouseReturnRepairDepartment';

import { formatProductionElapsed } from './utils/formatProductionElapsed';


function TrackageCard({ row }) {
  const admin = readDeliveryAdminMeta(row);
  const deliveryStage = admin?.stage ? deliveryAdminStageLabel(admin.stage, 'repair') : '';
  const dept = row.repair_department || resolveReturnRepairDepartment(row);
  const completed = row.work_completed_at
    ? formatReturnElapsedDuration(
      row.work_started_at || row.accepted_at,
      row.work_completed_at,
    )
    : null;
  const liveTimer = row.status === 'in_progress' && row.elapsed_ms != null
    ? formatProductionElapsed(row.elapsed_ms)
    : null;
  const meta = row.metadata || {};
  const batchIndex = Number(meta.batch_line_index) || 0;
  const batchCount = Number(meta.batch_line_count) || 0;
  const unitLabel = batchCount > 1 && batchIndex > 0
    ? `${row.return_number} · unit ${batchIndex}/${batchCount}`
    : row.return_number;

  return (
    <article
      style={{
        border: '1px solid var(--dash-border-soft, #ddd)',
        borderRadius: 10,
        padding: 14,
        background: 'var(--dash-surface, #fff)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{unitLabel}</div>
          <div style={{ color: 'var(--dash-muted, #666)', fontSize: 14, marginTop: 4 }}>
            {formatWarehouseAdminDateTime(row.created_at)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'var(--dash-surface-2, #f1f5f9)',
            marginBottom: 6,
          }}
          >
            {repairDepartmentLabel(dept)}
          </div>
          <div style={{ fontWeight: 600 }}>{String(row.status || '').replace(/_/g, ' ')}</div>
          {deliveryStage ? (
            <div style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: '#e0f2fe',
              color: '#0369a1',
              marginTop: 6,
            }}
            >
              {deliveryStage}
            </div>
          ) : null}
          {liveTimer ? (
            <div style={{ color: '#0369a1', fontWeight: 700, marginTop: 4 }}>
              ⏱ {liveTimer}
              {row.timer_status === 'paused' ? ' (paused)' : row.timer_status === 'running' ? ' (running)' : ''}
            </div>
          ) : null}
          {completed ? (
            <div style={{ color: '#0369a1', fontWeight: 700, marginTop: 4 }}>Turnaround: {completed}</div>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>{row.assembly_name}</strong>
        {row.assembly_sku ? ` · ${row.assembly_sku}` : ''}
        {' · Qty '}
        {row.quantity}
      </div>
      <div style={{ color: 'var(--dash-muted, #666)', fontSize: 14, marginTop: 6 }}>
        Reason: {row.reason || '—'}
        {row.leather_code ? ` · Leather: ${row.leather_code}` : ''}
        {row.customer_name ? ` · Customer: ${row.customer_name}` : ''}
        {row.customer_phone ? ` · ${row.customer_phone}` : ''}
      </div>
      {row.outbound_delivery_number ? (
        <div style={{ color: 'var(--dash-muted, #888)', fontSize: 13, marginTop: 4 }}>
          Delivery note {row.outbound_delivery_number}
        </div>
      ) : null}
      {returnOrderLifecycleBadge(row) ? (
        <div style={{ color: '#0369a1', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
          {returnOrderLifecycleBadge(row)}
        </div>
      ) : null}
    </article>
  );
}

export default function WarehouseReturnsTrackage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listReturnOrders({ trackage_only: true, hassan_only: true });
      setRows(res?.return_orders || []);
    } catch (err) {
      setError(err?.message || 'Failed to load trackage.');
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
      const dept = resolveReturnRepairDepartment(row);
      const hay = [
        row.return_number,
        row.assembly_name,
        row.reason,
        row.customer_name,
        row.status,
        row.outbound_delivery_number,
        repairDepartmentLabel(dept),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const byDepartment = useMemo(() => {
    const buckets = Object.fromEntries(REPAIR_DEPARTMENTS.map((d) => [d.id, []]));
    for (const row of filtered) {
      const dept = row.repair_department || resolveReturnRepairDepartment(row);
      if (buckets[dept]) buckets[dept].push(row);
      else buckets.upholstery.push(row);
    }
    return buckets;
  }, [filtered]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dash-bg)', color: 'var(--dash-text)', padding: 24 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Repairs trackage</h1>
      </div>
      <p style={{ color: 'var(--dash-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        All Kitwe return jobs you created, grouped by workshop department.         Shows live repair timers, delivery status (Delivery app), and note numbers when dispatched.
      </p>

      <input
        type="search"
        placeholder="Search return #, product, reason, customer…"
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

      {loading && <div>Loading trackage…</div>}
      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: 'var(--dash-muted)' }}>No return jobs found.</div>
      )}

      {REPAIR_DEPARTMENTS.map((dept) => {
        const sectionRows = byDepartment[dept.id] || [];
        if (!sectionRows.length && !loading) return null;
        return (
          <section key={dept.id} style={{ marginBottom: 32 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{dept.label}</h2>
            {sectionRows.length === 0 ? (
              <div style={{ color: 'var(--dash-muted)' }}>No jobs in this department.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {sectionRows.map((row) => (
                  <TrackageCard key={row.id} row={row} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
