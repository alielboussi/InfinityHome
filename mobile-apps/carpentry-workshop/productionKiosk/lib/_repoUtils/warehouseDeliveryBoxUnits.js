import { assemblyDerivesWarehouseStockFromPackets } from './warehouseAssemblyMath.js';
import { assemblyUnitsPerCarton } from './warehouseUnitsPerCarton.js';

/** Same rule as warehouse labels: finished units per box, not packet-BOM stock. */
export function assemblyUsesWarehouseBoxLabels(assembly, pktList) {
  if (!assembly) return false;
  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) return false;
  return assemblyUnitsPerCarton(assembly) > 1;
}

/** Driver “sets” / scanned labels = boxes on truck when box labels apply. */
export function deliveryTruckBoxesToFinishedUnits(assembly, pktList, truckBoxes) {
  const boxes = Math.max(0, Math.floor(Number(truckBoxes) || 0));
  if (boxes < 1) return 0;
  if (!assemblyUsesWarehouseBoxLabels(assembly, pktList)) return boxes;
  return boxes * assemblyUnitsPerCarton(assembly);
}

export function deliveryFinishedUnitsFromEntryMetadata(entry, pktList, assembly) {
  const qty = Math.max(0, Math.floor(Number(entry?.quantity) || 0));
  const metaUnits = Math.max(0, Math.floor(Number(entry?.metadata?.units) || 0));
  const per = Math.max(0, Math.floor(Number(entry?.metadata?.units_per_carton) || 0));
  if (per > 1 && metaUnits > 0) return metaUnits;
  if (assembly && assemblyUsesWarehouseBoxLabels(assembly, pktList) && qty > 0) {
    const perAsm = assemblyUnitsPerCarton(assembly);
    if (perAsm > 1) {
      const trucks = Math.max(0, Math.floor(Number(entry?.metadata?.truck_boxes) || 0));
      if (trucks > 0) return trucks * perAsm;
      return qty * perAsm;
    }
  }
  return metaUnits > 0 ? metaUnits : qty;
}

export function formatDeliveryPackSummary(assembly, pktList, finishedUnits, truckBoxes) {
  if (!assemblyUsesWarehouseBoxLabels(assembly, pktList)) return '';
  const per = assemblyUnitsPerCarton(assembly);
  const units = Math.max(0, Math.floor(Number(finishedUnits) || 0));
  const boxes = Math.max(
    0,
    Math.floor(Number(truckBoxes) || 0) || (units > 0 ? Math.floor(units / per) : 0),
  );
  if (units < 1) return `1 box = ${per} units`;
  return `${units} units (${boxes} box${boxes === 1 ? '' : 'es'} · 1 box = ${per} units)`;
}
