/** Shared layby statement sale scope — matches All Sales customer rollup. */

export function isSystemReceiptTag(value) {
  const raw = String(value || '').trim();
  return /^TG_DUE_/i.test(raw) || /^PDF_ITEM_RESTORE_/i.test(raw);
}

export function isSystemMigrationSale(sale) {
  if (isSystemReceiptTag(sale?.receipt_number)) return true;
  const saleId = String(sale?.sale_id || sale?.id || '').trim();
  return /^(TG-|PDF-)/i.test(saleId);
}

export function isLaybyPlaceholderItemName(name) {
  const raw = String(name || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  return upper === 'PDF_TOTAL_LOCKED'
    || upper === 'REPLACE_FROM_PDF'
    || upper === 'PDF RESTORED ITEM'
    || /^REPLACE_WITH_PDF_ITEM_\d+$/i.test(raw);
}

/** Same filter used by All Sales layby customer aggregates. */
export function filterLaybyStatementSales(sales, laybys) {
  const pdfTaggedSaleIds = new Set(
    (laybys || [])
      .filter((layby) => String(layby?.notes || '').toUpperCase().includes('PDF_ITEM_RESTORE_20260610'))
      .map((layby) => String(layby?.sale_id || '').trim())
      .filter(Boolean),
  );
  let list = Array.isArray(sales) ? sales.slice() : [];
  if (pdfTaggedSaleIds.size) {
    list = list.filter((sale) => pdfTaggedSaleIds.has(String(sale?.id || '').trim()));
  }
  const hasPdfBusinessSales = list.some((sale) => String(sale?.sale_id || '').toUpperCase().startsWith('PDF-'));
  if (hasPdfBusinessSales) {
    list = list.filter((sale) => String(sale?.sale_id || '').toUpperCase().startsWith('PDF-'));
  }
  return list;
}

/** Bulk layby rows: prefer regular business sales; fall back to All Sales filter. */
export function filterCustomerSalesForLaybyStatement(customerSales, laybys) {
  const regularSales = (customerSales || []).filter(
    (sale) => !String(sale?.sale_id || sale?.id || '').toUpperCase().startsWith('PDF-'),
  );
  if (regularSales.length > 0) return regularSales;
  return filterLaybyStatementSales(customerSales, laybys);
}
