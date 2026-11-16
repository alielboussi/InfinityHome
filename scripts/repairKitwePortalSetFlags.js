#!/usr/bin/env node
/**
 * Set metadata.kitwe_portal_set on warehouse sets that have a Kitwe recipe but lost the flag.
 * Usage: node scripts/repairKitwePortalSetFlags.js           (dry run)
 *        node scripts/repairKitwePortalSetFlags.js --apply
 */
import { createFirestoreServerClient } from '../server/lib/firestoreServerClient.js';
import {
  assemblyHasKitweSetRecipe,
  isKitwePortalCreatedSet,
} from '../src/utils/kitweSetStock.js';
import { isWarehouseSetAssembly } from '../src/utils/warehouseSetMath.js';

const apply = process.argv.includes('--apply');
const sb = createFirestoreServerClient();
if (!sb) {
  console.error('Firebase admin not configured.');
  process.exit(1);
}

const [{ data: assemblies }, { data: setItems }] = await Promise.all([
  sb.from('warehouse_assemblies').select('id, name, family_sku, metadata, item_kind'),
  sb.from('warehouse_set_items').select('*'),
]);

const candidates = (assemblies || []).filter(
  (a) => isWarehouseSetAssembly(a)
    && !isKitwePortalCreatedSet(a)
    && assemblyHasKitweSetRecipe(a.id, setItems),
);

if (!candidates.length) {
  console.log('repairKitwePortalSetFlags: no sets need portal flag.');
  process.exit(0);
}

console.log(`repairKitwePortalSetFlags: ${candidates.length} set(s) missing kitwe_portal_set:`);
for (const a of candidates) {
  console.log(`  - ${a.name} (${a.id})`);
}

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to update metadata.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const a of candidates) {
  const meta = { ...(a.metadata || {}), kitwe_portal_set: true, kitwe_portal_set_at: now };
  const { error } = await sb.from('warehouse_assemblies').update({ metadata: meta, updated_at: now }).eq('id', a.id);
  if (error) {
    console.error(`Failed ${a.id}:`, error.message);
    process.exit(1);
  }
}
console.log('repairKitwePortalSetFlags: applied.');