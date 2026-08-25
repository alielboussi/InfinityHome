/**
 * Reset Kitwe stock quantities shown as negative back to 0 in live inventory.
 *
 * Products List was showing computed qty (opening + in - sales), not live inventory.
 * This script finds Kitwe products where that computed qty is < 0 and sets live
 * inventory to 0 (upserting rows when missing).
 *
 * Run: node scripts/resetKitweNegativeStock.js
 * Dry run: node scripts/resetKitweNegativeStock.js --dry-run
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';
import { computeExpectedInventoryMap } from '../src/utils/computedInventoryQty.js';
import { classifyInventoryAdjustmentDelta } from '../src/utils/inventoryVarianceAdjustments.js';
import { docIdFromOnConflict } from '../src/db/docIds.js';

const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const dryRun = process.argv.includes('--dry-run');

async function fetchKitweLiveMap(db) {
  const { data, error } = await db
    .from('inventory')
    .select('id, product_id, location, quantity, updated_at')
    .eq('location', KITWE_LOCATION_ID);
  if (error) throw error;
  const byProduct = new Map();
  (data || []).forEach((row) => {
    const pid = String(row.product_id || '');
    if (!pid) return;
    const existing = byProduct.get(pid);
    if (!existing) {
      byProduct.set(pid, row);
      return;
    }
    existing.quantity = Number(existing.quantity || 0) + Number(row.quantity || 0);
  });
  return byProduct;
}

async function fetchProductNames(db, productIds) {
  const names = new Map();
  const chunkSize = 30;
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize);
    const { data, error } = await db
      .from('products')
      .select('id, name, sku')
      .in('id', chunk);
    if (error) throw error;
    (data || []).forEach((row) => {
      names.set(String(row.id), row.name || row.sku || row.id);
    });
  }
  return names;
}

async function cleanupKitweDuplicateRows(db, productIds = []) {
  const { data, error } = await db
    .from('inventory')
    .select('id, product_id, location, quantity')
    .eq('location', KITWE_LOCATION_ID);
  if (error) throw error;

  const byProduct = new Map();
  (data || []).forEach((row) => {
    const pid = String(row.product_id || '');
    if (!pid) return;
    if (productIds.length && !productIds.includes(pid)) return;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(row);
  });

  let deleted = 0;
  for (const [productId, rows] of byProduct.entries()) {
    if (rows.length <= 1) continue;
    const canonicalId = docIdFromOnConflict(
      { product_id: productId, location: KITWE_LOCATION_ID },
      'product_id,location',
    );
    const legacy = rows.filter((row) => String(row.id) !== canonicalId);
    if (!legacy.length) continue;

    const { error: upsertErr } = await db
      .from('inventory')
      .upsert([{
        product_id: productId,
        location: KITWE_LOCATION_ID,
        quantity: 0,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'product_id,location' });
    if (upsertErr) throw upsertErr;

    for (const row of legacy) {
      const { error: delErr } = await db.from('inventory').delete().eq('id', row.id);
      if (delErr) throw delErr;
      deleted += 1;
    }
  }

  return deleted;
}

async function main() {
  const db = getDataClient();
  const [liveByProduct, computedMap] = await Promise.all([
    fetchKitweLiveMap(db),
    computeExpectedInventoryMap(db, KITWE_LOCATION_ID),
  ]);

  const targets = [];
  computedMap.forEach((computedQty, productId) => {
    if (Number(computedQty) >= 0) return;
    const liveRow = liveByProduct.get(String(productId)) || null;
    const liveQty = liveRow ? Number(liveRow.quantity || 0) : null;
    targets.push({
      productId: String(productId),
      computedQty: Number(computedQty),
      liveQty,
      liveRow,
    });
  });

  // Also catch any live-negative rows the computed map may have missed.
  liveByProduct.forEach((row, productId) => {
    if (Number(row.quantity) >= 0) return;
    if (targets.some((t) => t.productId === productId)) return;
    targets.push({
      productId,
      computedQty: computedMap.get(productId) ?? null,
      liveQty: Number(row.quantity),
      liveRow: row,
    });
  });

  targets.sort((a, b) => a.computedQty - b.computedQty);

  const productNames = await fetchProductNames(db, targets.map((t) => t.productId));

  console.log(`Kitwe products with negative displayed/computed stock: ${targets.length}`);
  if (!targets.length) {
    console.log('Nothing to update.');
    return;
  }

  let willChange = 0;
  targets.forEach((target) => {
    const label = productNames.get(target.productId) || target.productId;
    const liveLabel = target.liveQty == null ? 'no row' : String(target.liveQty);
    const action = (target.liveQty == null || target.liveQty !== 0) ? '-> 0' : 'already 0 (live)';
    if (target.liveQty == null || target.liveQty !== 0) willChange += 1;
    console.log(`  ${label}: computed ${target.computedQty}, live ${liveLabel} ${action}`);
  });

  console.log(`\nLive inventory rows to write: ${willChange}`);

  if (dryRun) {
    console.log('\nDry run only — no changes written.');
    return;
  }

  const nowIso = new Date().toISOString();
  let updated = 0;
  let skipped = 0;

  for (const target of targets) {
    const priorQty = target.liveQty == null ? 0 : Number(target.liveQty);
    if (priorQty === 0 && target.liveRow) {
      skipped += 1;
      continue;
    }

    const delta = -priorQty;
    const { type: resetType, quantity: resetQty } = classifyInventoryAdjustmentDelta(delta);

    const { error: upsertErr } = await db
      .from('inventory')
      .upsert([{
        product_id: target.productId,
        location: KITWE_LOCATION_ID,
        quantity: 0,
        updated_at: nowIso,
      }], { onConflict: 'product_id,location' });
    if (upsertErr) throw upsertErr;

    const { error: adjErr } = await db.from('inventory_adjustments').insert({
      product_id: target.productId,
      location_id: KITWE_LOCATION_ID,
      quantity: resetQty,
      adjustment_type: resetType,
      adjusted_at: nowIso,
      metadata: {
        prior_quantity: priorQty,
        before_qty: priorQty,
        after_qty: 0,
        computed_qty: target.computedQty,
        delta,
        reason: 'Kitwe negative stock reset script',
        source: 'reset-kitwe-negative-stock',
      },
    });
    if (adjErr) throw adjErr;
    updated += 1;
  }

  const deletedDupes = await cleanupKitweDuplicateRows(db, targets.map((t) => t.productId));

  console.log(`\nUpdated ${updated} Kitwe inventory row(s) to 0.`);
  if (deletedDupes) {
    console.log(`Removed ${deletedDupes} legacy duplicate Kitwe inventory row(s).`);
  }
  if (skipped) {
    console.log(`${skipped} product(s) already had live qty 0 — refresh Products List after deploy to see 0 instead of computed negatives.`);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
