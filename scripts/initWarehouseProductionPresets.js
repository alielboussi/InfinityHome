/**
 * Seed warehouse_production_presets in Firestore (no Postgres — see docs/supabase-warehouse-production-presets.sql for schema reference).
 *
 * Usage: node scripts/initWarehouseProductionPresets.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { listProductionPresetsGrouped } = await import('../server/lib/warehouseProductionPresets.js');
  const sb = createFirestoreServerClient();
  if (!sb) {
    throw new Error('Firebase admin not configured — set GOOGLE_APPLICATION_CREDENTIALS or Firebase env in .env.local');
  }
  const grouped = await listProductionPresetsGrouped(sb);
  console.log('warehouse_production_presets ready:');
  console.log(`  seater: ${grouped.seater.length} presets`);
  console.log(`  carpentry: ${grouped.carpentry.length} presets`);
  grouped.seater.forEach((label) => console.log(`    [seater] ${label}`));
  grouped.carpentry.forEach((label) => console.log(`    [carpentry] ${label}`));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
