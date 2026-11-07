import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { fetchProductionEventsLog } from './services/warehouseProductionApi';
import { WAREHOUSE_FROM_LOCATION_ID } from './utils/warehouseDelivery';
import BackToDashboard from './BackToDashboard';
import { useSyncReportFiltersFromUrl } from './hooks/useReportHubFilters';
import { matchesReportUserFilter } from './utils/reportHubUserFilter';
import {
  defaultReportDateRange,
  filterRowsByLocalDate as filterByDateRange,
} from './utils/reportDateRange';
import {
  downloadProductionCreationsPdf,
  downloadProductionStockIncreasesPdf,
  formatProductionReportDateTime,
  groupStockIncreasesByDateUser,
  productionLogUserLabel,
  formatProductionLogSource,
} from './utils/productionReportPdf';

const formatNumber = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
};

function isFloor1ProductionRow(row) {
  const loc = String(row?.warehouse_location_id || '').trim();
  if (!loc) return true;
  return loc === WAREHOUSE_FROM_LOCATION_ID;
}

export default function ProductionReport({ embedInHub = false, userFilter = '' } = {}) {
  const canView = canManageCatalog(getCurrentUser());
  const { startDate: defaultStart, endDate: defaultEnd } = useMemo(
    () => defaultReportDateRange(),
    [],
  );

  const [reportType, setReportType] = useState('creates');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  useSyncReportFiltersFromUrl({ embedInHub, setStartDate, setEndDate });
  const [creates, setCreates] = useState([]);
  const [increases, setIncreases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!startDate || !endDate) {
      setCreates([]);
      setIncreases([]);
      setError('Choose a valid date range.');
      return;
    }
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      setCreates([]);
      setIncreases([]);
      setError('Choose a valid date range.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await fetchProductionEventsLog({
        startDate,
        endDate,
        limit: 5000,
      });
      const createsFiltered = filterByDateRange(data.creates, startDate, endDate)
        .filter(isFloor1ProductionRow);
      const increasesFiltered = filterByDateRange(data.stock_increases, startDate, endDate)
        .filter(isFloor1ProductionRow);
      setCreates(createsFiltered);
      setIncreases(increasesFiltered);
    } catch (err) {
      setError(err?.message || 'Failed to load production activity.');
      setCreates([]);
      setIncreases([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  const filteredCreates = useMemo(
    () => creates.filter((row) => matchesReportUserFilter(productionLogUserLabel(row), userFilter)),
    [creates, userFilter],
  );
  const filteredIncreases = useMemo(
    () => increases.filter((row) => matchesReportUserFilter(productionLogUserLabel(row), userFilter)),
    [increases, userFilter],
  );
  const increaseGroups = useMemo(
    () => groupStockIncreasesByDateUser(filteredIncreases),
    [filteredIncreases],
  );

  const summary = useMemo(() => {
    if (reportType === 'creates') {
      const totalQty = filteredCreates.reduce(
        (sum, row) => sum + Math.max(0, Number(row.qty_added ?? row.qty_after) || 0),
        0,
      );
      return {
        count: filteredCreates.length,
        totalQty,
        label: 'New items',
      };
    }
    const totalQty = filteredIncreases.reduce(
      (sum, row) => sum + Math.max(0, Number(row.qty_added) || 0),
      0,
    );
    return {
      count: filteredIncreases.length,
      totalQty,
      groupCount: increaseGroups.length,
      label: 'Stock increases',
    };
  }, [reportType, filteredCreates, filteredIncreases, increaseGroups.length]);

  const handleExportPdf = () => {
    if (reportType === 'creates') {
      if (!filteredCreates.length) return;
      downloadProductionCreationsPdf({ rows: filteredCreates, startDate, endDate });
      return;
    }
    if (!filteredIncreases.length) return;
    downloadProductionStockIncreasesPdf({ rows: filteredIncreases, startDate, endDate });
  };

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page production-report-page">
      {!embedInHub ? (
        <div className="page-header-row">
          <BackToDashboard />
          <h2 style={{ margin: 0 }}>Upholstery Report</h2>
        </div>
      ) : null}
      <p className="user-access-intro production-report-page__intro">
        Upholstery production from the Production Android app: new seating created and stock
        increases credited to Warehouse Floor 1, filtered by the date range you choose.
      </p>

      <div className="report-filters">
        {!embedInHub ? (
          <>
            <div className="report-filter-block">
              <label>Start date</label>
              <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="report-filter-block">
              <label>End date</label>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        ) : null}
        <div className="report-filter-block">
          <label>Report type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
            <option value="creates">New items created (sent to Floor 1)</option>
            <option value="increases">Stock increases on Floor 1 packets</option>
          </select>
        </div>
      </div>

      <div className="report-actions">
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={loading || (reportType === 'creates' ? !filteredCreates.length : !filteredIncreases.length)}
        >
          {reportType === 'creates' ? 'Export new items PDF' : 'Export stock increases PDF'}
        </button>
      </div>

      {error ? <div className="report-error">{error}</div> : null}

      {!loading && (filteredCreates.length > 0 || filteredIncreases.length > 0) ? (
        <div className="report-summary">
          <div className="report-summary-card">
            <div className="report-summary-title">{summary.label}</div>
            <div className="report-summary-value">{formatNumber(summary.count)}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Total qty</div>
            <div className="report-summary-value">{formatNumber(summary.totalQty)}</div>
          </div>
          {reportType === 'increases' ? (
            <div className="report-summary-card">
              <div className="report-summary-title">User / day groups</div>
              <div className="report-summary-value">{formatNumber(summary.groupCount)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <div className="report-blank">Loading upholstery activity…</div> : null}

      {!loading && reportType === 'creates' && !filteredCreates.length && !error ? (
        <div className="report-blank">No new production items in this date range.</div>
      ) : null}

      {!loading && reportType === 'increases' && !filteredIncreases.length && !error ? (
        <div className="report-blank">No stock increases in this date range.</div>
      ) : null}

      {!loading && reportType === 'creates' && filteredCreates.length > 0 ? (
        <div className="report-section">
          <div className="report-section-title">New items created</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>User</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredCreates.map((row) => (
                <tr key={row.id}>
                  <td>{formatProductionReportDateTime(row.created_at)}</td>
                  <td>{row.name || '—'}</td>
                  <td><code>{row.sku || '—'}</code></td>
                  <td>{row.qty_added ?? row.qty_after ?? '—'}</td>
                  <td>{productionLogUserLabel(row)}</td>
                  <td>{formatProductionLogSource(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && reportType === 'increases' && filteredIncreases.length > 0 ? (
        <div className="report-section">
          <div className="report-section-title">Stock increases by user and date</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Qty added</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {increaseGroups.flatMap((group) => group.items.map((row) => (
                <tr key={row.id}>
                  <td>{group.date}</td>
                  <td>{group.user}</td>
                  <td>{row.name || '—'}</td>
                  <td><code>{row.sku || '—'}</code></td>
                  <td>+{row.qty_added ?? '—'}</td>
                  <td>{formatProductionLogSource(row)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
