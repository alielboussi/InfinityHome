import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPaintingProductionJobs } from './services/carpentryCatalogApi';
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

export default function PaintingJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState('');
  const storeroomLabels = useStoreroomLocationLabels();

  const load = useCallback(async () => {
    try {
      const payload = await fetchPaintingProductionJobs({ activeOnly: false, limit: 150 });
      setJobs(Array.isArray(payload?.jobs) ? payload.jobs : []);
      setError(payload?.tableMissing ? 'Painting jobs table not deployed yet — run applyPaintingProductionJobsSchema.js' : '');
    } catch (err) {
      setError(err?.message || 'Failed to load painting jobs');
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

  const rows = useMemo(
    () => [...jobs].sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || ''))),
    [jobs],
  );

  return (
    <div className="kitwe-catalog-page" style={{ padding: '16px 20px', maxWidth: 1100 }}>
      <h1 style={{ marginTop: 16 }}>Painting Jobs</h1>
      <p style={{ color: 'var(--text-muted, #64748b)', maxWidth: 720 }}>
        Timed painting jobs from the painting workshop app (play / pause / stop). Floor 2 is deducted when work is sent to painting; Floor 1 is credited when a job is finished.
      </p>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading && !rows.length ? <p>Loading…</p> : null}
      {!loading && !rows.length && !error ? (
        <p style={{ color: 'var(--text-muted, #64748b)' }}>No painting jobs yet.</p>
      ) : null}
      {rows.length ? (
        <table className="kitwe-catalog-table kitwe-catalog-table--upholstery" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th className="col-materials">Materials</th>
              <th>Product</th>
              <th>Qty</th>
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
                    <td>{job.product_qty ?? 1}</td>
                    <td>{statusLabel(job.status)}</td>
                    <td>{formatElapsed(job.elapsed_ms ?? job.accumulated_ms)}</td>
                    <td>{job.started_at ? new Date(job.started_at).toLocaleString() : '—'}</td>
                    <td>{job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'}</td>
                  </tr>
                  {open ? (
                    <JobMaterialsDetailRow
                      job={job}
                      colSpan={7}
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
