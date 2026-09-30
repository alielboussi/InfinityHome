/**
 * Debug variance for Lusaka Aug–Sep 2026 period.
 * node scripts/debugLusakaVariance.js [periodId]
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

const LUSAKA = 'f72aa989-3888-4a45-96ed-15dc45b5d399';

async function main() {
  const db = getDataClient();
  const periodId = process.argv[2];

  let period;
  if (periodId) {
    const { data } = await db.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
    period = data;
  } else {
    const { data: rows } = await db
      .from('stock_periods')
      .select('*')
      .eq('location_id', LUSAKA)
      .order('opened_at', { ascending: false });
    console.log('Periods:');
    for (const p of rows || []) {
      console.log(
        p.id,
        p.status,
        p.begin_period_date || p.opened_at,
        '→',
        p.end_period_date || p.closed_at,
      );
    }
    period = (rows || []).find((p) => p.status === 'closed' && String(p.begin_period_date || '').startsWith('2026-08'));
  }

  if (!period) {
    console.log('No period found');
    return;
  }

  console.log('\nUsing period', period.id, period.status);

  const [{ data: opening }, { data: closing }] = await Promise.all([
    db.from('opening_stock_entries').select('product_id, qty').eq('session_id', period.id),
    db.from('closing_stock_entries').select('product_id, qty').eq('session_id', period.id),
  ]);
  console.log('Opening lines:', (opening || []).length, 'sum', (opening || []).reduce((s, r) => s + Number(r.qty || 0), 0));
  console.log('Closing lines:', (closing || []).length, 'sum', (closing || []).reduce((s, r) => s + Number(r.qty || 0), 0));

  const startISO = period.begin_period_date || period.opened_at;
  const endISO = period.end_period_date || period.closed_at;
  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);

  const { data: byDate } = await db
    .from('sales')
    .select('id, receipt_number, sale_date, created_at')
    .eq('location_id', LUSAKA)
    .not('sale_date', 'is', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: true });

  console.log('\nSales by sale_date in range', startDate, '–', endDate, ':', (byDate || []).length);
  for (const s of byDate || []) {
    console.log(' ', s.sale_date, s.created_at, s.receipt_number, s.id);
  }

  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const inWindow = (byDate || []).filter((s) => {
    const t = new Date(s.created_at || s.sale_date).getTime();
    return t >= startMs && t <= endMs;
  });
  console.log('Sales with created_at in period window:', inWindow.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
