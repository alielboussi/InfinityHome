/**
 * Correct Lusaka initial stocktake: Recliner #11710 opening qty 2 (was 3 in counts).
 * Run: node scripts/repairRecliner11710Opening.js
 * Dry run: node scripts/repairRecliner11710Opening.js --dry-run
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

const INITIAL_EVENT_ID = '7a5291aa-7ee8-44bd-8df0-53070449f3a9';
const OPENING_PERIOD_ID = '1db65892-44f1-4bf8-8c9a-1b9e3d20e920';
const PRODUCT_ID = '714a9e91-66a5-44e0-bf8e-0973c38a6a42';
const TARGET_QTY = 2;

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const db = getDataClient();
  const now = new Date().toISOString();

  const { data: product, error: pErr } = await db
    .from('products')
    .select('id, sku, name')
    .eq('id', PRODUCT_ID)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) throw new Error('Product #11710 not found');
  console.log('Product:', product.sku, product.name);

  const { data: countRows, error: cErr } = await db
    .from('stocktake_counts')
    .select('id, event_id, product_id, user_email, qty')
    .eq('event_id', INITIAL_EVENT_ID)
    .eq('product_id', PRODUCT_ID);
  if (cErr) throw cErr;
  console.log('stocktake_counts before:', countRows);

  if (!dryRun && (countRows || []).length) {
    for (const row of countRows) {
      const { error } = await db
        .from('stocktake_counts')
        .update({ qty: TARGET_QTY, updated_at: now })
        .eq('id', row.id);
      if (error) throw error;
    }
  }

  const { data: openingBefore, error: oErr } = await db
    .from('opening_stock_entries')
    .select('id, session_id, product_id, qty')
    .eq('session_id', OPENING_PERIOD_ID)
    .eq('product_id', PRODUCT_ID);
  if (oErr) throw oErr;
  console.log('opening_stock_entries before:', openingBefore);

  if (!dryRun) {
    const keepId = (openingBefore || []).length === 1
      ? openingBefore[0].id
      : `${OPENING_PERIOD_ID}_${PRODUCT_ID}`;
    for (const row of openingBefore || []) {
      if (row.id !== keepId) {
        const { error: delErr } = await db.from('opening_stock_entries').delete().eq('id', row.id);
        if (delErr) throw delErr;
      }
    }
    const { error: upsertErr } = await db.from('opening_stock_entries').upsert(
      [{
        id: keepId,
        session_id: OPENING_PERIOD_ID,
        product_id: PRODUCT_ID,
        qty: TARGET_QTY,
      }],
      { onConflict: 'session_id,product_id' },
    );
    if (upsertErr) throw upsertErr;
  }

  if (dryRun) {
    console.log('Dry run — no writes.');
    return;
  }

  const { data: countAfter } = await db
    .from('stocktake_counts')
    .select('qty')
    .eq('event_id', INITIAL_EVENT_ID)
    .eq('product_id', PRODUCT_ID);
  const { data: openAfter } = await db
    .from('opening_stock_entries')
    .select('qty')
    .eq('session_id', OPENING_PERIOD_ID)
    .eq('product_id', PRODUCT_ID);
  console.log('stocktake_counts after:', countAfter);
  console.log('opening_stock_entries after:', openAfter);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
