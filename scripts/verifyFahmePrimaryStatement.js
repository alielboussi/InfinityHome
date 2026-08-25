/**
 * Verify primary Mohammad Fahme live data matches signed-off Jul 2026 PDF.
 * Run: node scripts/verifyFahmePrimaryStatement.js
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDataClient } from '../server/lib/getDataClient.js';
import { computePooledLaybyTotalsByCurrency } from '../src/utils/laybyRollup.js';
import { normalizeLaybyStatement } from '../src/utils/laybyStatementNormalize.js';
import { parseFahmePrimaryPdfFooter } from './lib/parseFahmePrimaryPdfFooter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(
  readFileSync(join(__dirname, '../docs/reference/fahme-primary/expected-statement.json'), 'utf8'),
);
const PDF_PATH = join(__dirname, '../docs/reference/fahme-primary/Mohammad_Fahme_Layby_Statement_2026-07-29_USD.pdf');
const CUSTOMER_ID = expected.customerId;
const EPS = 0.01;

function assertClose(label, actual, target) {
  const a = Number(actual || 0);
  const t = Number(target || 0);
  if (Math.abs(a - t) > EPS) throw new Error(`${label}: expected ${t}, got ${a}`);
}

function buildLaybyPaymentLooseKey(row) {
  const saleId = String(row?.sale_id || '').trim();
  const day = String(row?.payment_date || '').trim().slice(0, 10);
  const amount = Number(row?.amount || 0);
  const type = String(row?.payment_type || '').toLowerCase();
  const reference = String(row?.reference || '').trim().replace(/^#/, '').toLowerCase();
  return `${saleId}|${day}|${amount.toFixed(2)}|${type}|${reference}`;
}

async function fetchMergedPayments(db, customerId, saleIds) {
  const tasks = [];
  if (saleIds.length) {
    tasks.push(db.from('sales_payments').select('*').in('sale_id', saleIds));
    tasks.push(db.from('layby_payments').select('*').in('sale_id', saleIds));
  }
  tasks.push(db.from('layby_payments').select('*').eq('customer_id', customerId));
  const results = await Promise.all(tasks);
  results.forEach((result) => { if (result.error) throw result.error; });
  const merged = [];
  const seen = new Set();
  results.forEach((result) => {
    (result.data || []).forEach((row) => {
      const normalized = { ...row, payment_type: String(row?.payment_type || '').toLowerCase() };
      const key = buildLaybyPaymentLooseKey(normalized);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(normalized);
    });
  });
  return merged;
}

async function main() {
  if (!existsSync(PDF_PATH)) {
    throw new Error(`Reference PDF missing: ${PDF_PATH}`);
  }

  const pdfFooter = parseFahmePrimaryPdfFooter(PDF_PATH);
  assertClose('PDF sale sections', pdfFooter.saleCount, expected.sales.length);
  assertClose('PDF payment count', pdfFooter.paymentCount, expected.payments.length);
  assertClose('PDF total sale', pdfFooter.totalSale, expected.totals.totalSale);
  assertClose('PDF total deposit', pdfFooter.totalDeposit, expected.totals.totalDeposit);
  assertClose('PDF due remaining', pdfFooter.totalDue, expected.totals.totalDue);
  assertClose('PDF sale+deposit=due', pdfFooter.totalDeposit + pdfFooter.totalDue, pdfFooter.totalSale);

  const db = getDataClient();
  const { data: sales, error: salesErr } = await db
    .from('sales')
    .select('id, sale_date, total_amount, discount, currency, vat_apply, vat_inclusive, vat_rate')
    .eq('customer_id', CUSTOMER_ID)
    .order('sale_date', { ascending: true });
  if (salesErr) throw salesErr;

  const saleIds = (sales || []).map((row) => row.id);
  const { data: items, error: itemsErr } = await db
    .from('sales_items')
    .select('sale_id, display_name, quantity, unit_price')
    .in('sale_id', saleIds);
  if (itemsErr) throw itemsErr;

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
    assertClose(`sale #${index + 1} amount`, sale.total_amount, ref.total_amount);
    assertClose(`sale #${index + 1} discount`, sale.discount || 0, ref.discount || 0);
    const pdfSale = pdfFooter.sales[index];
    if (pdfSale) {
      assertClose(`sale #${index + 1} PDF increment`, sale.total_amount, pdfSale.amount);
      if (Number(pdfSale.discount || 0) > 0) {
        assertClose(`sale #${index + 1} PDF discount`, ref.discount || 0, pdfSale.discount);
      }
    }
    if (String(sale.sale_date || '').slice(0, 10) !== ref.saleDate) {
      throw new Error(`sale #${index + 1} date: expected ${ref.saleDate}, got ${sale.sale_date}`);
    }
    const saleItems = itemsBySale.get(String(sale.id)) || [];
    if (saleItems.length !== ref.items.length) {
      throw new Error(`sale #${index + 1} item count: expected ${ref.items.length}, got ${saleItems.length}`);
    }
  });

  const payments = await fetchMergedPayments(db, CUSTOMER_ID, saleIds);
  assertClose('payment count', payments.length, expected.payments.length);
  assertClose('deposit total', payments.reduce((s, p) => s + Number(p.amount || 0), 0), expected.totals.totalDeposit);

  const { data: layby, error: laybyErr } = await db
    .from('laybys')
    .select('total_amount, paid_amount')
    .eq('customer_id', CUSTOMER_ID)
    .maybeSingle();
  if (laybyErr) throw laybyErr;
  if (!layby) throw new Error('Missing layby row for primary Fahme');
  assertClose('layby total_amount', layby.total_amount, expected.totals.totalSale);
  assertClose('layby paid_amount', layby.paid_amount, expected.totals.totalDeposit);

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
    payments,
  });

  const pooled = computePooledLaybyTotalsByCurrency(statement);
  const bucket = pooled.USD || Object.values(pooled)[0];
  assertClose('pooled total sale', bucket.total, expected.totals.totalSale);
  assertClose('pooled total deposit', bucket.paid, expected.totals.totalDeposit);
  assertClose('pooled total due', bucket.due, expected.totals.totalDue);

  console.log('Primary Fahme statement verification passed.');
  console.log(`  PDF + DB: ${expected.sales.length} sales | Deposit: $${expected.totals.totalDeposit} | Due: $${expected.totals.totalDue}`);
}

main().catch((error) => {
  console.error('Primary Fahme verification failed:', error?.message || error);
  process.exit(1);
});
