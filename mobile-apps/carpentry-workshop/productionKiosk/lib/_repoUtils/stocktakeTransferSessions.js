/** STOCKTAKE_PIPELINE_LOCKED — see docs/stocktake-pdf-pipeline.md; do not edit without owner authorization. */
/**
 * Stock transfer sessions counted in period variance (Trans In / Trans Out).
 * — `/transfers` page: status `approved` only (new entries).
 * — Legacy product-list moves: null/empty status (still in period totals).
 */
const LEGACY_VARIANCE_STATUS_OR = 'status.eq.approved,status.is.null';

export function transferSessionCountsInVariance(session) {
  const status = String(session?.status ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'failed') return false;
  if (status === 'approved') return true;
  return session?.status == null || status === '';
}

function mergeSessionIds(...lists) {
  const ids = new Set();
  lists.flat().forEach((row) => {
    if (row?.id) ids.add(row.id);
  });
  return [...ids];
}

export async function sumTransfers(sb, locationId, startISO, endISO, direction) {
  const locCol = direction === 'in' ? 'to_location' : 'from_location';
  const map = new Map();

  const { data: sessionsDt, error: dtErr } = await sb
    .from('stock_transfer_sessions')
    .select('id, status')
    .eq(locCol, locationId)
    .or(LEGACY_VARIANCE_STATUS_OR)
    .not('transfer_datetime', 'is', null)
    .gte('transfer_datetime', startISO)
    .lte('transfer_datetime', endISO);
  if (dtErr) throw dtErr;

  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);
  const { data: sessionsDate, error: dateErr } = await sb
    .from('stock_transfer_sessions')
    .select('id, status')
    .eq(locCol, locationId)
    .or(LEGACY_VARIANCE_STATUS_OR)
    .is('transfer_datetime', null)
    .gte('transfer_date', startDate)
    .lte('transfer_date', endDate);
  if (dateErr) throw dateErr;

  const ids = mergeSessionIds(
    (sessionsDt || []).filter(transferSessionCountsInVariance),
    (sessionsDate || []).filter(transferSessionCountsInVariance),
  );
  if (!ids.length) return map;

  const { data: entries, error: entErr } = await sb
    .from('stock_transfer_entries')
    .select('product_id, quantity')
    .in('session_id', ids);
  if (entErr) throw entErr;
  (entries || []).forEach((e) => {
    const pid = e?.product_id == null || e.product_id === '' ? '' : String(e.product_id);
    if (!pid) return;
    map.set(pid, (map.get(pid) || 0) + Number(e.quantity || 0));
  });
  return map;
}
