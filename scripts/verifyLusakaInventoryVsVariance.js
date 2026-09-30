/**
 * Verify Lusaka inventory matches variance report closing qty for a period.
 * Usage: node scripts/verifyLusakaInventoryVsVariance.js <periodId>
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';
import { buildVarianceRows } from '../src/utils/stocktakeVarianceRows.js';
import { dedupeInventoryRows } from '../src/utils/inventoryApi.js';

async function main() {
  const periodId = process.argv[2];
  if (!periodId) {
    console.error('Usage: node scripts/verifyLusakaInventoryVsVariance.js <periodId>');
    process.exit(1);
  }
  const db = getDataClient();
  const { data: period } = await db.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
  if (!period) throw new Error('Period not found');
  const locationId = period.location_id;

  const varianceRows = await buildVarianceRows(db, period);
  const target = new Map();
  varianceRows
    .filter((r) => r.row_type !== 'set_header' && r.product_id)
    .forEach((r) => {
      target.set(String(r.product_id), {
        sku: r.sku,
        name: r.product_name,
        qty: Math.max(0, Number(r.closing_stock_qty || 0)),
      });
    });

  const { data: inventoryRaw, error: invErr } = await db
    .from('inventory')
    .select('product_id, quantity, location, id, updated_at')
    .eq('location', locationId);
  if (invErr) throw invErr;
  const inventory = dedupeInventoryRows(inventoryRaw || []);

  const extraNonZero = [];
  const mismatches = [];
  for (const row of inventory) {
    const pid = String(row.product_id);
    const invQty = Number(row.quantity ?? 0);
    const t = target.get(pid);
    if (!t) {
      if (invQty !== 0) extraNonZero.push({ pid, invQty });
      continue;
    }
    if (invQty !== t.qty) {
      mismatches.push({ ...t, pid, invQty, expected: t.qty });
    }
  }

  const missing = [];
  for (const [pid, t] of target.entries()) {
    const row = inventory.find((r) => String(r.product_id) === pid);
    const invQty = Number(row?.quantity ?? 0);
    if (!row && t.qty > 0) missing.push({ ...t, pid });
    else if (row && invQty !== t.qty) {
      /* counted in mismatches */
    }
  }

  console.log(`Variance SKUs: ${target.size}`);
  console.log(`Inventory rows at location: ${inventory.length}`);
  console.log(`Non-zero outside variance: ${extraNonZero.length}`);
  console.log(`Qty mismatches: ${mismatches.length}`);
  console.log(`Missing inventory rows: ${missing.length}`);

  if (extraNonZero.length) {
    console.log('\nSample extra non-zero (max 10):');
    extraNonZero.slice(0, 10).forEach((r) => console.log(r));
  }
  if (mismatches.length) {
    console.log('\nMismatches (max 15):');
    mismatches.slice(0, 15).forEach((r) => console.log(r));
  }
  if (missing.length) {
    console.log('\nMissing (max 10):');
    missing.slice(0, 10).forEach((r) => console.log(r));
  }

  const ok = extraNonZero.length === 0 && mismatches.length === 0 && missing.length === 0;
  console.log(ok ? '\nOK: Lusaka inventory matches variance report.' : '\nFAIL: see above.');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
