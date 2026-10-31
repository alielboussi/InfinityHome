import { assemblyUsesWarehouseBoxLabels } from './warehouseDeliveryBoxUnits.js';
import { formatWarehouseProductionLabelColor } from './warehouseProductionLabelColor.js';
import {
  assemblyUnitsPerCarton,
  boxCountFromFinishedUnits,
} from './warehouseUnitsPerCarton.js';

export { assemblyUsesWarehouseBoxLabels } from './warehouseDeliveryBoxUnits.js';

export function warehouseProductLabelCopiesAtLocation(assembly, warehouseLocationId, finishedStockByAssembly) {
  if (!assembly || !warehouseLocationId) return 0;
  const stockMap = finishedStockByAssembly?.get(String(assembly.id));
  const qty = stockMap?.get(String(warehouseLocationId)) ?? 0;
  return Math.max(0, Math.floor(Number(qty) || 0));
}

/**
 * Label print qty: one label per box when finished box receiving (else one per unit).
 */
export function resolveWarehouseLabelPrintPlan(assembly, warehouseLocationId, finishedStockByAssembly, pktList) {
  const finishedUnits = warehouseProductLabelCopiesAtLocation(
    assembly,
    warehouseLocationId,
    finishedStockByAssembly,
  );
  if (finishedUnits < 1) return null;

  const unitsPerBox = assemblyUnitsPerCarton(assembly);
  const usesBoxLabels = assemblyUsesWarehouseBoxLabels(assembly, pktList);
  if (usesBoxLabels) {
    const boxes = boxCountFromFinishedUnits(finishedUnits, unitsPerBox);
    if (boxes < 1) return null;
    return {
      copies: boxes,
      boxUnitsPerCarton: unitsPerBox,
      finishedUnits,
      boxes,
      usesBoxLabels: true,
    };
  }

  return {
    copies: finishedUnits,
    boxUnitsPerCarton: 0,
    finishedUnits,
    boxes: finishedUnits,
    usesBoxLabels: false,
  };
}

/** One Zebra job per product. */
export function buildWarehouseBulkLabelPrintJobs(assemblies, {
  warehouseLocationId,
  finishedStockByAssembly,
  colorsByAssembly,
  packetsByAssembly,
  selectedIds = null,
}) {
  const jobs = [];
  (assemblies || []).forEach((assembly) => {
    const id = String(assembly.id);
    if (selectedIds && !selectedIds.has(id)) return;
    const name = String(assembly.name || '').trim();
    const sku = String(assembly.family_sku || '').trim();
    if (!name || !sku) return;

    const pktList = packetsByAssembly?.get(id) || [];
    const plan = resolveWarehouseLabelPrintPlan(
      assembly,
      warehouseLocationId,
      finishedStockByAssembly,
      pktList,
    );
    if (!plan || plan.copies < 1) return;

    const color = formatWarehouseProductionLabelColor(
      assembly,
      colorsByAssembly?.get(id) || [],
    );
    jobs.push({
      assemblyId: id,
      name,
      sku,
      color,
      copies: plan.copies,
      boxUnitsPerCarton: plan.usesBoxLabels ? plan.boxUnitsPerCarton : 0,
    });
  });
  return jobs;
}

export function warehouseBulkLabelPrintSummary(jobs) {
  const list = jobs || [];
  const totalLabels = list.reduce((sum, j) => sum + j.copies, 0);
  return { productCount: list.length, totalLabels };
}
