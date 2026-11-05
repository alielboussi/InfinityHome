import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { defaultReportDateRange, formatReportDateTime } from './utils/reportDateRange';
import { loadCarpentryProductionReportRows } from './utils/workshopReportData';

export default function CarpentryProductionReportPage() {
  const canView = canManageCatalog(getCurrentUser());
  const { startDate: defaultStart, endDate: defaultEnd } = useMemo(
    () => defaultReportDateRange(),
    [],
  );
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadCarpentryProductionReportRows(startDate, endDate);
      setRows(data);
    } catch (err) {
      setError(err?.message || 'Failed to load carpentry production.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  const totalQty = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0),
    [rows],
  );

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 style={{ margin: 0 }}>Carpentry Production</h2>
      </div>
      <p className="user-access-intro">
        Carpentry jobs and manufacture runs that credited Warehouse Floor 2 in the selected date
        range (completion date).
      </p>

      <div className="report-filters">
        <div className="report-filter-block">
          <label>Start date</label>
          <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="report-filter-block">
          <label>End date</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="report-actions">
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="report-error">{error}</div> : null}

      {!loading && rows.length > 0 ? (
        <div className="report-summary">
          <div className="report-summary-card">
            <div className="report-summary-title">Production lines</div>
            <div className="report-summary-value">{rows.length}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Total units to Floor 2</div>
            <div className="report-summary-value">{totalQty}</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="report-blank">Loading carpentry production…</div> : null}
      {!loading && !rows.length && !error ? (
        <div className="report-blank">No carpentry production in this date range.</div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="report-section">
          <div className="report-section-title">Sent to Warehouse Floor 2</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Product</th>
                <th>Qty</th>
                <th>User</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatReportDateTime(row.date)}</td>
                  <td>{row.kind}</td>
                  <td>{row.product}</td>
                  <td>{row.qty}</td>
                  <td>{row.user}</td>
                  <td>{row.sentTo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
