/** Keep in sync with src/utils/warehouseUnitsPerCarton.js */

export function assemblyUnitsPerCarton(assembly) {
  const n = Number(assembly?.units_per_carton);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function assemblyUsesFinishedBoxReceiving(assembly, packets) {
  if (!assembly) return false;
  if (String(assembly.inventory_mode || 'packets').toLowerCase() === 'packets') return false;
  const per = assemblyUnitsPerCarton(assembly);
  if (per <= 1) return false;
  const list = packets || [];
  if (list.length !== 1) return false;
  return Math.max(1, Number(list[0].qty_per_unit) || 1) === 1;
}

export function finishedUnitsFromBoxCount(boxCount, unitsPerCarton) {
  const boxes = Math.max(0, Number(boxCount) || 0);
  const per = Math.max(1, Number(unitsPerCarton) || 1);
  return boxes * per;
}

export function boxCountFromFinishedUnits(finishedUnits, unitsPerCarton) {
  const units = Math.max(0, Number(finishedUnits) || 0);
  const per = Math.max(1, Number(unitsPerCarton) || 1);
  if (per <= 1) return units;
  return Math.floor(units / per);
}

export function formatWarehouseBoxAndUnitStock(finishedUnits, unitsPerCarton, unitLabel = 'units') {
  const units = Math.max(0, Math.floor(Number(finishedUnits) || 0));
  const per = assemblyUnitsPerCarton({ units_per_carton: unitsPerCarton });
  if (per <= 1) {
    return { units, boxes: units, text: `${units} ${unitLabel}` };
  }
  const boxes = Math.floor(units / per);
  const loose = units % per;
  let text = `${boxes} box${boxes === 1 ? '' : 'es'} · ${units} ${unitLabel}`;
  if (loose > 0) {
    text += ` (${loose} extra ${unitLabel} not in full boxes)`;
  }
  return { units, boxes, text };
}
