/**
 * Verify Mohammad Fahme Acc(2) live data matches signed-off reference statement.
 * Run: node scripts/verifyFahmeAcc2Statement.js
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDataClient } from '../server/lib/getDataClient.js';
import { computePooledLaybyTotalsByCurrency } from '../src/utils/laybyRollup.js';
import { normalizeLaybyStatement } from '../src/utils/laybyStatementNormalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(
  readFileSync(join(__dirname, '../docs/reference/fahme-acc2/expected-statement.json'), 'utf8'),
);
const CUSTOMER_ID = expected.customerId;

const EPS = 0.01;

function assertClose(label, actual, target) {
  const a = Number(actual || 0);
  const t = Number(target || 0);
  if (Math.abs(a - t) > EPS) {
    throw new Error(`${label}: expected ${t}, got ${a}`);
  }
}

function saleDay(value) {
  const raw = String(value || '').slice(0, 10);
  return raw || '';
}

function buildLaybyPaymentLooseKey(row) {
  const saleId = String(row?.sale_id || '').trim();
  const dateRaw = String(row?.payment_date || '').trim();
  const day = dateRaw ? dateRaw.slice(0, 10) : '';
  const amount = Number(row?.amount || 0);
  const type = String(row?.payment_type || '').toLowerCase();
  const reference = String(row?.reference || '').trim().replace(/^#/, '').toLowerCase();
  return `${saleId}|${day}|${amount.toFixed(2)}|${type}|${reference}`;
}

function dedupeLaybyPaymentRows(rows = []) {
  const seen = new Set();
  const out = [];
  (rows || []).forEach((row) => {
    const normalized = {
      ...row,
      payment_type: String(row?.payment_type || '').toLowerCase(),
    };
    const key = buildLaybyPaymentLooseKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  return out;
}

async function fetchMergedPayments(db, customerId, saleIds) {
  const tasks = [];
  if (saleIds.length) {
    tasks.push(db.from('sales_payments').select('*').in('sale_id', saleIds));
    tasks.push(db.from('layby_payments').select('*').in('sale_id', saleIds));
  }
  tasks.push(db.from('layby_payments').select('*').eq('customer_id', customerId));
  const results = await Promise.all(tasks);
  results.forEach((result) => {
    if (result.error) throw result.error;
  });
  const merged = [];
  const seen = new Set();
  results.forEach((result) => {
    (result.data || []).forEach((row) => {
      const normalized = {
        ...row,
        payment_type: String(row?.payment_type || '').toLowerCase(),
      };
      const key = buildLaybyPaymentLooseKey(normalized);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(normalized);
    });
  });
  return dedupeLaybyPaymentRows(merged);
}

async function main() {
  const db = getDataClient();

  const { data: sales, error: salesErr } = await db
    .from('sales')
    .select('id, receipt_number, sale_date, total_amount, currency, discount, vat_apply, vat_inclusive, vat_rate, status, layby_id')
    .eq('customer_id', CUSTOMER_ID)
    .order('sale_date', { ascending: true });
  if (salesErr) throw salesErr;

  const saleIds = (sales || []).map((row) => row.id);
  const { data: items, error: itemsErr } = await db
    .from('sales_items')
    .select('sale_id, display_name, quantity, unit_price')
    .in('sale_id', saleIds);
  if (itemsErr) throw itemsErr;

  const { data: payments } = { data: await fetchMergedPayments(db, CUSTOMER_ID, saleIds) };

  assertClose('sale count', (sales || []).length, expected.sales.length);

  const itemsBySale = new Map();
  (items || []).forEach((item) => {
    const key = String(item.sale_id);
    if (!itemsBySale.has(key)) itemsBySale.set(key, []);
    itemsBySale.get(key).push(item);
  });

  (sales || []).forEach((sale, index) => {
    const ref = expected.sales[index];
    if (!ref) throw new Error(`Missing expected sale at index ${index}`);
    assertClose(`sale #${index + 1} amount`, sale.total_amount, ref.amount);
    if (saleDay(sale.sale_date) !== ref.saleDate) {
      throw new Error(`sale #${index + 1} date: expected ${ref.saleDate}, got ${saleDay(sale.sale_date)}`);
    }
    const saleItems = itemsBySale.get(String(sale.id)) || [];
    if (saleItems.length !== ref.items.length) {
      throw new Error(`sale #${index + 1} item count: expected ${ref.items.length}, got ${saleItems.length}`);
    }
    ref.items.forEach((refItem, itemIdx) => {
      const live = saleItems[itemIdx];
      assertClose(`sale #${index + 1} item ${itemIdx + 1} qty`, live?.quantity, refItem.qty);
      assertClose(`sale #${index + 1} item ${itemIdx + 1} price`, live?.unit_price, refItem.unitPrice);
      const liveName = String(live?.display_name || '').trim();
      if (liveName !== refItem.name) {
        throw new Error(`sale #${index + 1} item ${itemIdx + 1} name: expected "${refItem.name}", got "${liveName}"`);
      }
    });
  });

  const paymentTotal = (payments || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  assertClose('raw payment sum (deduped)', paymentTotal, expected.totals.totalDeposit);

  const statement = normalizeLaybyStatement({
    sales: (sales || []).map((sale) => ({
      sale_id: sale.id,
      id: sale.id,
      sale_date: sale.sale_date,
      currency: sale.currency,
      total_due: sale.total_amount,
      total_amount: sale.total_amount,
      discount_amount: sale.discount || 0,
      subtotal_before_discount: sale.total_amount,
      vat_apply: sale.vat_inclusive ? false : Boolean(sale.vat_apply),
      vat_inclusive: Boolean(sale.vat_inclusive),
      vat_rate: Number(sale.vat_rate || 0),
    })),
    items: items || [],
    payments: payments || [],
  });

  const pooled = computePooledLaybyTotalsByCurrency(statement);
  const bucket = pooled.USD || pooled.usd || pooled.$ || Object.values(pooled)[0];
  if (!bucket) throw new Error('No pooled currency bucket found');

  assertClose('pooled total sale', bucket.total, expected.totals.totalSale);
  assertClose('pooled total deposit', bucket.paid, expected.totals.totalDeposit);
  assertClose('pooled total due', bucket.due, expected.totals.totalDue);

  console.log('Fahme Acc(2) statement verification passed.');
  console.log(`  Sales: ${expected.sales.length} | Deposit: $${expected.totals.totalDeposit} | Due: $${expected.totals.totalDue}`);
}

main().catch((error) => {
  console.error('Fahme Acc(2) verification failed:', error?.message || error);
  process.exit(1);
});
