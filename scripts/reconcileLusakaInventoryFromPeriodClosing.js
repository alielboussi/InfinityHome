/**
 * Align location inventory with a closed stock period (variance closing qty by default).
 *
 * Usage:
 *   node scripts/reconcileLusakaInventoryFromPeriodClosing.js <periodId> [--dry-run]
 *   node scripts/reconcileLusakaInventoryFromPeriodClosing.js <periodId> --full-closing [--dry-run]
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';
import { buildVarianceClosingQtyMap, reconcileInventoryFromVariance } from '../src/utils/reconcileInventoryFromVariance.js';
import { dedupeInventoryRows } from '../src/utils/inventoryApi.js';

async function fetchAllInventoryAtLocation(db, locationId) {
  const { data, error } = await db
    .from('inventory')
    .select('id, product_id, quantity, location, updated_at')
    .eq('location', locationId);
  if (error) throw error;
  return dedupeInventoryRows(data || []);
}

async function targetQtyMapFromClosing(db, periodId) {
  const { data: closing, error: cErr } = await db
    .from('closing_stock_entries')
    .select('product_id, qty')
    .eq('session_id', String(periodId));
  if (cErr) throw cErr;
  const totals = new Map();
  (closing || []).forEach((r) => {
    if (!r?.product_id) return;
    const pid = String(r.product_id);
    totals.set(pid, (totals.get(pid) || 0) + Number(r.qty || 0));
  });
  return totals;
}

async function main() {
  const args = process.argv.slice(2);
  const periodId = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const fullClosing = args.includes('--full-closing');
  if (!periodId) {
    console.error('Usage: node scripts/reconcileLusakaInventoryFromPeriodClosing.js <periodId> [--full-closing] [--dry-run]');
    process.exit(1);
  }

  const db = getDataClient();
  const { data: period, error: pErr } = await db.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
  if (pErr) throw pErr;
  if (!period) throw new Error('Period not found');

  if (!dryRun && !fullClosing) {
    const result = await reconcileInventoryFromVariance(db, period);
    console.log(`Reconciled via variance closing qty: ${result.targetSkus} SKUs, ${result.updated} inventory updates.`);
    return;
  }

  const locationId = period.location_id;
  const targetTotals = fullClosing
    ? await targetQtyMapFromClosing(db, periodId)
    : await buildVarianceClosingQtyMap(db, period);

  const existing = await fetchAllInventoryAtLocation(db, locationId);
  const existingByProduct = new Map(existing.map((r) => [String(r.product_id), r]));
  const updatesByProduct = new Map();

  targetTotals.forEach((qty, product_id) => {
    const pid = String(product_id);
    const row = existingByProduct.get(pid);
    const current = Number(row?.quantity ?? 0);
    const target = Math.max(0, Number(qty) || 0);
    if (current !== target) {
      updatesByProduct.set(pid, { product_id: pid, quantity: target, reason: row ? 'target' : 'insert' });
    }
  });

  for (const row of existing) {
    const pid = String(row.product_id);
    if (targetTotals.has(pid)) continue;
    if (Number(row.quantity ?? 0) !== 0) {
      updatesByProduct.set(pid, { product_id: pid, quantity: 0, reason: 'zero' });
    }
  }

  const updates = Array.from(updatesByProduct.values());
  const modeLabel = fullClosing ? 'full period closing' : 'variance report closing qty';
  console.log(`Location ${locationId}, period ${periodId} (${modeLabel}) [dry-run=${dryRun}]`);
  console.log(`Target SKUs: ${targetTotals.size}, inventory rows: ${existing.length}`);
  console.log(`Updates: ${updates.length}`);

  if (dryRun) {
    updates.slice(0, 25).forEach((u) => console.log(' ', u));
    return;
  }

  await reconcileInventoryFromVariance(db, period);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
