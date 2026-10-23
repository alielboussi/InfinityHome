import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { fetchProductionEventsLog } from './services/warehouseProductionApi';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function ProductionAdminPage() {
  const user = getCurrentUser();
  const canView = canManageCatalog(user);
  const [tab, setTab] = useState('creates');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creates, setCreates] = useState([]);
  const [increases, setIncreases] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProductionEventsLog();
      setCreates(data.creates || []);
      setIncreases(data.stock_increases || []);
    } catch (err) {
      setError(err?.message || 'Failed to load production log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page production-admin-page">
      <div className="page-header-row">
        <h2 style={{ margin: 0 }}>Production</h2>
        <button type="button" className="report-link" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>
      <p className="user-access-intro">
        Kiosk activity: new seating items created and warehouse stock increases (label printing will hook in here later).
      </p>

      {error ? <div className="report-error">{error}</div> : null}

      <div className="production-admin-tabs">
        <button
          type="button"
          className={`production-admin-tabs__btn${tab === 'creates' ? ' is-active' : ''}`}
          onClick={() => setTab('creates')}
        >
          Newly created
        </button>
        <button
          type="button"
          className={`production-admin-tabs__btn${tab === 'increases' ? ' is-active' : ''}`}
          onClick={() => setTab('increases')}
        >
          Stock increases
        </button>
      </div>

      {loading ? <div className="report-blank">Loading…</div> : null}

      {!loading && tab === 'creates' ? (
        <div className="user-access-table-wrap">
          <table className="report-table user-access-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Name</th>
                <th>SKU</th>
                <th>Qty entered</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {creates.length === 0 ? (
                <tr><td colSpan={5}>No production creates logged yet.</td></tr>
              ) : creates.map((row) => (
                <tr key={row.id}>
                  <td className="user-access-table__date">{formatWhen(row.created_at)}</td>
                  <td>{row.name || '—'}</td>
                  <td><code>{row.sku || '—'}</code></td>
                  <td>{row.qty_added ?? row.qty_after ?? '—'}</td>
                  <td>{row.user_display_name || row.user_email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === 'increases' ? (
        <div className="user-access-table-wrap">
          <table className="report-table user-access-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Item</th>
                <th>User</th>
                <th>Added</th>
                <th>Warehouse qty</th>
              </tr>
            </thead>
            <tbody>
              {increases.length === 0 ? (
                <tr><td colSpan={5}>No stock increases logged yet.</td></tr>
              ) : increases.map((row) => (
                <tr key={row.id}>
                  <td className="user-access-table__date">{formatWhen(row.created_at)}</td>
                  <td>{row.name || '—'} <code>{row.sku ? `(${row.sku})` : ''}</code></td>
                  <td>{row.user_display_name || row.user_email || '—'}</td>
                  <td>+{row.qty_added ?? '—'}</td>
                  <td>
                    {row.qty_before ?? '—'} → {row.qty_after ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
