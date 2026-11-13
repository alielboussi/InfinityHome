import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProductionJobsTracking } from '../services/productionJobsTrackingApi';
import { formatWarehouseAdminDateTime } from '../utils/warehouseAdminFormat';
import { productionDepartmentLabel } from '../utils/productionJobFlowStatus';
import RunningProductionJobElapsed from './RunningProductionJobElapsed';
import { formatProductionElapsed } from '../utils/formatProductionElapsed';
import { computeTrackingJobElapsedMs } from './RunningProductionJobElapsed';

const DEPARTMENT_FILTERS = [
  { value: 'all', label: 'All departments' },
  { value: 'upholstery', label: 'Upholstery' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
];

function ProductionTrackingCard({ row }) {
  const live = row.timer_status === 'running' || row.timer_status === 'paused';
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
          <div style={{ fontWeight: 700 }}>{row.product_name || '—'}</div>
          <div style={{ color: 'var(--dash-muted, #666)', fontSize: 14, marginTop: 4 }}>
            {row.product_sku ? `SKU ${row.product_sku} · ` : ''}
            Qty {row.product_qty ?? 1}
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
            {row.department_label || productionDepartmentLabel(row.department)}
          </div>
          <div style={{ fontWeight: 700, color: '#0369a1' }}>{row.flow_status || '—'}</div>
          {live ? (
            <div style={{ color: '#0369a1', fontWeight: 700, marginTop: 4 }}>
              ⏱{' '}
              <RunningProductionJobElapsed job={row} />
              {row.timer_status === 'paused' ? ' (paused)' : row.timer_status === 'running' ? ' (running)' : ''}
            </div>
          ) : (
            <div style={{ color: '#0369a1', fontWeight: 700, marginTop: 4 }}>
              Elapsed: {formatProductionElapsed(computeTrackingJobElapsedMs(row))}
            </div>
          )}
        </div>
      </div>
      {row.started_at ? (
        <div style={{ color: 'var(--dash-muted, #888)', fontSize: 13, marginTop: 8 }}>
          Started {formatWarehouseAdminDateTime(row.started_at)}
          {row.completed_at ? ` · Completed ${formatWarehouseAdminDateTime(row.completed_at)}` : ''}
        </div>
      ) : null}
    </article>
  );
}

export default function ProductionJobsTrackingPanel({
  title = 'Production jobs',
  description,
  embedInHub = false,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProductionJobsTracking({
        department: department === 'all' ? undefined : department,
      });
      setRows(Array.isArray(res.jobs) ? res.jobs : []);
    } catch (err) {
      setError(err?.message || 'Failed to load production jobs.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [
      row.product_name,
      row.product_sku,
      row.department,
      row.department_label,
      row.flow_status,
      row.assembly_id,
    ].join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const shellStyle = embedInHub
    ? {}
    : { minHeight: '100vh', background: 'var(--dash-bg)', color: 'var(--dash-text)', padding: 24 };

  return (
    <div style={shellStyle}>
      {!embedInHub && title ? <h1 style={{ margin: '0 0 8px' }}>{title}</h1> : null}
      {description ? (
        <p style={{ color: 'var(--dash-muted)', marginBottom: 16, lineHeight: 1.5 }}>{description}</p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--dash-muted)', fontSize: 14 }}>Department</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--dash-border)',
              background: 'var(--dash-surface-2)',
              color: 'var(--dash-text)',
            }}
          >
            {DEPARTMENT_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <input
          type="search"
          placeholder="Search product, SKU, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: 200,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--dash-border)',
            background: 'var(--dash-surface-2)',
            color: 'var(--dash-text)',
          }}
        />
      </div>

      {loading && <div>Loading jobs…</div>}
      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: 'var(--dash-muted)' }}>No production jobs found.</div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {filtered.map((row) => (
          <ProductionTrackingCard key={`${row.department}:${row.id}`} row={row} />
        ))}
      </div>
    </div>
  );
}
