/**
 * Delete locations by name (and scoped link rows).
 * node scripts/deleteLocations.js Test Carpentry
 * Dry run: node scripts/deleteLocations.js --dry-run Test Carpentry
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

const dryRun = process.argv.includes('--dry-run');
const names = process.argv.slice(2).filter((a) => a !== '--dry-run');
if (!names.length) {
  console.error('Usage: node scripts/deleteLocations.js [--dry-run] <location name> ...');
  process.exit(1);
}

async function deleteWhere(db, table, column, value) {
  const { count, error: cErr } = await db.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (cErr) throw cErr;
  if (!count) return 0;
  if (!dryRun) {
    const { error } = await db.from(table).delete().eq(column, value);
    if (error) throw error;
  }
  return count;
}

async function purgeStocktakeForLocation(db, locationId) {
  const { data: events, error } = await db.from('stocktake_events').select('id').eq('location_id', locationId);
  if (error) throw error;
  for (const ev of events || []) {
    const eid = ev.id;
    if (!dryRun) {
      await db.from('stocktake_counts').delete().eq('event_id', eid);
      await db.from('stocktake_count_log').delete().eq('event_id', eid);
      await db.from('stocktake_set_scans').delete().eq('event_id', eid);
      await db.from('stocktake_events').delete().eq('id', eid);
    }
    console.log('  stocktake event', eid);
  }
}

async function main() {
  const db = getDataClient();
  const { data: all, error } = await db.from('locations').select('id, name');
  if (error) throw error;

  for (const name of names) {
    const loc = (all || []).find((l) => String(l.name || '').trim() === name);
    if (!loc) {
      console.warn('Not found:', name);
      continue;
    }
    const id = loc.id;
    console.log(dryRun ? '[dry-run]' : '[delete]', name, id);

    await purgeStocktakeForLocation(db, id);
    const n1 = await deleteWhere(db, 'stocktake_location_state', 'location_id', id);
    const n2 = await deleteWhere(db, 'stocktake_gate_audit', 'location_id', id);
    const n3 = await deleteWhere(db, 'product_locations', 'location_id', id);
    const n4 = await deleteWhere(db, 'combo_locations', 'location_id', id);
    const n5 = await deleteWhere(db, 'inventory', 'location', id);
    const n6 = await deleteWhere(db, 'stock_periods', 'location_id', id);
    console.log('  removed rows:', { product_locations: n3, combo_locations: n4, inventory: n5, periods: n6, state: n1, audit: n2 });

    if (!dryRun) {
      const { error: dErr } = await db.from('locations').delete().eq('id', id);
      if (dErr) throw dErr;
    }
    console.log('  location deleted');
  }

  const { data: left } = await db.from('locations').select('id, name').order('name');
  console.log('Remaining locations:', left);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
