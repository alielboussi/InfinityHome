import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { useSyncReportFiltersFromUrl } from './hooks/useReportHubFilters';
import { matchesReportUserFilter } from './utils/reportHubUserFilter';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { listReturnOrders } from './services/warehouseDeliveryMobileApi';
import { defaultReportDateRange, formatReportDateTime } from './utils/reportDateRange';
import {
  filterRepairOrdersForReport,
  repairOrderSourceLabel,
} from './utils/workshopReportData';
import { repairDepartmentLabel } from './utils/warehouseReturnRepairDepartment';

export default function RepairReportPage({ embedInHub = false, userFilter = '' } = {}) {
  const canView = canManageCatalog(getCurrentUser());
  const { startDate: defaultStart, endDate: defaultEnd } = useMemo(
    () => defaultReportDateRange(),
    [],
  );
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  useSyncReportFiltersFromUrl({ embedInHub, setStartDate, setEndDate });
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listReturnOrders({ admin_registry: true, limit: 500 });
      setAllOrders(res?.return_orders || []);
    } catch (err) {
      setError(err?.message || 'Failed to load repair returns.');
      setAllOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  const rows = useMemo(
    () => filterRepairOrdersForReport(allOrders, startDate, endDate)
      .filter((row) => matchesReportUserFilter(
        row?.created_by_name || row?.created_by || row?.customer_name,
        userFilter,
      )),
    [allOrders, startDate, endDate, userFilter],
  );

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page">
      {!embedInHub ? (
        <div className="page-header-row">
          <BackToDashboard />
          <h2 style={{ margin: 0 }}>Repair Report</h2>
        </div>
      ) : null}
      <p className="user-access-intro">
        All warehouse return / repair orders (Kitwe catalog returns and customer sale returns),
        filtered by created date.
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

      {!loading && rows.length > 0 ? (
        <div className="report-summary">
          <div className="report-summary-card">
            <div className="report-summary-title">Repair orders</div>
            <div className="report-summary-value">{rows.length}</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="report-blank">Loading repair report…</div> : null}
      {!loading && !rows.length && !error ? (
        <div className="report-blank">No repair orders in this date range.</div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="report-section">
          <div className="report-section-title">Returns and repairs</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Return #</th>
                <th>Source</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Department</th>
                <th>Reason / type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatReportDateTime(row.created_at)}</td>
                  <td>{row.return_number || row.id}</td>
                  <td>{repairOrderSourceLabel(row)}</td>
                  <td>
                    {row.assembly_name || '—'}
                    {row.assembly_sku ? ` (${row.assembly_sku})` : ''}
                  </td>
                  <td>{row.quantity ?? 1}</td>
                  <td>{repairDepartmentLabel(row.repair_department) || '—'}</td>
                  <td>
                    {row.reason || '—'}
                    {row.reason_group ? ` · ${row.reason_group}` : ''}
                  </td>
                  <td>{String(row.status || '').replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
