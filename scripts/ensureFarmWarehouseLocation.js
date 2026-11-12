#!/usr/bin/env node
/**
 * Ensures `locations` has "Farm Warehouse 1" (idempotent).
 * Run: node scripts/ensureFarmWarehouseLocation.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { ensureFarmWarehouseLocation } from '../server/lib/ensureFarmWarehouseLocation.js';

async function main() {
  const db = getDataClient();
  const row = await ensureFarmWarehouseLocation(db);
  console.log('ensureFarmWarehouseLocation: ok', row.id);
}

main().catch((err) => {
  console.error('[ensureFarmWarehouseLocation:fail]', err?.message || err);
  process.exit(1);
});
