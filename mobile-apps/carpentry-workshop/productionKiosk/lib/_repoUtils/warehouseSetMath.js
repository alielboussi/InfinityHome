import { isWarehouseSetAssembly as isSetAssembly } from './warehouseCatalogHierarchy.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations.js';
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

/**
 * Units of each component product consumed when building all buildable sets
 * (buildable sets × qty per set, summed across every factory set recipe).
 */
export function computeSetComponentUnitsReserved(
  setItems,
  resolveSetBuildableQty,
  { locationId = WAREHOUSE_FACTORY_LOCATION_ID } = {},
) {
  const reserved = new Map();
  if (typeof resolveSetBuildableQty !== 'function') return reserved;

  const rows = expandWarehouseSetItemsRows(setItems || []).filter(
    (row) => String(row.location_id) === String(locationId),
  );
  const linesBySet = new Map();
  rows.forEach((row) => {
    const setId = String(row.set_assembly_id || '');
    if (!setId) return;
    if (!linesBySet.has(setId)) linesBySet.set(setId, []);
    linesBySet.get(setId).push(row);
  });

  linesBySet.forEach((lines, setId) => {
    const buildable = Math.max(0, Math.floor(Number(resolveSetBuildableQty(setId)) || 0));
    if (!buildable) return;
    lines.forEach((line) => {
      const componentId = String(line.component_assembly_id || '');
      if (!componentId) return;
      const perSet = Math.max(1, Number(line.quantity) || 1);
      const add = buildable * perSet;
      reserved.set(componentId, (reserved.get(componentId) || 0) + add);
    });
  });

  return reserved;
}

export function computeWarehouseComponentLeftoverQty(onHand, unitsReserved) {
  const hand = Math.max(0, Math.floor(Number(onHand) || 0));
  const reserved = Math.max(0, Math.floor(Number(unitsReserved) || 0));
  return Math.max(0, hand - reserved);
}

/** Per finished product: on-hand minus units allocated to buildable sets at Warehouse. */
export function buildWarehouseAssemblyLeftoverQtyMap(assemblyWarehouseQty, setItems, assemblies) {
  const qtyMap = assemblyWarehouseQty || {};
  const reserved = computeSetComponentUnitsReserved(
    setItems,
    (setId) => qtyMap[String(setId)] ?? 0,
  );
  const out = {};
  (assemblies || []).forEach((assembly) => {
    if (isWarehouseSetAssembly(assembly)) return;
    const id = String(assembly.id);
    out[id] = computeWarehouseComponentLeftoverQty(
      qtyMap[id] ?? 0,
      reserved.get(id) ?? 0,
    );
  });
  return out;
}
