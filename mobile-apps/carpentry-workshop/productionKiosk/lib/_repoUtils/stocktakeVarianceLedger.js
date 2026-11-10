/** STOCKTAKE_PIPELINE_LOCKED — see docs/stocktake-pdf-pipeline.md; do not edit without owner authorization. */
/**
 * LOCKED period variance qty math — opening imputation, current, variance.
 * Used by buildVarianceRows, variance PDF, opening/closing PDFs, inventory reconcile.
 * See docs/stocktake-pdf-pipeline.md — regression: scripts/verifyStocktakeVarianceLedger.js
 */

/**
 * When recorded opening is 0 but period sales exist, impute opening so:
 * Current = Opening + Trans In − Trans Out − Sales; Variance = Closing − Current.
 */
export function resolveOpeningQtyForVariance({
  recordedOpening,
  sales,
  transfersIn,
  transfersOut,
  closingQty,
}) {
  const o = Number(recordedOpening || 0);
  const s = Number(sales || 0);
  const tin = Number(transfersIn || 0);
  const tout = Number(transfersOut || 0);
  const c = Number(closingQty || 0);
  if (o > 0) return o;
  if (s <= 0) return o;
  if (c > 0) {
    const imputed = s + c - tin + tout;
    return imputed > 0 ? imputed : s;
  }
  const imputed = s - tin + tout;
  return imputed > 0 ? imputed : s;
}

export function computeVarianceLedgerQtys({
  recordedOpening,
  sales,
  transfersIn = 0,
  transfersOut = 0,
  closingQty,
}) {
  const opening_stock_qty = resolveOpeningQtyForVariance({
    recordedOpening,
    sales,
    transfersIn,
    transfersOut,
    closingQty,
  });
  const transfers_in = Number(transfersIn || 0);
  const transfers_out = Number(transfersOut || 0);
  const salesQty = Number(sales || 0);
  const closing_stock_qty = Number(closingQty || 0);
  const current_stock_qty = opening_stock_qty + transfers_in - transfers_out - salesQty;
  const variance = closing_stock_qty - current_stock_qty;
  return {
    opening_stock_qty,
    transfers_in,
    transfers_out,
    sales: salesQty,
    current_stock_qty,
    closing_stock_qty,
    variance,
  };
}
