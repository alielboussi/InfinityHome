#!/usr/bin/env node
/**
 * Ensures `locations` has "Farm Warehouse 1" (idempotent).
 * Run: node scripts/ensureFarmWarehouseLocation.js
 */
import 'dotenv/config';
import { FARM_WAREHOUSE_1_LOCATION_NAME } from '../src/constants/farmWarehouseLocations.js';

async function main() {
  const { getService } = await import('../server/lib/supabaseService.js');
  const sb = getService();
  const { data: rows, error } = await sb.from('locations').select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const hit = (rows || []).find((r) => String(r.name || '').trim() === FARM_WAREHOUSE_1_LOCATION_NAME);
  if (hit?.id) {
    console.log('ensureFarmWarehouseLocation: ok', hit.id);
    return;
  }
  const { data: inserted, error: insErr } = await sb
    .from('locations')
    .insert({ name: FARM_WAREHOUSE_1_LOCATION_NAME })
    .select('id, name')
    .single();
  if (insErr) throw new Error(insErr.message || 'Insert failed');
  console.log('ensureFarmWarehouseLocation: created', inserted?.id);
}

main().catch((err) => {
  console.error('[ensureFarmWarehouseLocation:fail]', err?.message || err);
  process.exit(1);
});
