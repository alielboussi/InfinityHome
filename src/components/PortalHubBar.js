import React from 'react';

/**
 * Top bar for consolidated portal hubs (floors, storerooms, production, reports).
 */
export default function PortalHubBar({
  title,
  viewLabel = 'View',
  viewValue,
  viewOptions,
  onViewChange,
  children,
}) {
  return (
    <div className="portal-hub-bar">
      <div className="portal-hub-bar__main">
        {title ? <h1 className="portal-hub-bar__title">{title}</h1> : null}
        <label className="portal-hub-bar__select-wrap">
          <span className="portal-hub-bar__select-label">{viewLabel}</span>
          <select
            className="portal-hub-bar__select pos-control"
            value={viewValue}
            onChange={(e) => onViewChange(e.target.value)}
          >
            {viewOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children ? <div className="portal-hub-bar__filters">{children}</div> : null}
    </div>
  );
}
