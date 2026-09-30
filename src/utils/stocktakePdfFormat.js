import { formatCurrency } from '../pdfTheme';

/** Zambian kwacha for stocktake PDFs — `K 1,234` (no decimals). */
export function fmtStocktakeCurrency(amount) {
  return formatCurrency(amount, 'K');
}

export function fmtStocktakeQty(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
