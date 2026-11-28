/** WIP after carpentry (before upholstery / painting) — row in `locations`. */
export const WAREHOUSE_FLOOR_2_LOCATION_NAME = 'Warehouse Floor 2';

export function resolveWarehouseFloor2Location(allLocations) {
  const target = WAREHOUSE_FLOOR_2_LOCATION_NAME;
  const row = (allLocations || []).find((l) => String(l.name || '').trim() === target);
  return row || null;
}
