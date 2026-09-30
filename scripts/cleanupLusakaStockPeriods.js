/**
 * Keep only Lusaka periods:
 *   1db65892… closed Aug 2 – Sep 30 15:42:03
 *   3 open from Sep 30 16:02:08
 * Run: node scripts/cleanupLusakaStockPeriods.js
 * Dry run: node scripts/cleanupLusakaStockPeriods.js --dry-run
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

const LUSAKA = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const KEEP = new Set(['1db65892-44f1-4bf8-8c9a-1b9e3d20e920', '3']);
const dryRun = process.argv.includes('--dry-run');

async function deleteSessionStock(db, sessionId) {
  const sid = String(sessionId);
  if (!dryRun) {
    await db.from('opening_stock_entries').delete().eq('session_id', sid);
    await db.from('closing_stock_entries').delete().eq('session_id', sid);
  }
  console.log('  cleared opening/closing for session', sid);
}

async function main() {
  const db = getDataClient();
  const { data: periods, error } = await db
    .from('stock_periods')
    .select('id, status, begin_period_date, end_period_date')
    .eq('location_id', LUSAKA);
  if (error) throw error;

  const toRemove = (periods || []).filter((p) => !KEEP.has(String(p.id)));
  console.log('Keeping:', [...KEEP]);
  console.log('Removing', toRemove.length, 'period(s):');
  toRemove.forEach((p) => console.log(' ', p.id, p.status, p.begin_period_date, '→', p.end_period_date));

  if (dryRun) {
    console.log('Dry run — no deletes.');
    return;
  }

  for (const p of toRemove) {
    await deleteSessionStock(db, p.id);
    const { error: dErr } = await db.from('stock_periods').delete().eq('id', p.id);
    if (dErr) throw dErr;
    console.log('Deleted period', p.id);
  }

  const { data: left } = await db
    .from('stock_periods')
    .select('id, status, begin_period_date, end_period_date, closed_at')
    .eq('location_id', LUSAKA)
    .order('opened_at', { ascending: true });
  console.log('Remaining Lusaka periods:', left);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
