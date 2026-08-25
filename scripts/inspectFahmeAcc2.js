/**
 * Inspect Mohammad Fahme Acc(2) live data.
 * Run: node scripts/inspectFahmeAcc2.js
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';

const CUSTOMER_ID = 'efb21cad-1a8d-4d64-9487-51e816fcb429';

async function main() {
  const db = getDataClient();

  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id, name, phone, currency')
    .eq('id', CUSTOMER_ID)
    .maybeSingle();
  if (custErr) throw custErr;
  console.log('Customer:', customer);

  const { data: sales, error: salesErr } = await db
    .from('sales')
    .select('id, sale_date, created_at, total_amount, currency, status, layby_id, receipt_number, location_id, discount, vat_apply, vat_rate')
    .eq('customer_id', CUSTOMER_ID)
    .order('sale_date', { ascending: true });
  if (salesErr) throw salesErr;

  const saleIds = (sales || []).map((row) => row.id).filter((id) => id != null);
  console.log(`\nSales (${saleIds.length}):`);
  (sales || []).forEach((sale) => {
    console.log(`  #${sale.id} | ${sale.sale_date || sale.created_at} | ${sale.currency} ${sale.total_amount} | ${sale.status} | layby=${sale.layby_id} | rcpt=${sale.receipt_number || '—'}`);
  });

  let items = [];
  if (saleIds.length) {
    const { data, error } = await db
      .from('sales_items')
      .select('id, sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds);
    if (error) throw error;
    items = data || [];
  }

  console.log('\nItems by sale:');
  for (const sale of sales || []) {
    const rows = items.filter((item) => String(item.sale_id) === String(sale.id));
    const subtotal = rows.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
    console.log(`  Sale #${sale.id} (${sale.sale_date || sale.created_at}) subtotal=${subtotal}`);
    rows.forEach((item) => {
      console.log(`    - qty=${item.quantity} @ ${item.unit_price} = ${Number(item.quantity) * Number(item.unit_price)} | ${item.display_name || item.product_id}`);
    });
  }

  const { data: laybys, error: laybyErr } = await db
    .from('laybys')
    .select('id, sale_id, customer_id, total_amount, paid_amount, status, created_at, updated_at, origin, notes')
    .eq('customer_id', CUSTOMER_ID);
  if (laybyErr) throw laybyErr;
  console.log(`\nLaybys (${(laybys || []).length}):`);
  (laybys || []).forEach((layby) => {
    console.log(`  ${layby.id} | sale=${layby.sale_id} | total=${layby.total_amount} paid=${layby.paid_amount} | ${layby.status}`);
  });

  const paymentQueries = [];
  if (saleIds.length) {
    paymentQueries.push(
      db.from('sales_payments').select('*').in('sale_id', saleIds),
      db.from('layby_payments').select('*').in('sale_id', saleIds),
    );
  }
  paymentQueries.push(
    db.from('layby_payments').select('*').eq('customer_id', CUSTOMER_ID),
  );

  const paymentResults = await Promise.all(paymentQueries);
  paymentResults.forEach((result) => {
    if (result.error) throw result.error;
  });

  const payments = [];
  const seen = new Set();
  paymentResults.forEach((result) => {
    (result.data || []).forEach((payment) => {
      const key = `${payment.id || ''}|${payment.sale_id}|${payment.amount}|${payment.payment_date}`;
      if (seen.has(key)) return;
      seen.add(key);
      payments.push(payment);
    });
  });

  console.log(`\nPayments (${payments.length}):`);
  payments.forEach((payment) => {
    console.log(`  ${payment.payment_date} | sale=${payment.sale_id} | ${payment.currency || '—'} ${payment.amount} | ${payment.payment_type} | ref=${payment.reference || '—'} | notes=${payment.notes || '—'}`);
  });

  const totalSales = (sales || []).reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  console.log(`\nSummary: sales total=${totalSales}, payments=${totalPaid}, due=${totalSales - totalPaid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
