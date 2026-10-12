import {
  WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS,
} from '../constants/warehouseShowroomLocations';

/** Legacy rows without location_id apply to both Kitwe and Lusaka (read-only expansion). */
export function expandWarehouseSetItemsRows(rows) {
  const out = [];
  (rows || []).forEach((row) => {
    if (row?.location_id) {
      out.push(row);
      return;
    }
    WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS.forEach((locationId) => {
      out.push({ ...row, location_id: locationId });
    });
  });
  return out;
}

export function setItemsAssemblyLocationKey(assemblyId, locationId) {
  return `${String(assemblyId)}:${String(locationId)}`;
}

export function buildSetItemsByAssemblyAndLocation(setItems, assemblies) {
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const out = new Map();
  expandWarehouseSetItemsRows(setItems).forEach((row) => {
    const locId = row?.location_id;
    const assemblyId = row?.set_assembly_id;
    if (!locId || !assemblyId) return;
    const key = setItemsAssemblyLocationKey(assemblyId, locId);
    if (!out.has(key)) out.set(key, []);
    const component = assemblyById.get(String(row.component_assembly_id));
    out.get(key).push({ ...row, component });
  });
  out.forEach((list) => list.sort(
    (a, b) => String(a.component?.name || '').localeCompare(String(b.component?.name || '')),
  ));
  return out;
}

export function formatSetRecipeLines(lines) {
  return (lines || []).map((line) => {
    const c = line.component;
    const qty = Math.max(1, Number(line.quantity) || 1);
    return c ? `${qty}× ${c.name}` : `${qty}× (missing product)`;
  }).join(' + ');
}
