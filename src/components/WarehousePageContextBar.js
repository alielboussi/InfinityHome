import React from 'react';

/**
 * Read-only context strip — no stock mutations, display only.
 */
export default function WarehousePageContextBar({
  locationName,
  viewLabel,
  lastRefreshAt,
  syncing = false,
  compact = false,
}) {
  const when = lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString() : '—';
  return (
    <div
      className={`warehouse-page-context${compact ? ' warehouse-page-context--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="warehouse-page-context__loc">{locationName || 'Warehouse'}</span>
      {viewLabel ? <span className="warehouse-page-context__view">{viewLabel}</span> : null}
      <span className="warehouse-page-context__meta">
        {syncing ? 'Updating…' : `Refreshed ${when}`}
      </span>
    </div>
  );
}
