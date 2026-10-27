import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { fetchProductionEventsLog } from './services/warehouseProductionApi';
import {
  downloadProductionCreationsPdf,
  downloadProductionStockIncreasesPdf,
  formatProductionReportDateTime,
  groupStockIncreasesByDateUser,
  productionLogUserLabel,
  formatProductionLogSource,
} from './utils/productionReportPdf';

const toYMD = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const formatNumber = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
};

function filterRowsByLocalDate(rows, startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T23:59:59.999`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return rows || [];
  return (rows || []).filter((row) => {
    const t = new Date(row.created_at).getTime();
    return !Number.isNaN(t) && t >= start && t <= end;
  });
}

export default function ProductionReport() {
  const canView = canManageCatalog(getCurrentUser());
  const today = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => toYMD(today), [today]);
  const defaultStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return toYMD(d);
  }, [today]);

  const [reportType, setReportType] = useState('creates');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
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
      setCreates(filterRowsByLocalDate(data.creates, startDate, endDate));
      setIncreases(filterRowsByLocalDate(data.stock_increases, startDate, endDate));
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

  const increaseGroups = useMemo(
    () => groupStockIncreasesByDateUser(increases),
    [increases],
  );

  const summary = useMemo(() => {
    if (reportType === 'creates') {
      const totalQty = creates.reduce(
        (sum, row) => sum + Math.max(0, Number(row.qty_added ?? row.qty_after) || 0),
        0,
      );
      return {
        count: creates.length,
        totalQty,
        label: 'New items',
      };
    }
    const totalQty = increases.reduce(
      (sum, row) => sum + Math.max(0, Number(row.qty_added) || 0),
      0,
    );
    return {
      count: increases.length,
      totalQty,
      groupCount: increaseGroups.length,
      label: 'Stock increases',
    };
  }, [reportType, creates, increases, increaseGroups.length]);

  const handleExportPdf = () => {
    if (reportType === 'creates') {
      if (!creates.length) return;
      downloadProductionCreationsPdf({ rows: creates, startDate, endDate });
      return;
    }
    if (!increases.length) return;
    downloadProductionStockIncreasesPdf({ rows: increases, startDate, endDate });
  };

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page production-report-page">
      <p className="user-access-intro production-report-page__intro">
        Activity from the Production Android app: new seating items and stock increases on
        existing warehouse packets, filtered by date. PDF layout matches the Transfers Report.
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
        <div className="report-filter-block">
          <label>Report type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
            <option value="creates">New items created (sent to warehouse)</option>
            <option value="increases">Stock increases (existing packets)</option>
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
          disabled={loading || (reportType === 'creates' ? !creates.length : !increases.length)}
        >
          {reportType === 'creates' ? 'Export new items PDF' : 'Export stock increases PDF'}
        </button>
      </div>

      {error ? <div className="report-error">{error}</div> : null}

      {!loading && (creates.length > 0 || increases.length > 0) ? (
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

      {loading ? <div className="report-blank">Loading production activity…</div> : null}

      {!loading && reportType === 'creates' && !creates.length && !error ? (
        <div className="report-blank">No new production items in this date range.</div>
      ) : null}

      {!loading && reportType === 'increases' && !increases.length && !error ? (
        <div className="report-blank">No stock increases in this date range.</div>
      ) : null}

      {!loading && reportType === 'creates' && creates.length > 0 ? (
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
              {creates.map((row) => (
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

      {!loading && reportType === 'increases' && increases.length > 0 ? (
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
