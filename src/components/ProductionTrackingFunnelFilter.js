import React, { useEffect, useRef, useState } from 'react';
import { FaFilter } from 'react-icons/fa';
import {
  PRODUCTION_TRACKING_DEPARTMENTS,
  PRODUCTION_TRACKING_KINDS,
  PRODUCTION_TRACKING_PROGRESS,
  isProductionTrackingFilterActive,
} from '../utils/productionTrackingListUi';

export default function ProductionTrackingFunnelFilter({
  department,
  trackKind,
  progress,
  hideProgressFilter = false,
  onDepartmentChange,
  onTrackKindChange,
  onProgressChange,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const active = isProductionTrackingFilterActive({
    department,
    trackKind,
    progress: hideProgressFilter ? 'all' : progress,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--dash-border)',
    background: 'var(--dash-surface-2)',
    color: 'var(--dash-text)',
    marginTop: 4,
  };

  return (
    <div ref={rootRef} className="production-tracking-funnel" style={{ position: 'relative' }}>
      <button
        type="button"
        className={`production-tracking-funnel__btn${active ? ' production-tracking-funnel__btn--active' : ''}`}
        aria-label="Filter production tracking"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <FaFilter aria-hidden />
      </button>
      {open ? (
        <div className="production-tracking-funnel__panel" role="dialog" aria-label="Tracking filters">
          <label style={{ display: 'block', fontSize: 13, color: 'var(--dash-muted)' }}>
            Department
            <select
              value={department}
              onChange={(e) => onDepartmentChange(e.target.value)}
              style={selectStyle}
            >
              {PRODUCTION_TRACKING_DEPARTMENTS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--dash-muted)', marginTop: 12 }}>
            Type
            <select
              value={trackKind}
              onChange={(e) => onTrackKindChange(e.target.value)}
              style={selectStyle}
            >
              {PRODUCTION_TRACKING_KINDS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {!hideProgressFilter ? (
            <label style={{ display: 'block', fontSize: 13, color: 'var(--dash-muted)', marginTop: 12 }}>
              Status
              <select
                value={progress}
                onChange={(e) => onProgressChange(e.target.value)}
                style={selectStyle}
              >
                {PRODUCTION_TRACKING_PROGRESS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            {active ? (
              <button
                type="button"
                className="portal-btn portal-btn--ghost"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="portal-btn"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}