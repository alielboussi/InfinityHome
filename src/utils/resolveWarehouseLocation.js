import { FACTORY_WAREHOUSE_ID } from './locationIds.js';

/** Known central warehouse location ids (Factory / warehouse transfers). */
export const DEFAULT_WAREHOUSE_LOCATION_IDS = Object.freeze([
  FACTORY_WAREHOUSE_ID,
]);

/**
 * Same rules as web warehouse catalog: name match, then known ids, then packet stock location.
 */
export function resolveWarehouseLocation(locations, context = {}) {
  const rows = locations || [];
  const packets = context.packets || [];

  const exact = rows.find((l) => String(l.name || '').trim().toLowerCase() === 'warehouse');
  if (exact) return exact;

  const fuzzy = rows.find((l) => String(l.name || '').toLowerCase().includes('warehouse'));
  if (fuzzy) return fuzzy;

  for (const id of DEFAULT_WAREHOUSE_LOCATION_IDS) {
    const hit = rows.find((l) => String(l.id) === String(id));
    if (hit) return hit;
  }

  const locCounts = new Map();
  packets.forEach((p) => {
    const lid = p?.location_id;
    if (lid == null || lid === '') return;
    const key = String(lid);
    locCounts.set(key, (locCounts.get(key) || 0) + 1);
  });
  if (locCounts.size) {
    const topId = [...locCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const loc = rows.find((l) => String(l.id) === topId);
    if (loc) return loc;
    return { id: topId, name: 'Warehouse' };
  }

  return null;
}
