import { FARM_WAREHOUSE_1_LOCATION_NAME } from '../../src/constants/farmWarehouseLocations.js';
import { newUuid } from './uuid.js';

/**
 * Idempotent: ensure locations row "Farm Warehouse 1" exists.
 * @returns {{ id: string, name: string }}
 */
export async function ensureFarmWarehouseLocation(sb) {
  if (!sb) throw new Error('Database client is required.');
  const { data: rows, error } = await sb.from('locations').select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const hit = (rows || []).find((r) => String(r.name || '').trim() === FARM_WAREHOUSE_1_LOCATION_NAME);
  if (hit?.id) return { id: String(hit.id), name: FARM_WAREHOUSE_1_LOCATION_NAME };

  const id = newUuid();
  const now = new Date().toISOString();
  const { error: insErr } = await sb.from('locations').insert({
    id,
    name: FARM_WAREHOUSE_1_LOCATION_NAME,
    metadata: { farm_warehouse_1: true },
    created_at: now,
    updated_at: now,
  });
  if (insErr) throw new Error(insErr.message || 'Failed to create Farm Warehouse 1 location');
  return { id, name: FARM_WAREHOUSE_1_LOCATION_NAME };
}
