/** STOCKTAKE_PIPELINE_LOCKED — see docs/stocktake-pdf-pipeline.md */
/**
 * Opening / closing period PDF rows — same products, order, and qtys as the variance report.
 */
export function periodLedgerPdfRowsFromVariance(varianceRows, mode) {
  const qtyKey = mode === 'opening' ? 'opening_stock_qty' : 'closing_stock_qty';
  return (varianceRows || [])
    .filter((row) => row.row_type !== 'set_header')
    .map((row) => ({
      sku: row.sku || '',
      name: row.product_name || row.name || '',
      qty: Number(row[qtyKey] ?? 0),
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
}

export function countPeriodLedgerProductLines(rows) {
  return (rows || []).length;
}

export function sumPeriodLedgerQty(rows) {
  return (rows || []).reduce((sum, row) => sum + Number(row.qty || 0), 0);
}
