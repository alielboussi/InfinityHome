import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { useSyncReportFiltersFromUrl } from './hooks/useReportHubFilters';
import { matchesReportUserFilter } from './utils/reportHubUserFilter';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { defaultReportDateRange, formatReportDateTime } from './utils/reportDateRange';
import { loadPaintingReportRows } from './utils/workshopReportData';

export default function PaintingReportPage({ embedInHub = false, userFilter = '' } = {}) {
  const canView = canManageCatalog(getCurrentUser());
  const { startDate: defaultStart, endDate: defaultEnd } = useMemo(
    () => defaultReportDateRange(),
    [],
  );
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  useSyncReportFiltersFromUrl({ embedInHub, setStartDate, setEndDate });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadPaintingReportRows(startDate, endDate);
      setRows(data);
    } catch (err) {
      setError(err?.message || 'Failed to load painting activity.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  const displayRows = useMemo(
    () => rows.filter((row) => matchesReportUserFilter(row.user, userFilter)),
    [rows, userFilter],
  );
  const totalUsed = useMemo(
    () => displayRows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0),
    [displayRows],
  );

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page">
      {!embedInHub ? (
        <div className="page-header-row">
          <BackToDashboard />
          <h2 style={{ margin: 0 }}>Painting Report</h2>
        </div>
      ) : null}
      <p className="user-access-intro">
        When Carpentry sends WIP from Warehouse Floor 2 into painting, each job appears here by
        start date. Destination shows finished stock on Floor 1 and/or a Floor 1 → Kitwe delivery
        in the same period.
      </p>

      {!embedInHub ? (
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
      ) : null}

      <div className="report-actions">
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="report-error">{error}</div> : null}

      {!loading && displayRows.length > 0 ? (
        <div className="report-summary">
          <div className="report-summary-card">
            <div className="report-summary-title">Painting jobs started</div>
            <div className="report-summary-value">{displayRows.length}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Units from Floor 2</div>
            <div className="report-summary-value">{totalUsed}</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="report-blank">Loading painting report…</div> : null}
      {!loading && !displayRows.length && !error ? (
        <div className="report-blank">No painting activity in this date range.</div>
      ) : null}

      {!loading && displayRows.length > 0 ? (
        <div className="report-section">
          <div className="report-section-title">Floor 2 usage and destination</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Used from Floor 2</th>
                <th>Completed</th>
                <th>Product</th>
                <th>Qty</th>
                <th>User</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatReportDateTime(row.usedAt)}</td>
                  <td>{row.completedAt ? formatReportDateTime(row.completedAt) : '—'}</td>
                  <td>{row.product}</td>
                  <td>{row.qty}</td>
                  <td>{row.user}</td>
                  <td>{row.destination}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
