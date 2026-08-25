/**
 * Search for Lenor Coffee Table product variants in Firestore.
 * Run: node scripts/searchLenorProduct.js
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

async function fetchAll(db, table) {
  const { data, error } = await db.from(table).select('*');
  if (error) throw error;
  return data || [];
}

async function main() {
  const db = getDataClient();
  const [products, combos, comboItems] = await Promise.all([
    fetchAll(db, 'products'),
    fetchAll(db, 'combos'),
    fetchAll(db, 'combo_items'),
  ]);

  const matchLenor = (text) => /lenor/i.test(String(text || ''));
  const matchCoffee = (text) => /coffee/i.test(String(text || ''));
  const matchPuff = (text) => /puff/i.test(String(text || ''));
  const matchStorage = (text) => /storage/i.test(String(text || ''));

  const lenorProducts = products.filter((p) => matchLenor(p.name) || matchLenor(p.sku));
  const lenorCombos = combos.filter((c) => matchLenor(c.combo_name) || matchLenor(c.sku));

  console.log(`\n=== All products matching "lenor" (${lenorProducts.length}) ===`);
  for (const p of lenorProducts) {
    console.log(`  [${p.id}] ${p.name} | sku: ${p.sku || '—'}`);
  }

  console.log(`\n=== All combos matching "lenor" (${lenorCombos.length}) ===`);
  for (const c of lenorCombos) {
    console.log(`  [${c.id}] ${c.combo_name} | sku: ${c.sku || '—'}`);
  }

  const targets = products.filter((p) => {
    const name = String(p.name || '');
    return matchLenor(name) && matchCoffee(name);
  });

  console.log(`\n=== Lenor + Coffee Table products (${targets.length}) ===`);
  for (const p of targets) {
    const [{ data: imgs }, { data: inv }, { data: pl }] = await Promise.all([
      db.from('product_images').select('id, image_url').eq('product_id', p.id),
      db.from('inventory').select('location, quantity').eq('product_id', p.id),
      db.from('product_locations').select('location_id').eq('product_id', p.id),
    ]);
    const puffStorage = matchPuff(p.name) && matchStorage(p.name);
    const puffOnly = matchPuff(p.name) && !matchStorage(p.name);
    console.log({
      id: p.id,
      name: p.name,
      sku: p.sku,
      variant: puffStorage ? 'puff+storage' : (puffOnly ? 'puff' : 'other'),
      imageCount: imgs?.length || 0,
      inventoryRows: inv?.length || 0,
      inventory: inv,
      locationCount: pl?.length || 0,
    });
  }

  const puffStorageProducts = products.filter((p) => {
    const name = String(p.name || '');
    return matchLenor(name) && matchPuff(name) && matchStorage(name);
  });
  console.log(`\n=== Exact: Lenor + puff + storage (${puffStorageProducts.length}) ===`);
  puffStorageProducts.forEach((p) => console.log(`  [${p.id}] ${p.name}`));

  const puffProducts = products.filter((p) => {
    const name = String(p.name || '');
    return matchLenor(name) && matchPuff(name) && !matchStorage(name);
  });
  console.log(`\n=== Lenor + puff (no storage) (${puffProducts.length}) ===`);
  puffProducts.forEach((p) => console.log(`  [${p.id}] ${p.name}`));

  // Sets that include a lenor component
  const lenorProductIds = new Set(lenorProducts.map((p) => String(p.id)));
  const lenorSets = comboItems
    .filter((item) => lenorProductIds.has(String(item.product_id)))
    .map((item) => combos.find((c) => String(c.id) === String(item.combo_id)))
    .filter(Boolean);
  const uniqueSets = [...new Map(lenorSets.map((c) => [String(c.id), c])).values()];
  if (uniqueSets.length) {
    console.log(`\n=== Sets containing a Lenor product (${uniqueSets.length}) ===`);
    uniqueSets.forEach((c) => console.log(`  [${c.id}] ${c.combo_name}`));
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
