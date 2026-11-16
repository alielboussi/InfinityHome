#!/usr/bin/env node
/**
 * Report Kitwe sets vs loose components for a name needle (e.g. "Teddy").
 * Usage: node scripts/inspectKitweSetCatalog.js Teddy
 * Requires Firebase admin (same env as other maintenance scripts).
 */
import { createFirestoreServerClient } from '../server/lib/firestoreServerClient.js';
import { KITWE_LOCATION_ID } from '../src/constants/warehouseShowroomLocations.js';
import {
  assemblyHasKitweSetRecipe,
  isKitweCatalogSetAssembly,
  isKitwePortalCreatedSet,
} from '../src/utils/kitweSetStock.js';
import { isWarehouseSetAssembly } from '../src/utils/warehouseSetMath.js';
import { expandWarehouseSetItemsRows } from '../src/utils/warehouseSetItems.js';

const needle = String(process.argv[2] || '').trim().toLowerCase();
if (!needle) {
  console.error('Usage: node scripts/inspectKitweSetCatalog.js <name-needle>');
  process.exit(1);
}

const sb = createFirestoreServerClient();
if (!sb) {
  console.error('Firebase admin not configured.');
  process.exit(1);
}

const [{ data: assemblies }, { data: setItems }, { data: inv }] = await Promise.all([
  sb.from('warehouse_assemblies').select('id, name, family_sku, metadata, item_kind'),
  sb.from('warehouse_set_items').select('*'),
  sb.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity'),
]);

const matches = (a) => String(a?.name || '').toLowerCase().includes(needle)
  || String(a?.family_sku || '').toLowerCase().includes(needle);

const hits = (assemblies || []).filter(matches);
const kitweQty = (id) => {
  const row = (inv || []).find(
    (r) => String(r.assembly_id) === String(id) && String(r.location_id) === KITWE_LOCATION_ID,
  );
  return Math.max(0, Number(row?.quantity) || 0);
};

console.log(`\nKitwe catalog inspect — needle: "${needle}"\n`);

for (const a of hits) {
  const id = String(a.id);
  const setAsm = isWarehouseSetAssembly(a);
  const portalFlag = isKitwePortalCreatedSet(a);
  const hasRecipe = assemblyHasKitweSetRecipe(id, setItems);
  const catalogSet = isKitweCatalogSetAssembly(a, setItems);
  console.log(`• ${a.name} [${a.family_sku || '—'}]`);
  console.log(`  id=${id} kind=${a.item_kind || '—'} kitwe_qty=${kitweQty(id)}`);
  console.log(`  portal_set=${portalFlag} kitwe_recipe=${hasRecipe} catalog_set=${catalogSet}`);
  if (setAsm && hasRecipe) {
    const comps = expandWarehouseSetItemsRows(setItems || []).filter(
      (r) => String(r.set_assembly_id) === id && String(r.location_id) === KITWE_LOCATION_ID,
    );
    console.log('  components at Kitwe:');
    comps.forEach((c) => {
      const comp = (assemblies || []).find((x) => String(x.id) === String(c.component_assembly_id));
      console.log(`    - ${comp?.name || c.component_assembly_id} ×${c.quantity} (kitwe_qty=${kitweQty(c.component_assembly_id)})`);
    });
  }
  if (setAsm && !catalogSet) {
    console.log('  → Set exists but has NO Kitwe recipe / portal flag — will NOT show as set row on /kitwe-products.');
  }
  if (!setAsm && kitweQty(id) > 0) {
    const inRecipe = expandWarehouseSetItemsRows(setItems || []).some(
      (r) => String(r.component_assembly_id) === id && String(r.location_id) === KITWE_LOCATION_ID,
    );
    if (inRecipe) {
      console.log('  → Component is in a Kitwe set recipe (should be hidden unless loose metadata).');
    } else {
      console.log('  → Listed as individual Kitwe product (not in any Kitwe set recipe).');
    }
  }
  console.log('');
}

if (!hits.length) console.log('No assemblies matched. Try a shorter needle.\n');