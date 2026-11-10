import React from 'react';
import {
  labelForMaterialUom,
  uomFromStoreroomMaterial,
} from '../utils/storeroomBomLineUom';

export default function CatalogProductBomEditor({
  row,
  lines,
  materialOptions,
  uomOptions,
  storeroomLocations,
  busyId,
  bomHint,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  onSave,
}) {
  return (
    <div style={{ padding: '12px 0 4px' }}>
      <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--kitwe-muted)' }}>
        {bomHint}
      </p>
      {(lines || []).map((line, index) => (
        <div key={index} className="kitwe-component-row">
          <select
            className="kitwe-form-control kitwe-form-control--product"
            value={line.material_assembly_id}
            onChange={(e) => onUpdateLine(index, { material_assembly_id: e.target.value })}
          >
            <option value="">Material…</option>
            {(materialOptions || []).filter((m) => Math.max(0, Number(m.storeroom_qty) || 0) > 0).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {' '}
                (
                {m.family_sku || 'SKU'}
                ·
                {' '}
                {m.default_uom || 'no UOM'}
                ·
                {' '}
                {m.storeroom_qty}
                {' '}
                in storerooms)
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step="any"
            className="kitwe-form-control kitwe-form-control--qty"
            value={line.quantity}
            onChange={(e) => onUpdateLine(index, { quantity: e.target.value })}
          />
          <input
            type="text"
            className="kitwe-form-control"
            readOnly
            tabIndex={-1}
            value={labelForMaterialUom(
              uomFromStoreroomMaterial(materialOptions, line.material_assembly_id) || line.uom,
              uomOptions,
            )}
            title="Unit of measure from the storeroom material"
            placeholder="Pick material…"
          />
          <select
            className="kitwe-form-control"
            value={line.warehouse_location_id || ''}
            onChange={(e) => onUpdateLine(index, { warehouse_location_id: e.target.value })}
          >
            <option value="">Any storeroom (1→2→3)</option>
            {(storeroomLocations || []).map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="kitwe-btn-secondary"
            onClick={() => onRemoveLine(index)}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="kitwe-create-form-actions">
        <button type="button" className="kitwe-btn-secondary" onClick={onAddLine}>
          Add material
        </button>
        <button
          type="button"
          className="kitwe-btn-create-set"
          disabled={busyId === `mat-${row.id}`}
          onClick={onSave}
        >
          {busyId === `mat-${row.id}` ? 'Saving…' : 'Save materials'}
        </button>
      </div>
    </div>
  );
}
