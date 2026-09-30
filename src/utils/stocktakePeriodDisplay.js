import { buildLiveConsolidatedWithSets } from './stocktakeLiveTotals';
import { buildFlattenedAggregationProductRows } from './stocktakeSubmitTotals';

/** Consistent period timestamps in the UI (date + time with seconds). */
export function formatStockPeriodDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatStockPeriodRange(period) {
  if (!period) return '';
  const begin = period.begin_period_date || period.opened_at;
  const end = period.end_period_date || period.closed_at;
  const a = formatStockPeriodDateTime(begin);
  const b = end ? formatStockPeriodDateTime(end) : 'Open';
  return `Period: ${a} → ${b}`;
}

/** Aggregation-style rows (set + component lines) from flat opening stock. */
export function buildOpeningStockAggregationRows(openingRows, combos, comboItems) {
  const counts = (openingRows || [])
    .filter((r) => r?.product_id && Number(r.qty || 0) > 0)
    .map((r) => ({
      product_id: r.product_id,
      qty: Number(r.qty || 0),
      user_email: 'opening',
      name: r.name,
      sku: r.sku,
    }));
  if (!counts.length) return [];

  const consolidated = buildLiveConsolidatedWithSets({
    counts,
    combos: combos || [],
    comboItems: comboItems || [],
    setScans: [],
  });
  return buildFlattenedAggregationProductRows(consolidated, {});
}
