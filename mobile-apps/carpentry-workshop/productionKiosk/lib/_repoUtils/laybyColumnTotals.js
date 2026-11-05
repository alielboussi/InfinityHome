/**
 * SINGLE SOURCE OF TRUTH — Layby Management column totals.
 *
 * Table / PDF / WhatsApp must use these helpers. Do not re-derive formulas elsewhere.
 *
 * Columns:
 * - Total Sale: net contract value (after sale-level discount + VAT)
 * - Total Deposit: sum of payment amounts
 * - Total Discount: sale discounts + payment discounts (informational only)
 * - Total Due: Total Sale − Total Deposit − payment discounts
 *
 * Sale-level discount is already baked into Total Sale. Never subtract it again in Total Due.
 */

const toNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const LAYBY_COLUMN_RULES = Object.freeze({
  totalSale: 'Net contract value (after sale discount and VAT).',
  totalDeposit: 'Sum of payment amounts.',
  totalDiscount: 'Sale + payment discounts (informational; sale discount already in Total Sale).',
  totalDue: 'Total Sale − Total Deposit − payment discounts.',
});

/** Balance still owed from column inputs. */
export function computeLaybyColumnDue({ contractTotal, paid, paymentDiscount = 0 }) {
  const total = toNumber(contractTotal);
  const deposits = toNumber(paid);
  const payDisc = Math.max(0, toNumber(paymentDiscount));
  return Math.max(0, total - deposits - payDisc);
}

/** Build one currency bucket from rolled-up parts. */
export function buildLaybyCurrencyBucket({
  contractTotal = 0,
  paid = 0,
  saleDiscount = 0,
  paymentDiscount = 0,
} = {}) {
  const total = toNumber(contractTotal);
  const deposits = toNumber(paid);
  const saleDisc = Math.max(0, toNumber(saleDiscount));
  const payDisc = Math.max(0, toNumber(paymentDiscount));
  return {
    total,
    paid: deposits,
    discount: saleDisc + payDisc,
    due: computeLaybyColumnDue({ contractTotal: total, paid: deposits, paymentDiscount: payDisc }),
  };
}

/** Fold multi-currency buckets (Fahme USD-only display). Sum due — never re-derive with discount. */
export function foldLaybyTotalsByCurrency(totalsByCurrency = {}) {
  const folded = { total: 0, paid: 0, discount: 0, due: 0 };
  Object.values(totalsByCurrency || {}).forEach((vals) => {
    folded.total += toNumber(vals?.total);
    folded.paid += toNumber(vals?.paid);
    folded.discount += toNumber(vals?.discount);
    folded.due += toNumber(vals?.due);
  });
  return folded;
}

export function assertLaybyColumnTotalsRuthKasandaCase() {
  const bucket = buildLaybyCurrencyBucket({
    contractTotal: 107_000,
    paid: 22_000,
    saleDiscount: 15_850,
    paymentDiscount: 0,
  });
  if (bucket.total !== 107_000) throw new Error(`expected total sale 107000, got ${bucket.total}`);
  if (bucket.due !== 85_000) throw new Error(`expected total due 85000, got ${bucket.due}`);
  return bucket;
}
