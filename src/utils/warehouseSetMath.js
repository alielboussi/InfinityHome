import { isWarehouseSetAssembly as isSetAssembly } from './warehouseCatalogHierarchy.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../constants/warehouseShowroomLocations.js';
import { expandWarehouseSetItemsRows } from './warehouseSetItems.js';

/** How many complete sets can be built from component product stock. */
export function assemblableSetUnits(setLines, resolveCompleteUnits) {
  const lines = setLines || [];
  if (!lines.length || typeof resolveCompleteUnits !== 'function') return 0;
  let min = Infinity;
  for (const line of lines) {
    const componentId = line?.component_assembly_id;
    if (!componentId) continue;
    const need = Math.max(1, Number(line.quantity) || 1);
    const available = Math.max(0, Number(resolveCompleteUnits(componentId)) || 0);
    min = Math.min(min, Math.floor(available / need));
  }
  return min === Infinity ? 0 : Math.max(0, min);
}

export function isWarehouseSetAssembly(assembly) {
  return isSetAssembly(assembly);
}

/** Factory warehouse catalog — buildable sets from component finished stock at Warehouse. */
export function computeWarehouseFactorySetBuildableQty(setAssemblyId, setItems, resolveComponentQty) {
  const lines = expandWarehouseSetItemsRows(setItems || []).filter(
    (row) => String(row.set_assembly_id) === String(setAssemblyId)
      && String(row.location_id) === String(WAREHOUSE_FACTORY_LOCATION_ID),
  );
  return assemblableSetUnits(lines, resolveComponentQty);
}

/** Portal / catalog card: `1 Set` vs `4 Sets`. */
export function formatWarehouseSetStockCount(qty) {
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  return `${n} ${n === 1 ? 'Set' : 'Sets'}`;
}
