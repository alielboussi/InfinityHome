/**
 * Reset primary Mohammad Fahme layby data from the signed-off Jul 2026 PDF.
 *
 * Source: docs/reference/fahme-primary/expected-statement.json
 * Rebuild: node scripts/buildFahmePrimaryExpected.js
 *
 * Dry run:  node scripts/resetFahmePrimaryLaybyData.js
 * Apply:    node scripts/resetFahmePrimaryLaybyData.js --apply
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDataClient } from '../server/lib/getDataClient.js';
import { getFirestore, ensureSequenceInitialized, reserveNumericIdsFromSnap } from '../server/lib/firestoreDb.js';
import { newUuid } from '../server/lib/uuid.js';
import { receiptNumberNormalizedField } from '../server/lib/firestoreReceipt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = JSON.parse(
  readFileSync(join(__dirname, '../docs/reference/fahme-primary/expected-statement.json'), 'utf8'),
);
const CUSTOMER_ID = EXPECTED.customerId;
const APPLY = process.argv.includes('--apply');

function sumItems(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
}

async function fetchSaleIds(db) {
  const { data, error } = await db.from('sales').select('id').eq('customer_id', CUSTOMER_ID);
  if (error) throw error;
  return (data || []).map((row) => row.id).filter((id) => id != null);
}

async function deleteCustomerLaybyData(db, saleIds) {
  if (!APPLY) {
    console.log('Would delete sales:', saleIds.length);
    return;
  }

  const { data: laybyPayByCustomer } = await db.from('layby_payments').select('id').eq('customer_id', CUSTOMER_ID);
  for (const row of laybyPayByCustomer || []) {
    const { error } = await db.from('layby_payments').delete().eq('id', row.id);
    if (error) throw error;
  }

  if (saleIds.length) {
    const { data: laybyPayBySale } = await db.from('layby_payments').select('id').in('sale_id', saleIds);
    for (const row of laybyPayBySale || []) {
      const { error } = await db.from('layby_payments').delete().eq('id', row.id);
      if (error) throw error;
    }
    const { error: spErr } = await db.from('sales_payments').delete().in('sale_id', saleIds);
    if (spErr) throw spErr;
    const { error: siErr } = await db.from('sales_items').delete().in('sale_id', saleIds);
    if (siErr) throw siErr;
  }

  const { error: laybyErr } = await db.from('laybys').delete().eq('customer_id', CUSTOMER_ID);
  if (laybyErr) throw laybyErr;

  if (saleIds.length) {
    const { error: salesErr } = await db.from('sales').delete().in('id', saleIds);
    if (salesErr) throw salesErr;
  }

  console.log('Deleted primary Fahme sales, laybys, items, and payments (no inventory restore).');
}

async function allocateSaleId(firestoreDb) {
  await ensureSequenceInitialized(firestoreDb, 'sales');
  let saleId = null;
  await firestoreDb.runTransaction(async (tx) => {
    const salesSeqRef = firestoreDb.collection('_sequences').doc('sales');
    const salesSeqSnap = await tx.get(salesSeqRef);
    const { ids: [allocatedSaleId], nextValue } = reserveNumericIdsFromSnap(salesSeqSnap, 'sales', 1);
    saleId = allocatedSaleId;
    tx.set(salesSeqRef, { value: nextValue }, { merge: true });
  });
  return saleId;
}

async function allocateItemIds(firestoreDb, count) {
  if (!count) return [];
  await ensureSequenceInitialized(firestoreDb, 'sales_items');
  let itemIds = [];
  await firestoreDb.runTransaction(async (tx) => {
    const itemsSeqRef = firestoreDb.collection('_sequences').doc('sales_items');
    const itemsSeqSnap = await tx.get(itemsSeqRef);
    const { ids, nextValue } = reserveNumericIdsFromSnap(itemsSeqSnap, 'sales_items', count);
    itemIds = ids;
    tx.set(itemsSeqRef, { value: nextValue }, { merge: true });
  });
  return itemIds;
}

async function insertSaleBundle(db, firestoreDb, { saleId, laybyId, spec }) {
  const nowIso = new Date().toISOString();
  const receipt = spec.receiptNumber || null;
  const total = Number(spec.total_amount || 0);
  const discount = Number(spec.discount || 0);

  const saleRow = {
    id: saleId,
    customer_id: CUSTOMER_ID,
    sale_date: spec.saleDate,
    total_amount: total,
    currency: 'USD',
    status: 'layby',
    layby_id: laybyId,
    location_id: null,
    discount,
    vat_apply: false,
    vat_inclusive: true,
    vat_rate: 0.16,
    receipt_number: receipt,
    receipt_number_normalized: receipt ? receiptNumberNormalizedField(receipt) : null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { error: saleErr } = await db.from('sales').insert([saleRow]);
  if (saleErr) throw saleErr;

  const items = spec.items || [];
  const itemIds = await allocateItemIds(firestoreDb, items.length);
  const itemRows = items.map((item, index) => ({
    id: itemIds[index],
    sale_id: saleId,
    product_id: null,
    display_name: item.display_name || null,
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    currency: 'USD',
    color: item.color || null,
  }));

  if (itemRows.length) {
    const { error: itemsErr } = await db.from('sales_items').insert(itemRows);
    if (itemsErr) throw itemsErr;
  }

  return { saleId, total };
}

async function insertPayments(db, { saleId, laybyId, payments }) {
  const nowIso = new Date().toISOString();
  for (const payment of payments || []) {
    const paymentId = newUuid();
    const row = {
      id: paymentId,
      sale_id: saleId,
      amount: Number(payment.amount || 0),
      payment_type: payment.payment_type || 'cash',
      currency: payment.currency || 'USD',
      payment_date: payment.payment_date,
      reference: payment.reference || null,
      notes: payment.notes || null,
      discount_amount: 0,
      created_at: nowIso,
    };
    const { error } = await db.from('sales_payments').insert([row]);
    if (error) throw error;
  }
}

async function createPrimaryFahmeData(db) {
  const grandTotal = Number(EXPECTED.totals.totalSale || 0);
  const depositTotal = Number(EXPECTED.totals.totalDeposit || 0);
  const dueTotal = Number(EXPECTED.totals.totalDue || 0);

  console.log(`Target totals: sale=${grandTotal}, deposit=${depositTotal}, due=${dueTotal}`);

  if (!APPLY) {
    console.log('Would create:', {
      laybys: 1,
      sales: EXPECTED.sales.length,
      payments: EXPECTED.payments.length,
    });
    return;
  }

  const firestoreDb = getFirestore();
  if (!firestoreDb) throw new Error('Firestore not configured');

  const nowIso = new Date().toISOString();
  const laybyId = newUuid();
  const { error: laybyErr } = await db.from('laybys').insert([{
    id: laybyId,
    customer_id: CUSTOMER_ID,
    total_amount: grandTotal,
    paid_amount: depositTotal,
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
    notes: null,
    origin: 'reset',
  }]);
  if (laybyErr) throw laybyErr;

  const createdSaleIds = [];
  let anchorSaleId = null;

  for (const spec of EXPECTED.sales) {
    const saleId = await allocateSaleId(firestoreDb);
    await insertSaleBundle(db, firestoreDb, { saleId, laybyId, spec });
    createdSaleIds.push(saleId);
    if (!anchorSaleId) anchorSaleId = saleId;
    const itemSum = sumItems(spec.items);
    console.log(`Created sale #${saleId} (${spec.saleDate}) total=${spec.total_amount} items=${spec.items?.length || 0} itemSum=${itemSum} discount=${spec.discount || 0}`);
  }

  await insertPayments(db, {
    saleId: anchorSaleId,
    laybyId,
    payments: EXPECTED.payments,
  });

  const { error: laybyLinkErr } = await db
    .from('laybys')
    .update({
      sale_id: anchorSaleId,
      total_amount: grandTotal,
      paid_amount: depositTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', laybyId);
  if (laybyLinkErr) throw laybyLinkErr;

  await db.from('customers').update({ currency: 'USD' }).eq('id', CUSTOMER_ID);

  console.log('Created primary Fahme live layby data:', {
    laybyId,
    saleCount: createdSaleIds.length,
    anchorSaleId,
    grandTotal,
    deposit: depositTotal,
    due: dueTotal,
  });
}

async function verifyTotals(db) {
  const { data: sales, error } = await db
    .from('sales')
    .select('id, total_amount, discount, sale_date')
    .eq('customer_id', CUSTOMER_ID)
    .order('sale_date', { ascending: true });
  if (error) throw error;

  const saleIds = (sales || []).map((row) => row.id);
  const { data: payments } = saleIds.length
    ? await db.from('sales_payments').select('amount').in('sale_id', saleIds)
    : { data: [] };

  const totalSale = (sales || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const paid = (payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  console.log('\nVerification:', {
    saleCount: sales?.length || 0,
    totalSale,
    paid,
    due: totalSale - paid,
  });

  const { totalSale: expSale, totalDeposit: expPaid, totalDue: expDue } = EXPECTED.totals;
  if (Math.abs(totalSale - expSale) > 0.01) throw new Error(`Expected total sale ${expSale}, got ${totalSale}`);
  if (Math.abs(paid - expPaid) > 0.01) throw new Error(`Expected deposit ${expPaid}, got ${paid}`);
  if (Math.abs(totalSale - paid - expDue) > 0.01) {
    throw new Error(`Expected due ${expDue}, got ${totalSale - paid}`);
  }
}

async function main() {
  const db = getDataClient();
  console.log(APPLY ? 'APPLY mode' : 'DRY RUN (pass --apply to execute)');

  const saleIds = await fetchSaleIds(db);
  console.log(`Found ${saleIds.length} existing primary Fahme sales`);

  await deleteCustomerLaybyData(db, saleIds);
  await createPrimaryFahmeData(db);

  if (APPLY) {
    await verifyTotals(db);
    console.log('\nPrimary Fahme reset complete. Refresh Layby Management and All Sales.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
