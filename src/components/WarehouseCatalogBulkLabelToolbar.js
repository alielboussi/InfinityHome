import React, { useMemo } from 'react';
import { FaTag } from 'react-icons/fa';
import {
  buildWarehouseBulkLabelPrintJobs,
  warehouseBulkLabelPrintSummary,
} from '../utils/warehouseBulkLabelPrint';

export default function WarehouseCatalogBulkLabelToolbar({
  assemblies,
  warehouseLocationId,
  finishedStockByAssembly,
  colorsByAssembly,
  packetsByAssembly,
  selectedIds,
  onToggleAll,
  onPrint,
  busy,
  disabled,
}) {
  const allFilteredJobs = useMemo(
    () => buildWarehouseBulkLabelPrintJobs(assemblies, {
      warehouseLocationId,
      finishedStockByAssembly,
      colorsByAssembly,
      packetsByAssembly,
    }),
    [assemblies, warehouseLocationId, finishedStockByAssembly, colorsByAssembly, packetsByAssembly],
  );

  const selectedJobs = useMemo(
    () => buildWarehouseBulkLabelPrintJobs(assemblies, {
      warehouseLocationId,
      finishedStockByAssembly,
      colorsByAssembly,
      packetsByAssembly,
      selectedIds,
    }),
    [
      assemblies,
      warehouseLocationId,
      finishedStockByAssembly,
      colorsByAssembly,
      packetsByAssembly,
      selectedIds,
    ],
  );

  const selectableIds = useMemo(
    () => new Set(allFilteredJobs.map((j) => j.assemblyId)),
    [allFilteredJobs],
  );

  const selectedCount = [...selectableIds].filter((id) => selectedIds.has(id)).length;
  const allSelected = selectableIds.size > 0 && selectedCount === selectableIds.size;
  const { productCount, totalLabels } = warehouseBulkLabelPrintSummary(selectedJobs);

  return (
    <div className="warehouse-catalog-bulk-label-bar">
      <label className="warehouse-catalog-bulk-label-bar__select-all">
        <input
          type="checkbox"
          className="products-bulk-checkbox"
          checked={allSelected}
          disabled={disabled || busy || selectableIds.size === 0}
          onChange={(e) => onToggleAll(e.target.checked, selectableIds)}
        />
        <span>Select products with warehouse stock</span>
      </label>
      <span className="warehouse-catalog-bulk-label-bar__meta">
        {selectedCount} selected
        {productCount > 0 ? ` · ${totalLabels} label${totalLabels === 1 ? '' : 's'} to print` : ''}
      </span>
      <button
        type="button"
        className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary warehouse-catalog-bulk-label-bar__print"
        disabled={disabled || busy || productCount === 0}
        onClick={() => onPrint(selectedJobs)}
      >
        <FaTag aria-hidden />
        {busy ? 'Printing…' : 'Bulk print labels'}
      </button>
    </div>
  );
}

export function WarehouseBulkLabelSelectCheckbox({
  assemblyId,
  checked,
  disabled,
  onChange,
  copies,
}) {
  return (
    <label
      className="warehouse-assembly-card__bulk-check"
      title={copies > 0 ? `${copies} label${copies === 1 ? '' : 's'} at warehouse qty` : 'No warehouse stock — skipped for bulk print'}
    >
      <input
        type="checkbox"
        className="products-bulk-checkbox"
        checked={checked}
        disabled={disabled || copies < 1}
        onChange={(e) => onChange(assemblyId, e.target.checked)}
        aria-label="Select for bulk label print"
      />
    </label>
  );
}
