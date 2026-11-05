/**
 * Idempotent: create Carpentry Warehouse 1–3 in locations (Firestore).
 * Usage: node scripts/seedCarpentryWarehouseLocations.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { CARPENTRY_WAREHOUSE_NAMES } from '../src/constants/carpentryWarehouses.js';
import { newUuid } from '../server/lib/uuid.js';

async function main() {
  const db = getDataClient();
  const { data: existing, error } = await db.from('locations').select('id, name');
  if (error) throw error;
  const byName = new Map((existing || []).map((r) => [String(r.name || '').trim(), r]));
  const now = new Date().toISOString();
  for (const name of CARPENTRY_WAREHOUSE_NAMES) {
    if (byName.has(name)) {
      console.log(`exists: ${name} (${byName.get(name).id})`);
      continue;
    }
    const id = newUuid();
    const { error: insErr } = await db.from('locations').insert({
      id,
      name,
      metadata: { carpentry_material_warehouse: true },
      created_at: now,
      updated_at: now,
    });
    if (insErr) throw insErr;
    console.log(`created: ${name} (${id})`);
  }
  console.log('seedCarpentryWarehouseLocations: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
