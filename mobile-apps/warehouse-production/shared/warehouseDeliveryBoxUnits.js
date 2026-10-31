import { assemblyDerivesWarehouseStockFromPackets } from './warehouseCatalogProductCompleteness';
import { assemblyUnitsPerCarton } from './warehouseUnitsPerCarton';

export function assemblyUsesWarehouseBoxLabels(assembly, pktList) {
  if (!assembly) return false;
  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) return false;
  return assemblyUnitsPerCarton(assembly) > 1;
}

export function deliveryTruckBoxesToFinishedUnits(assembly, pktList, truckBoxes) {
  const boxes = Math.max(0, Math.floor(Number(truckBoxes) || 0));
  if (boxes < 1) return 0;
  if (!assemblyUsesWarehouseBoxLabels(assembly, pktList)) return boxes;
  return boxes * assemblyUnitsPerCarton(assembly);
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
