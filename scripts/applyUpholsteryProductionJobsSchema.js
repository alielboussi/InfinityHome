/**
 * Firestore: register upholstery WIP job collection.
 * Usage: node scripts/applyUpholsteryProductionJobsSchema.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { getFirestore } from '../server/lib/firestoreDb.js';

const META_DOC = '_schema/upholstery_production_jobs_v1';

async function main() {
  const db = getDataClient();
  const firestore = getFirestore();
  if (!firestore) throw new Error('Firestore not configured');

  await firestore.doc(META_DOC).set({
    collections: ['upholstery_production_jobs'],
    applied_at: new Date().toISOString(),
    note: 'WIP upholstery jobs — Floor 2 consume on start, Floor 1 + labels on finish',
  }, { merge: true });

  const { error } = await db.from('upholstery_production_jobs').select('id', { head: true, count: 'exact' });
  if (error) throw new Error(`upholstery_production_jobs: ${error.message || error}`);

  console.log('applyUpholsteryProductionJobsSchema: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
