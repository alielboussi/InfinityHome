/** On-farm stock — same assemblies / WIP photos as Floor 2, separate inventory rows. */
export const FARM_WAREHOUSE_1_LOCATION_NAME = 'Farm Warehouse 1';

export function isFarmWarehouseLocation(location) {
  if (!location) return false;
  const name = String(location.name || '').trim();
  const meta = location.metadata && typeof location.metadata === 'object' ? location.metadata : {};
  if (meta.farm_warehouse === true || meta.farm_warehouse_1 === true) return true;
  return /^farm warehouse(\s+\d+)?$/i.test(name);
}

export function listFarmWarehouseLocations(allLocations) {
  return (allLocations || [])
    .filter(isFarmWarehouseLocation)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }));
}

/** Default farm location: named Farm Warehouse 1 if present, otherwise the first farm warehouse. */
export function resolveFarmWarehouse1Location(allLocations) {
  const list = listFarmWarehouseLocations(allLocations);
  const exact = list.find((l) => String(l.name || '').trim() === FARM_WAREHOUSE_1_LOCATION_NAME);
  return exact || list[0] || null;
}
