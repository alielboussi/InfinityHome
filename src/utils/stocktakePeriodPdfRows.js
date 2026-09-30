/**
 * Single source of truth for opening/closing period PDF line items (all locations).
 * — Flat component/product lines only (set scans expanded); A–Z by name.
 * — Closed periods: same products/qtys as variance (`periodLedgerPdfRowsFromVariance`).
 * — Open periods: flat qty from period stock entries (never set-group aggregation rows).
 */
import { periodLedgerPdfRowsFromVariance } from './periodPdfFromVariance';

export function periodPdfRowsFromScannedAggregation(rows) {
  return (rows || [])
    .filter((row) => row.row_type !== 'set_header' && row.row_type !== 'set')
    .map((row) => ({
      sku: row.sku || '',
      name: row.name || row.product_name || '',
      qty: Number(row.qty || 0),
    }))
    .filter((row) => row.qty > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
}

export function flatProductLedgerRowsFromPeriodEntries(entries) {
  return periodPdfRowsFromScannedAggregation(
    (entries || []).map((r) => ({
      sku: r.sku,
      name: r.name || r.product_name,
      qty: r.qty,
    })),
  );
}

export async function resolveOpeningPdfRows({ period, detail, getPeriodVariance }) {
  const isClosed = String(period?.status || '').toLowerCase() === 'closed';
  if (isClosed && period?.id && getPeriodVariance) {
    const data = await getPeriodVariance(period.id);
    return periodLedgerPdfRowsFromVariance(data.rows, 'opening');
  }
  return flatProductLedgerRowsFromPeriodEntries(detail?.opening);
}

export async function resolveClosingPdfRows({ period, detail, getPeriodVariance }) {
  const isClosed = String(period?.status || '').toLowerCase() === 'closed';
  if (isClosed && period?.id && getPeriodVariance) {
    const data = await getPeriodVariance(period.id);
    return periodLedgerPdfRowsFromVariance(data.rows, 'closing');
  }
  return flatProductLedgerRowsFromPeriodEntries(detail?.closing);
}

/** Next period opening PDF after rollover = prior period closing qtys from variance. */
export function rolloverOpeningPdfRowsFromClosedVariance(varianceRows) {
  return periodLedgerPdfRowsFromVariance(varianceRows, 'closing');
}
