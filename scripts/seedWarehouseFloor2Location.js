/**
 * Idempotent: create Warehouse Floor 2 location (carpentry WIP before upholstery / Floor 1).
 * Usage: node scripts/seedWarehouseFloor2Location.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { WAREHOUSE_FLOOR_2_LOCATION_NAME } from '../src/constants/warehouseFloorLocations.js';
import { newUuid } from '../server/lib/uuid.js';

async function main() {
  const db = getDataClient();
  const { data: existing, error } = await db.from('locations').select('id, name');
  if (error) throw error;
  const byName = new Map((existing || []).map((r) => [String(r.name || '').trim(), r]));
  if (byName.has(WAREHOUSE_FLOOR_2_LOCATION_NAME)) {
    console.log(`exists: ${WAREHOUSE_FLOOR_2_LOCATION_NAME} (${byName.get(WAREHOUSE_FLOOR_2_LOCATION_NAME).id})`);
  } else {
    const id = newUuid();
    const now = new Date().toISOString();
    const { error: insErr } = await db.from('locations').insert({
      id,
      name: WAREHOUSE_FLOOR_2_LOCATION_NAME,
      metadata: { warehouse_floor_2_wip: true },
      created_at: now,
      updated_at: now,
    });
    if (insErr) throw insErr;
    console.log(`created: ${WAREHOUSE_FLOOR_2_LOCATION_NAME} (${id})`);
  }
  console.log('seedWarehouseFloor2Location: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
