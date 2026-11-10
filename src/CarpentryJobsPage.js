import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCarpentryProductionJobs,
  fetchProductionQuoteOrdersForRoute,
} from './services/carpentryCatalogApi';
import {
  JobMaterialsDetailRow,
  JobMaterialsExpandButton,
} from './components/JobMaterialsExpandPanel';
import { useStoreroomLocationLabels } from './hooks/useStoreroomLocationLabels';
import { materialLinesFromJob } from './utils/productionJobMaterialLines';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'running') return 'Running';
  if (s === 'paused') return 'Paused';
  if (s === 'completed') return 'Completed';
  return 'Ready';
}

function quoteOrderStatus(order) {
  if (order?.completed_at || order?.run_completed_at) return 'Completed';
  if (order?.accepted_at || order?.run_started_at) return 'In Production';
  return 'Awaiting Accept';
}

function computeQuoteOrderElapsedMs(order, nowMs = Date.now()) {
  const startRaw = order?.run_started_at || order?.accepted_at;
  if (!startRaw) return 0;
  const startMs = new Date(startRaw).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const endRaw = order?.completed_at || order?.run_completed_at;
  const endMs = endRaw ? new Date(endRaw).getTime() : nowMs;
  if (!Number.isFinite(endMs)) return Math.max(0, nowMs - startMs);
  return Math.max(0, endMs - startMs);
}

function formatLineExtra(line) {
  const parts = [];
  if (line?.wood) parts.push(`Wood: ${line.wood}`);
  const l = line?.length_cm;
  const w = line?.width_cm;
  const h = line?.height_cm;
  if (l != null || w != null || h != null) {
    parts.push(`${l ?? '—'}×${w ?? '—'}×${h ?? '—'} cm`);
  }
  if (line?.color_code) parts.push(`Color: ${line.color_code}`);
  if (line?.leather_code) parts.push(`Leather: ${line.leather_code}`);
  if (Array.isArray(line?.included_accessories) && line.included_accessories.length) {
    parts.push(`Accessories: ${line.included_accessories.join(', ')}`);
  }
  if (line?.description) parts.push(`"${line.description}"`);
  return parts.join(' · ');
}

export default function CarpentryJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [quoteOrders, setQuoteOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expandedJobId, setExpandedJobId] = useState('');
  const storeroomLabels = useStoreroomLocationLabels();

  const load = useCallback(async () => {
    try {
      const [payload, fallbackQuotes] = await Promise.all([
        fetchCarpentryProductionJobs({ activeOnly: false, limit: 150 }),
        fetchProductionQuoteOrdersForRoute('carpentry'),
      ]);
      setJobs(Array.isArray(payload?.jobs) ? payload.jobs : []);
      const orders = Array.isArray(payload?.quote_orders) && payload.quote_orders.length
        ? payload.quote_orders
        : (Array.isArray(fallbackQuotes) ? fallbackQuotes : []);
      setQuoteOrders(orders);
      setError(payload?.tableMissing ? 'Carpentry jobs table not deployed yet — run applyCarpentryProductionJobsSchema.js' : '');
    } catch (err) {
      setError(err?.message || 'Failed to load carpentry jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
      setJobs((prev) => prev.map((j) => {
        if (j.status !== 'running' || !j.timer_started_at) return j;
        const base = Number(j.accumulated_ms) || 0;
        const extra = Date.now() - new Date(j.timer_started_at).getTime();
        return { ...j, elapsed_ms: base + Math.max(0, extra) };
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(
    () => [...jobs].sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || ''))),
    [jobs],
  );

  const sortedQuoteOrders = useMemo(
    () => [...quoteOrders].sort((a, b) =>
      String(b.sent_to_production_at || '').localeCompare(String(a.sent_to_production_at || '')),
    ),
    [quoteOrders],
  );

  return (
    <div className="kitwe-catalog-page" style={{ padding: '16px 20px', maxWidth: 1100 }}>
      <h1 style={{ marginTop: 16 }}>Carpentry Jobs</h1>
      <p style={{ color: 'var(--text-muted, #64748b)', maxWidth: 720 }}>
        Timed carpentry jobs from the workshop app (play / pause / stop) and quotation orders sent by Hassan Awad.
      </p>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading && !rows.length && !sortedQuoteOrders.length ? <p>Loading…</p> : null}

      <h2 style={{ fontSize: 18, marginTop: 24, marginBottom: 8 }}>
        Hassan Awad Quotation Orders ({sortedQuoteOrders.length})
      </h2>
      {!loading && !sortedQuoteOrders.length ? (
        <p style={{ color: 'var(--text-muted, #64748b)' }}>No carpentry quotation orders sent yet.</p>
      ) : null}
      {sortedQuoteOrders.length ? (
        <table className="kitwe-catalog-table kitwe-catalog-table--upholstery" style={{ marginTop: 12, marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Quote / Customer</th>
              <th>Items &amp; Specs</th>
              <th>Status</th>
              <th>Timer</th>
              <th>Sent</th>
              <th>Accepted</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {sortedQuoteOrders.map((order) => {
              const lines = Array.isArray(order.lines) ? order.lines : [];
              const elapsed = computeQuoteOrderElapsedMs(order, nowMs);
              return (
                <tr key={`quote-${order.quote_id}`}>
                  <td>
                    <strong>{order.quote_number || order.quote_id}</strong>
                    {order.customer_name ? (
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{order.customer_name}</div>
                    ) : null}
                    {order.customer_phone ? (
                      <div style={{ fontSize: 12, color: 'var(--kitwe-muted, #64748b)' }}>{order.customer_phone}</div>
                    ) : null}
                  </td>
                  <td>
                    {lines.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {lines.map((line, idx) => {
                          const extra = formatLineExtra(line);
                          return (
                            <div key={line.id || idx} style={{ fontSize: 13 }}>
                              <strong>{line.name || 'Item'}</strong> × {line.quantity || 1}
                              {extra ? (
                                <div style={{ fontSize: 12, color: 'var(--kitwe-muted, #64748b)' }}>
                                  {extra}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : '—'}
                  </td>
                  <td>{quoteOrderStatus(order)}</td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {order.accepted_at || order.run_started_at ? formatElapsed(elapsed) : '00:00:00'}
                  </td>
                  <td>{order.sent_to_production_at ? new Date(order.sent_to_production_at).toLocaleString() : '—'}</td>
                  <td>{order.accepted_at ? new Date(order.accepted_at).toLocaleString() : '—'}</td>
                  <td>{order.completed_at ? new Date(order.completed_at).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <h2 style={{ fontSize: 18, marginTop: 24, marginBottom: 8 }}>
        Workshop Floor Manufacture Jobs ({rows.length})
      </h2>
      {!loading && !rows.length && !error ? (
        <p style={{ color: 'var(--text-muted, #64748b)' }}>No workshop floor carpentry jobs yet.</p>
      ) : null}
      {rows.length ? (
        <table className="kitwe-catalog-table kitwe-catalog-table--upholstery" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th className="col-materials">Materials</th>
              <th>Product</th>
              <th>Status</th>
              <th>Timer</th>
              <th>Started</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((job) => {
              const jobKey = String(job.id || job.job_id);
              const matLines = materialLinesFromJob(job);
              const open = expandedJobId === jobKey;
              return (
                <React.Fragment key={jobKey}>
                  <tr>
                    <td className="col-materials">
                      <JobMaterialsExpandButton
                        open={open}
                        count={matLines.length}
                        onClick={() => setExpandedJobId((prev) => (prev === jobKey ? '' : jobKey))}
                      />
                    </td>
                    <td>
                      <strong>{job.product_name || job.assembly_id || '—'}</strong>
                      {job.product_sku ? (
                        <div style={{ fontSize: 12, color: 'var(--kitwe-muted, #64748b)' }}>{job.product_sku}</div>
                      ) : null}
                    </td>
                    <td>{statusLabel(job.status)}</td>
                    <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatElapsed(job.elapsed_ms ?? job.accumulated_ms)}
                    </td>
                    <td>{job.started_at ? new Date(job.started_at).toLocaleString() : '—'}</td>
                    <td>{job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'}</td>
                  </tr>
                  {open ? (
                    <JobMaterialsDetailRow
                      job={job}
                      colSpan={6}
                      labelByLocationId={storeroomLabels}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
