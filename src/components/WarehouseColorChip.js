import React from 'react';
import { warehouseColorChipInlineStyle } from '../utils/warehouseColorChip';

export default function WarehouseColorChip({ name, onRemove, className = '' }) {
  const style = warehouseColorChipInlineStyle(name);
  return (
    <span
      className={`warehouse-color-chip ${className}`.trim()}
      style={style}
    >
      <span className="warehouse-color-chip__label">{name}</span>
      {onRemove ? (
        <button
          type="button"
          className="warehouse-color-chip-remove"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
