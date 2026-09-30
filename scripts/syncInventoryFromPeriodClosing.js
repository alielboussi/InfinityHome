/**
 * Apply closing_stock_entries for a closed period to inventory + product_locations.
 * Usage: node scripts/syncInventoryFromPeriodClosing.js <periodId>
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const periodId = process.argv[2];
  if (!periodId) {
    console.error('Usage: node scripts/syncInventoryFromPeriodClosing.js <periodId>');
    process.exit(1);
  }
  const db = getDataClient();
  const { data: period, error: pErr } = await db.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
  if (pErr) throw pErr;
  if (!period) throw new Error('Period not found');
  const locationId = period.location_id;
  const { data: closing, error: cErr } = await db
    .from('closing_stock_entries')
    .select('product_id, qty')
    .eq('session_id', String(periodId));
  if (cErr) throw cErr;
  const totals = new Map();
  (closing || []).forEach((r) => {
    if (!r?.product_id) return;
    totals.set(String(r.product_id), (totals.get(String(r.product_id)) || 0) + Number(r.qty || 0));
  });
  const now = new Date().toISOString();
  const invPayload = [...totals.entries()].map(([product_id, quantity]) => ({
    product_id,
    location: locationId,
    quantity: Math.max(0, Number(quantity) || 0),
    updated_at: now,
  }));
  const linkPayload = [...totals.keys()].map((product_id) => ({
    product_id,
    location_id: locationId,
  }));
  for (const chunk of chunkArray(invPayload, 500)) {
    const { error: invErr } = await db.from('inventory').upsert(chunk, { onConflict: 'product_id,location' });
    if (invErr) throw invErr;
  }
  for (const chunk of chunkArray(linkPayload, 500)) {
    const { error: plErr } = await db.from('product_locations').upsert(chunk, { onConflict: 'product_id,location_id' });
    if (plErr) throw plErr;
  }
  console.log(`Synced ${invPayload.length} inventory rows and ${linkPayload.length} product_locations links for period ${periodId} (location ${locationId}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
