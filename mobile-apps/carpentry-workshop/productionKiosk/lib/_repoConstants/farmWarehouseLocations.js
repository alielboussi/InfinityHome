/** On-farm stock — same assemblies / WIP photos as Floor 2, separate inventory rows. */
export const FARM_WAREHOUSE_1_LOCATION_NAME = 'Farm Warehouse 1';

export function resolveFarmWarehouse1Location(allLocations) {
  const target = FARM_WAREHOUSE_1_LOCATION_NAME;
  const row = (allLocations || []).find((l) => String(l.name || '').trim() === target);
  return row || null;
}
