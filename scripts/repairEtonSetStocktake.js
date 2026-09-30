/**
 * Repair partial Eton set scan (table without chairs) on Lusaka rollover 2026-09-30.
 * Run: node scripts/repairEtonSetStocktake.js
 * Dry run: node scripts/repairEtonSetStocktake.js --dry-run
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

const EVENT_ID = 'b279a968-06ce-4a7f-b2b3-907ec7f44faa';
const CLOSED_PERIOD_ID = '2';
const OPEN_PERIOD_ID = '3';
const CHAIR_ID = 'b1eba03a-74d9-4579-9b88-2d1ec82556ff';
const TABLE_ID = '9547d35d-3008-4e58-a586-248e05befb81';
const ANDREW = 'andrewchama91@gmail.com';
const COMBO_ID = 52;

const dryRun = process.argv.includes('--dry-run');

function sumCountsByProduct(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    if (!r?.product_id) return;
    const pid = String(r.product_id);
    map.set(pid, (map.get(pid) || 0) + Number(r.qty || 0));
  });
  return map;
}

async function main() {
  const db = getDataClient();
  const now = new Date().toISOString();

  const { data: chairRow } = await db
    .from('stocktake_counts')
    .select('*')
    .eq('event_id', EVENT_ID)
    .eq('product_id', CHAIR_ID)
    .eq('user_email', ANDREW)
    .maybeSingle();

  if (!chairRow) {
    const payload = {
      id: `${EVENT_ID}_${CHAIR_ID}_${ANDREW}`,
      event_id: EVENT_ID,
      product_id: CHAIR_ID,
      user_email: ANDREW,
      qty: 6,
      updated_at: now,
    };
    console.log('Insert missing chair count row:', payload);
    if (!dryRun) {
      const { error } = await db.from('stocktake_counts').upsert([payload], {
        onConflict: 'event_id,product_id,user_email',
      });
      if (error) throw error;
      await db.from('stocktake_count_log').insert([{
        event_id: EVENT_ID,
        product_id: CHAIR_ID,
        user_email: ANDREW,
        qty_added: 6,
        qty_after: 6,
      }]);
    }
  } else {
    console.log('Chair count row already exists:', chairRow);
  }

  const { data: counts, error: cErr } = await db
    .from('stocktake_counts')
    .select('product_id, qty')
    .eq('event_id', EVENT_ID);
  if (cErr) throw cErr;

  const totals = sumCountsByProduct(counts);
  console.log('Eton table total', totals.get(TABLE_ID), 'chair total', totals.get(CHAIR_ID));
  console.log('Event product lines after repair:', totals.size);

  const closingRows = [...totals.entries()].map(([product_id, qty]) => ({
    session_id: CLOSED_PERIOD_ID,
    product_id,
    qty,
  }));
  const openingRows = closingRows.map((r) => ({ ...r, session_id: OPEN_PERIOD_ID }));

  console.log(`Upsert ${closingRows.length} closing rows on period ${CLOSED_PERIOD_ID}`);
  console.log(`Upsert ${openingRows.length} opening rows on period ${OPEN_PERIOD_ID}`);

  if (!dryRun) {
    for (const batch of chunkArray(closingRows, 400)) {
      const { error } = await db.from('closing_stock_entries').upsert(batch, {
        onConflict: 'session_id,product_id',
      });
      if (error) throw error;
    }
    for (const batch of chunkArray(openingRows, 400)) {
      const { error } = await db.from('opening_stock_entries').upsert(batch, {
        onConflict: 'session_id,product_id',
      });
      if (error) throw error;
    }

    const { data: invChair } = await db
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', CHAIR_ID)
      .eq('location', 'f72aa989-3888-4a45-96ed-15dc45b5d399');
    console.log('Lusaka chair inventory after repair (verify manually):', invChair);
  }

  console.log(dryRun ? 'Dry run complete.' : 'Repair complete.');
}

function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
