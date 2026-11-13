import { formatWarehouseProductionLabelColor } from './warehouseProductionLabelColor';
import { resolveWarehouseLabelPrintPlan } from './warehouseBulkLabelPrint';
import { formatAssemblyDimensions } from './warehouseAssemblySpecs';

/** Floor 2 / Farm row — same Zebra label plan as /warehouse-products (qty at this location). */
export function warehouseLabelPrintItemFromRow(assembly, qty, {
  colorRecords = [], pktList = [], photoFloor = 'floor1',
} = {}) {
  const name = String(assembly?.name || '').trim();
  const sku = String(assembly?.family_sku || '').trim();
  if (!name || !sku) return null;

  const locationQty = Math.max(0, Math.floor(Number(qty) || 0));
  const locKey = '__location__';
  const stockMap = new Map([[locKey, locationQty]]);
  const finishedStockByAssembly = new Map([[String(assembly.id), stockMap]]);

  const plan = locationQty > 0
    ? resolveWarehouseLabelPrintPlan(assembly, locKey, finishedStockByAssembly, pktList)
    : null;

  const defaultCopies = Math.max(1, plan?.copies ?? (locationQty || 1));

  const dimensionsDisplay = formatAssemblyDimensions(assembly);

  return {
    name,
    sku,
    defaultCopies,
    color: formatWarehouseProductionLabelColor(assembly, colorRecords),
    boxUnitsPerCarton: Math.max(0, Math.floor(Number(plan?.boxUnitsPerCarton) || 0)),
    dimLength: assembly?.dim_length,
    dimWidth: assembly?.dim_width,
    dimHeight: assembly?.dim_height,
    dimensionsDisplay,
    photoFloor,
  };
}
