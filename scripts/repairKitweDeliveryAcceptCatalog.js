/**
 * Backfill Kitwe warehouse assembly qty + delivery flags for accepted deliveries.
 *
 * Usage:
 *   node scripts/repairKitweDeliveryAcceptCatalog.js WHD0000000011
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
  const filter = process.argv[2] ? String(process.argv[2]).trim() : '';
  if (!filter) {
    console.error('Usage: node scripts/repairKitweDeliveryAcceptCatalog.js <delivery_number_or_session_id>');
    process.exit(1);
  }

  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { repairKitweCatalogForSession } = await import('../server/lib/kitweDeliveryCatalogSync.js');
  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Firebase admin not configured — check .env.local');

  const result = await repairKitweCatalogForSession(sb, filter);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
