import React from 'react';
import {
  formatMaterialLineQty,
  materialLineDisplayName,
  materialLinesFromJob,
  storeroomLabelForMaterialLine,
} from '../utils/productionJobMaterialLines';

export function JobMaterialsExpandButton({ open, count, onClick, disabled }) {
  if (!count) {
    return <span style={{ color: 'var(--kitwe-muted, #64748b)', fontSize: 13 }}>—</span>;
  }
  return (
    <button
      type="button"
      className="kitwe-btn-secondary kitwe-btn-compact"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      title={open ? 'Hide materials' : 'Show materials used'}
    >
      {open ? '▾' : '▸'}
      {' '}
      Materials (
      {count}
      )
    </button>
  );
}

export function JobMaterialsDetailRow({ job, colSpan, labelByLocationId }) {
  const lines = materialLinesFromJob(job);
  if (!lines.length) return null;
  return (
    <tr className="production-job-materials-detail">
      <td colSpan={colSpan} style={{ background: 'var(--kitwe-surface-muted, #f8fafc)', padding: '10px 14px' }}>
        <table className="kitwe-catalog-table" style={{ margin: 0, fontSize: 13 }}>
          <thead>
            <tr>
              <th>Material</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Storeroom</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const key = `${line.material_assembly_id || line.assembly_id || idx}-${line.warehouse_location_id || ''}-${idx}`;
              return (
                <tr key={key}>
                  <td>{materialLineDisplayName(line)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{line.family_sku || '—'}</td>
                  <td>{formatMaterialLineQty(line)}</td>
                  <td>{storeroomLabelForMaterialLine(line, labelByLocationId)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </td>
    </tr>
  );
}
