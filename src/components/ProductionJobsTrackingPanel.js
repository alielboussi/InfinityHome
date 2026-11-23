import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProductionJobsTracking, approveProductionFloor1Credit } from '../services/productionJobsTrackingApi';
import { formatWarehouseAdminDateTime } from '../utils/warehouseAdminFormat';
import { productionDepartmentLabel } from '../utils/productionJobFlowStatus';
import RunningProductionJobElapsed from './RunningProductionJobElapsed';
import { formatProductionElapsed } from '../utils/formatProductionElapsed';
import { computeTrackingJobElapsedMs } from './RunningProductionJobElapsed';
import ProductionTrackingFunnelFilter from './ProductionTrackingFunnelFilter';
import {
  applyProductionTrackingFilters,
  isProductionTrackingJobCompleted,
  partitionProductionTrackingJobs,
} from '../utils/productionTrackingListUi';
import {
  isProductionQuoteCustomerOrder,
  isProductionQuoteShowroomOrder,
} from '../utils/quoteShowroomOrder';

function trackingRowAsQuote(row) {
  const quote = {
    showroom_order: row?.showroom_order === true || row?.track_kind === 'showroom_order',
    customer_order: row?.customer_order === true || Boolean(String(row?.customer_name || '').trim()),
    track_kind: row?.track_kind,
  };
  if (quote.showroom_order) quote.customer_order = false;
  else if (row?.track_kind === 'quote_order' || row?.track_kind === 'quote') {
    quote.customer_order = true;
  }
  return quote;
}

function trackingKindLabel(row) {
  const k = String(row?.track_kind || 'factory').toLowerCase();
  if (k === 'showroom_order' || k === 'showroom' || row?.showroom_order === true) return 'Showroom order';
  if (k === 'repair') return 'Repair';
  if (k === 'quote_order' || k === 'quote' || row?.customer_order === true) return 'Customer order';
  if (row?.catalog_manufacture === true) return 'Production';
  return 'Production';
}

function TrackingDetailLine({ label, value, always = false }) {
  const display = value != null && String(value).trim() ? String(value).trim() : '';
  if (!always && !display) return null;
  return (
    <div className="production-tracking-card__line">
      <span className="production-tracking-card__line-label">{label}</span>
      <span className="production-tracking-card__line-value">{display || '—'}</span>
    </div>
  );
}

function ProductionTrackingCard({ row, onApproveFloor1, approveBusyId }) {
  const completed = isProductionTrackingJobCompleted(row);
  const live = row.timer_status === 'running' || row.timer_status === 'paused';
  const quoteShape = trackingRowAsQuote(row);
  const showCustomerShowroom = isProductionQuoteShowroomOrder(quoteShape)
    || isProductionQuoteCustomerOrder(quoteShape);
  const productLine = [
    row?.product_sku ? `SKU ${row.product_sku}` : '',
    row?.product_qty != null ? `Qty ${row.product_qty}` : '',
  ].filter(Boolean).join(' · ');
  const refLine = row?.quote_number
    ? `Quote ${row.quote_number}`
    : (row?.return_number ? `Return ${row.return_number}` : '');

  return (
    <article
      className={`production-tracking-card${completed ? ' production-tracking-card--completed' : ''}`}
    >
      <div className="production-tracking-card__badges">
        {String(row?.track_kind || '').toLowerCase() === 'repair' ? (
          <span className="production-tracking-card__type-badge production-tracking-card__type-badge--repair">
            Repair
          </span>
        ) : showCustomerShowroom ? (
          isProductionQuoteShowroomOrder(quoteShape) ? (
            <span className="production-tracking-card__type-badge production-tracking-card__type-badge--showroom quotation-customer-order-badge">
              Showroom order
            </span>
          ) : (
            <span className="production-tracking-card__type-badge production-tracking-card__type-badge--customer quotation-customer-order-badge">
              Customer order
            </span>
          )
        ) : (
          <span className="production-tracking-card__kind">{trackingKindLabel(row)}</span>
        )}
        <span className="production-tracking-card__dept">
          {row.department_label || productionDepartmentLabel(row.department)}
        </span>
        {row.timer_status === 'paused' ? (
          <span className="production-tracking-card__timer-chip">Paused</span>
        ) : null}
        {row.timer_status === 'running' ? (
          <span className="production-tracking-card__timer-chip">Running</span>
        ) : null}
      </div>

      <div className="production-tracking-card__title">{row.product_name || '—'}</div>
      <div className="production-tracking-card__status">{row.flow_status || '—'}</div>

      <div className="production-tracking-card__lines">
        {refLine ? <TrackingDetailLine label="Reference" value={refLine} always /> : null}
        {productLine ? <TrackingDetailLine label="Product" value={productLine} always /> : null}
        {row.customer_name ? <TrackingDetailLine label="Customer" value={row.customer_name} /> : null}
        {row.customer_phone ? <TrackingDetailLine label="Phone" value={row.customer_phone} /> : null}
        <TrackingDetailLine
          label="Started"
          value={row.started_at ? formatWarehouseAdminDateTime(row.started_at) : ''}
          always
        />
        <TrackingDetailLine
          label="Completed"
          value={row.completed_at ? formatWarehouseAdminDateTime(row.completed_at) : ''}
          always
        />
      </div>

      <div className="production-tracking-card__timer">
        <div className="production-tracking-card__timer-label">Time elapsed</div>
        <div className="production-tracking-card__timer-value">
          {live ? (
            <>
              <RunningProductionJobElapsed job={row} />
              {row.timer_status === 'paused' ? ' (paused)' : ''}
            </>
          ) : (
            formatProductionElapsed(computeTrackingJobElapsedMs(row))
          )}
        </div>
      </div>
      {row.pending_floor1_credit ? (
        <div className="production-tracking-card__actions">
          <p className="production-tracking-card__line-value">
            Floor 1 stock is waiting for a second approval (Hassan / admin).
          </p>
          <button
            type="button"
            className="product-form-btn product-form-btn--primary"
            disabled={Boolean(approveBusyId)}
            onClick={() => onApproveFloor1?.(row)}
          >
            {approveBusyId === row.id ? 'Approving…' : 'Approve Floor 1 stock'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function ProductionJobsTrackingPanel({
  title = 'Production jobs',
  description,
  embedInHub = false,
  initialDepartment = 'all',
  defaultProgress = 'in_progress',
  inProgressOnly = false,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState(initialDepartment || 'all');
  const [trackKind, setTrackKind] = useState('all');
  const [showCompleted, setShowCompleted] = useState(defaultProgress === 'all' && !inProgressOnly);
  const [approveBusyId, setApproveBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProductionJobsTracking({
        department: department === 'all' ? undefined : department,
        track_kind: trackKind === 'all' ? undefined : trackKind,
      });
      setRows(Array.isArray(res.jobs) ? res.jobs : []);
    } catch (err) {
      setError(err?.message || 'Failed to load production jobs.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [department, trackKind]);

  const onApproveFloor1 = async (row) => {
    setApproveBusyId(row.id);
    setError('');
    try {
      await approveProductionFloor1Credit({
        quoteId: row.quote_id || (String(row.id || '').startsWith('quote:') ? String(row.id).slice(6) : ''),
        jobId: row.production_job_id || '',
        department: row.department,
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Floor 1 approval failed.');
    } finally {
      setApproveBusyId('');
    }
  };

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => applyProductionTrackingFilters(rows, {
    search,
    department,
    trackKind,
    progress: showCompleted ? 'all' : 'in_progress',
  }), [rows, search, department, trackKind, showCompleted]);

  const completedHiddenCount = useMemo(() => {
    const all = applyProductionTrackingFilters(rows, {
      search,
      department,
      trackKind,
      progress: 'all',
    });
    return partitionProductionTrackingJobs(all).completed.length;
  }, [rows, search, department, trackKind]);

  const { inProgress, completed } = useMemo(
    () => partitionProductionTrackingJobs(filtered),
    [filtered],
  );

  const showProgressSections = showCompleted && inProgress.length > 0 && completed.length > 0;

  const clearFilters = () => {
    setDepartment('all');
    setTrackKind('all');
    setShowCompleted(false);
  };

  return (
    <div className="production-tracking-panel">
      {!embedInHub && title ? <h1 className="production-tracking-panel__title">{title}</h1> : null}
      {description ? (
        <p className="production-tracking-panel__desc">{description}</p>
      ) : null}

      <div className="production-tracking-toolbar">
        <input
          type="search"
          className="production-tracking-toolbar__search"
          placeholder="Search product, SKU, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ProductionTrackingFunnelFilter
          department={department}
          trackKind={trackKind}
          progress={showCompleted ? 'all' : 'in_progress'}
          hideProgressFilter
          onDepartmentChange={setDepartment}
          onTrackKindChange={setTrackKind}
          onProgressChange={() => {}}
          onClear={clearFilters}
        />
        <button
          type="button"
          className="product-form-btn"
          onClick={() => setShowCompleted((v) => !v)}
        >
          {showCompleted
            ? 'Hide completed jobs'
            : `Show completed jobs${completedHiddenCount ? ` (${completedHiddenCount})` : ''}`}
        </button>
      </div>

      {loading && <div>Loading jobs…</div>}
      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: 'var(--dash-muted)' }}>No production jobs found.</div>
      )}

      <div className="production-tracking-grid">
        {showProgressSections && inProgress.length ? (
          <h2 className="production-tracking-section-heading">In progress</h2>
        ) : null}
        {inProgress.map((row) => (
          <ProductionTrackingCard
            key={`${row.department}:${row.id}`}
            row={row}
            onApproveFloor1={onApproveFloor1}
            approveBusyId={approveBusyId}
          />
        ))}
        {showProgressSections && completed.length ? (
          <h2 className="production-tracking-section-heading">Completed</h2>
        ) : null}
        {completed.map((row) => (
          <ProductionTrackingCard
            key={`${row.department}:${row.id}`}
            row={row}
            onApproveFloor1={onApproveFloor1}
            approveBusyId={approveBusyId}
          />
        ))}
      </div>
    </div>
  );
}