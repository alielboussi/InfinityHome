import React, { useCallback, useEffect, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { fetchCarpentryFloorRuns } from './services/carpentryCatalogApi';

export default function WarehouseFloor2Page({
  pageTitle = 'Warehouse Floor 2',
  pageSubtitle = 'Unfinished carpentry WIP (after workshop Manufacture). Finish in the carpentry app → Floor 1; or send to upholstery from Floor 2.',
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [assemblyById, setAssemblyById] = useState(() => new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchCarpentryFloorRuns();
      setRuns(payload.rows || []);
      setTableMissing(Boolean(payload.tableMissing));
      const ids = [...new Set((payload.rows || []).map((r) => r.assembly_id).filter(Boolean))];
      if (ids.length) {
        const { data } = await db.from('warehouse_assemblies').select('id, name, family_sku').in('id', ids);
        setAssemblyById(new Map((data || []).map((a) => [String(a.id), a])));
      } else {
        setAssemblyById(new Map());
      }
    } catch (err) {
      setError(err?.message || 'Failed to load floor runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>{pageTitle}</h1>
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        {pageSubtitle}
      </p>
      {tableMissing ? (
        <p style={{ color: '#b45309' }}>
          Carpentry production collections are not registered yet. Run{' '}
          <code>node scripts/applyCarpentryProductionSchema.js</code> (Firestore) after deploying server changes.
        </p>
      ) : null}
      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}
      <div className="kitwe-catalog-table-wrap">
        <table className="kitwe-catalog-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Source</th>
              <th>Materials</th>
            </tr>
          </thead>
          <tbody>
            {runs.length ? runs.map((run) => {
              const asm = assemblyById.get(String(run.assembly_id));
              const matCount = Array.isArray(run.materials) ? run.materials.length : 0;
              return (
                <tr key={run.id}>
                  <td>{asm?.name || run.assembly_id}</td>
                  <td>{asm?.family_sku || '—'}</td>
                  <td>{run.product_qty ?? '—'}</td>
                  <td>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
                  <td>{run.completed_at ? new Date(run.completed_at).toLocaleString() : 'In progress'}</td>
                  <td>{run.source || '—'}</td>
                  <td>{matCount ? `${matCount} line${matCount === 1 ? '' : 's'}` : '—'}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={7} className="kitwe-empty-hint">No floor production runs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
