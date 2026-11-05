/**
 * Firestore: register carpentry production collections (no SQL in this project).
 * Usage: node scripts/applyCarpentryProductionSchema.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { getFirestore } from '../server/lib/firestoreDb.js';

const META_DOC = '_schema/carpentry_production_v1';

async function main() {
  const db = getDataClient();
  const firestore = getFirestore();
  if (!firestore) throw new Error('Firestore not configured');

  await firestore.doc(META_DOC).set({
    collections: [
      'carpentry_production_runs',
      'carpentry_production_material_usage',
      'quote_production_routing',
    ],
    applied_at: new Date().toISOString(),
    note: 'UUID id tables registered in firestoreServerClient.js',
  }, { merge: true });

  const probeId = '00000000-0000-4000-8000-000000000001';
  const tables = ['carpentry_production_runs', 'carpentry_production_material_usage'];
  for (const table of tables) {
    const { error } = await db.from(table).select('id', { head: true, count: 'exact' });
    if (error) throw new Error(`${table}: ${error.message || error}`);
  }
  const { error: routeErr } = await db.from('quote_production_routing').select('quote_id', { head: true, count: 'exact' });
  if (routeErr) throw new Error(`quote_production_routing: ${routeErr.message || routeErr}`);

  console.log('applyCarpentryProductionSchema: ok (Firestore collections ready)');
  console.log('probe id (unused):', probeId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
