import React from 'react';
import { FaTag } from 'react-icons/fa';
import WarehouseCatalogFunnelFilter from './WarehouseCatalogFunnelFilter';

export default function WarehouseCatalogListChrome({
  selectAllChecked,
  selectAllIndeterminate,
  onSelectAll,
  selectedCount,
  onBulkPrintClick,
  bulkBusy,
  disabled,
  showFunnel = true,
}) {
  return (
    <div className="warehouse-catalog-list-chrome" aria-label="Bulk label and filters">
      <div className="warehouse-catalog-list-chrome__bulk">
        <label className="warehouse-catalog-list-chrome__select-all" title="Select all products on every page">
          <input
            type="checkbox"
            className="products-bulk-checkbox"
            checked={selectAllChecked}
            ref={(el) => {
              if (el) el.indeterminate = Boolean(selectAllIndeterminate);
            }}
            disabled={disabled || bulkBusy}
            onChange={(e) => onSelectAll(e.target.checked)}
            aria-label="Select all products across all pages"
          />
        </label>
        <button
          type="button"
          className="warehouse-label-print-btn warehouse-catalog-list-chrome__bulk-print"
          disabled={disabled || bulkBusy || selectedCount < 1}
          title="Bulk print labels for selected products"
          aria-label="Bulk print labels"
          onClick={onBulkPrintClick}
        >
          <FaTag aria-hidden />
        </button>
      </div>
      {showFunnel ? <WarehouseCatalogFunnelFilter className="warehouse-catalog-list-chrome__funnel" /> : null}
      {selectedCount > 0 ? (
        <span className="warehouse-catalog-list-chrome__meta">{selectedCount} selected</span>
      ) : null}
    </div>
  );
}
