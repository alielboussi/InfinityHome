import { useCallback, useEffect, useState } from 'react';
import { fetchUpholsteryProductionJobs } from './services/warehouseProductionApi';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function statusLabel(status) {
  const map = {
    ready: 'Ready',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
  };
  return map[String(status || '').toLowerCase()] || status || '—';
}

export default function UpholsteryTimerPage() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await fetchUpholsteryProductionJobs({ activeOnly: true });
      setJobs(Array.isArray(list) ? list : []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      setJobs((prev) => prev.map((j) => {
        if (j.status !== 'running' || !j.timer_started_at) return j;
        const base = Number(j.accumulated_ms) || 0;
        const extra = Date.now() - new Date(j.timer_started_at).getTime();
        return { ...j, elapsed_ms: base + Math.max(0, extra) };
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="kitwe-catalog-page" style={{ padding: '16px 20px', maxWidth: 1100 }}>
      <h1 style={{ marginTop: 16 }}>Upholstery Jobs</h1>
      <p style={{ color: 'var(--text-muted, #64748b)', maxWidth: 720 }}>
        Active upholstery production jobs from the mobile app — unit checks, timer, and status.
      </p>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading && !jobs.length ? <p>Loading…</p> : null}
      {!loading && !jobs.length && !error ? (
        <p style={{ color: 'var(--text-muted, #64748b)' }}>No active jobs.</p>
      ) : null}
      {jobs.length ? (
        <table className="kitwe-catalog-table" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Units checked</th>
              <th>Status</th>
              <th>Timer</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const qty = Math.max(1, Number(job.product_qty) || 1);
              const checked = Number(job.units_checked) || 0;
              return (
                <tr key={String(job.job_id || job.id)}>
                  <td>{job.finished_name || job.raw_name || '—'}</td>
                  <td>{job.finished_sku || '—'}</td>
                  <td>{qty}</td>
                  <td>{checked} / {qty}</td>
                  <td>{statusLabel(job.status)}</td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatElapsed(job.elapsed_ms)}
                  </td>
                  <td>{job.started_at ? new Date(job.started_at).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
