/** Display names — must match rows in `locations` (see seed script). */
export const CARPENTRY_WAREHOUSE_NAMES = [
  'Carpentry Warehouse 1',
  'Carpentry Warehouse 2',
  'Carpentry Warehouse 3',
];

/** Portal / nav labels for the same three locations (DB names unchanged). */
export const CARPENTRY_STOREROOM_LABELS = ['Storeroom 1', 'Storeroom 2', 'Storeroom 3'];

export function storeroomLabelForWarehouseIndex(index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 1 || i > 3) return '';
  return CARPENTRY_STOREROOM_LABELS[i - 1] || '';
}

export function resolveCarpentryWarehouseLocations(allLocations) {
  const byName = new Map(
    (allLocations || []).map((row) => [String(row.name || '').trim(), row]),
  );
  return CARPENTRY_WAREHOUSE_NAMES.map((name) => byName.get(name) || null).filter(Boolean);
}

export function isCarpentryWarehouseLocationId(locationId, allLocations) {
  const ids = new Set(
    resolveCarpentryWarehouseLocations(allLocations).map((l) => String(l.id)),
  );
  return ids.has(String(locationId || ''));
}
