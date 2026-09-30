/** STOCKTAKE_PIPELINE_LOCKED — see docs/stocktake-pdf-pipeline.md */
/**
 * Single source of truth for opening/closing period PDF line items (all locations).
 * — Flat component/product lines only; A–Z by name.
 * — Prefer variance ledger rows (`buildVarianceRows` / imputed opening) whenever a period id exists.
 * — Closed periods: same products/qtys as variance (`periodLedgerPdfRowsFromVariance`).
 * — Open periods: variance rows when available; else flat qty from period stock entries.
 */
import { getPeriodLedgerVarianceRows } from '../services/stocktake';
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

async function fetchVarianceRowsForLedgerPdf(period, getPeriodVariance) {
  if (!period?.id) return null;
  const isClosed = String(period?.status || '').toLowerCase() === 'closed';
  if (isClosed && getPeriodVariance) {
    const data = await getPeriodVariance(period.id);
    return data?.rows ?? null;
  }
  return getPeriodLedgerVarianceRows(period.id);
}

function ledgerPdfRowsFromVariance(varianceRows, mode) {
  const rows = periodLedgerPdfRowsFromVariance(varianceRows, mode);
  if (mode === 'opening') {
    return rows.filter((row) => Number(row.qty || 0) > 0);
  }
  return rows;
}

export async function resolveOpeningPdfRows({ period, detail, getPeriodVariance }) {
  try {
    const varianceRows = await fetchVarianceRowsForLedgerPdf(period, getPeriodVariance);
    if (varianceRows?.length) {
      const rows = ledgerPdfRowsFromVariance(varianceRows, 'opening');
      if (rows.length) return rows;
    }
  } catch {
    /* fall back to stored entries */
  }
  return flatProductLedgerRowsFromPeriodEntries(detail?.opening);
}

export async function resolveClosingPdfRows({ period, detail, getPeriodVariance }) {
  try {
    const varianceRows = await fetchVarianceRowsForLedgerPdf(period, getPeriodVariance);
    if (varianceRows?.length) {
      const rows = ledgerPdfRowsFromVariance(varianceRows, 'closing');
      if (rows.length) return rows;
    }
  } catch {
    /* fall back to stored entries */
  }
  return flatProductLedgerRowsFromPeriodEntries(detail?.closing);
}

/** Next period opening PDF after rollover = prior period closing qtys from variance. */
export function rolloverOpeningPdfRowsFromClosedVariance(varianceRows) {
  return periodLedgerPdfRowsFromVariance(varianceRows, 'closing').filter(
    (row) => Number(row.qty || 0) > 0,
  );
}
