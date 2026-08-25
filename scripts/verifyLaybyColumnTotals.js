/**
 * Verify locked layby column totals (Ruth Kasanda case).
 * Run: node scripts/verifyLaybyColumnTotals.js
 */
import { assertLaybyColumnTotalsRuthKasandaCase, buildLaybyCurrencyBucket } from '../src/utils/laybyColumnTotals.js';
import { computePooledLaybyTotalsByCurrency } from '../src/utils/laybyRollup.js';

assertLaybyColumnTotalsRuthKasandaCase();
console.log('Ruth Kasanda case: OK (due = 85,000)');

const bucket = buildLaybyCurrencyBucket({
  contractTotal: 107_000,
  paid: 22_000,
  saleDiscount: 15_850,
  paymentDiscount: 0,
});
if (bucket.due !== 85_000) {
  throw new Error(`bucket due expected 85000, got ${bucket.due}`);
}

const pooled = computePooledLaybyTotalsByCurrency({
  sales: [{
    sale_id: 'sale-1',
    currency: 'K',
    total_due: 107_000,
    total_amount: 107_000,
    discount_amount: 15_850,
    subtotal_before_discount: 122_850,
    paid_amount: 0,
    outstanding_amount: 85_000,
  }],
  items: [],
  payments: [{ sale_id: 'sale-1', amount: 22_000, currency: 'K', discount_amount: 0 }],
});
const k = pooled.K || pooled.k;
if (!k || k.due !== 85_000) {
  throw new Error(`pooled due expected 85000, got ${k?.due}`);
}
if (k.total !== 107_000) {
  throw new Error(`pooled total sale expected 107000, got ${k?.total}`);
}

console.log('Pooled rollup case: OK');
console.log('All layby column total checks passed.');
