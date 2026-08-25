/**
 * Reset Mohammad Fahme Acc(2) layby data to match the reference PDF + Aug 24 sale.
 *
 * - Deletes all Acc(2) sales/laybys/payments WITHOUT restoring inventory
 * - Re-creates 7 USD layby sales from live line items (no product_id on history)
 * - Re-creates Aug 24 sale with real products: pre-bumps stock then deducts (net zero)
 * - Records single $2,000 deposit on 2026-05-22
 *
 * Dry run:  node scripts/resetFahmeAcc2LaybyData.js
 * Apply:    node scripts/resetFahmeAcc2LaybyData.js --apply
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';
import { getFirestore, ensureSequenceInitialized, reserveNumericIdsFromSnap } from '../server/lib/firestoreDb.js';
import { newUuid } from '../server/lib/uuid.js';
import { applyFirestoreInventoryDeduction } from '../server/lib/firestoreInventoryDeduction.js';
import { receiptNumberNormalizedField } from '../server/lib/firestoreReceipt.js';

const CUSTOMER_ID = 'efb21cad-1a8d-4d64-9487-51e816fcb429';
const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const APPLY = process.argv.includes('--apply');

const HISTORICAL_SALES = [
  {
    saleDate: '2026-03-05',
    receiptNumber: 'ACC2-050326',
    items: [
      { display_name: 'Paris Sitting Set 3+2+1+1', quantity: 4, unit_price: 1800 },
      { display_name: 'Copper Fiber Mattress 160*200', quantity: 10, unit_price: 180 },
    ],
  },
  {
    saleDate: '2026-03-27',
    receiptNumber: 'ACC2-270326',
    items: [
      { display_name: 'Viking 3+2+1+1 Sitting Set', quantity: 2, unit_price: 1100 },
      { display_name: 'Luxury 3+3+1+1 Sitting Set', quantity: 1, unit_price: 900 },
      { display_name: 'Grand Luxury Mattress 200*200', quantity: 3, unit_price: 255 },
    ],
  },
  {
    saleDate: '2026-04-08',
    receiptNumber: 'ACC2-080426',
    items: [
      { display_name: 'Luxury 3+3+1+1 Sitting Set', quantity: 1, unit_price: 900 },
      { display_name: 'Anatasia Dining Table + 8 Chairs', quantity: 3, unit_price: 1100 },
      { display_name: 'Anatasia Dining Table + 6 Chairs', quantity: 2, unit_price: 800 },
    ],
  },
  {
    saleDate: '2026-04-24',
    receiptNumber: 'ACC2-240426',
    items: [
      { display_name: 'Viking Sitting Set 3+2+1+1', quantity: 2, unit_price: 1100 },
    ],
  },
  {
    saleDate: '2026-05-14',
    receiptNumber: 'ACC2-140526',
    items: [
      { display_name: 'New Sofa Set 3+2+1+1', quantity: 3, unit_price: 750 },
    ],
  },
  {
    saleDate: '2026-06-04',
    receiptNumber: 'ACC2-040626',
    items: [
      { display_name: 'Grand Luxury Mattress 200*200', quantity: 2, unit_price: 275 },
    ],
  },
];

const AUG24_SALE = {
  saleDate: '2026-08-24',
  receiptNumber: '#900',
  total_amount: 7300,
  items: [
    {
      product_id: 'f45e8764-1dca-47bd-a7bb-5135809dc869',
      display_name: 'Paris Sitting Set 3+2+1+1',
      quantity: 1,
      unit_price: 1800,
    },
    {
      product_id: '9268b83e-1283-49d4-a1a2-901dfa15a966',
      display_name: 'Viking Sitting Set 3+2+1+1',
      quantity: 2,
      unit_price: 1100,
    },
    {
      product_id: '9ad9ccb5-a9bc-4aa6-81e7-bc3f56170661',
      display_name: 'Copper Fiber Mattress 180*200',
      quantity: 15,
      unit_price: 220,
    },
  ],
};

const SETTLEMENT_PAYMENT = {
  amount: 2000,
  payment_date: '2026-05-22T00:00:00.000Z',
  reference: '22',
  payment_type: 'cash',
  currency: 'USD',
};

function sumItems(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
}

async function fetchAcc2SaleIds(db) {
  const { data, error } = await db
    .from('sales')
    .select('id')
    .eq('customer_id', CUSTOMER_ID);
  if (error) throw error;
  return (data || []).map((row) => row.id).filter((id) => id != null);
}

async function deleteAcc2Data(db, saleIds) {
  const steps = [];

  const { data: laybyPayByCustomer } = await db.from('layby_payments').select('id').eq('customer_id', CUSTOMER_ID);
  steps.push({ table: 'layby_payments (customer)', count: (laybyPayByCustomer || []).length });

  if (saleIds.length) {
    const { data: laybyPayBySale } = await db.from('layby_payments').select('id').in('sale_id', saleIds);
    steps.push({ table: 'layby_payments (sales)', count: (laybyPayBySale || []).length });

    const { data: salesPay } = await db.from('sales_payments').select('id').in('sale_id', saleIds);
    steps.push({ table: 'sales_payments', count: (salesPay || []).length });

    const { data: saleItems } = await db.from('sales_items').select('id').in('sale_id', saleIds);
    steps.push({ table: 'sales_items', count: (saleItems || []).length });
  }

  const { data: laybys } = await db.from('laybys').select('id').eq('customer_id', CUSTOMER_ID);
  steps.push({ table: 'laybys', count: (laybys || []).length });
  steps.push({ table: 'sales', count: saleIds.length });

  if (!APPLY) {
    console.log('Would delete:', steps);
    return;
  }

  if (laybyPayByCustomer?.length) {
    for (const row of laybyPayByCustomer) {
      const { error } = await db.from('layby_payments').delete().eq('id', row.id);
      if (error) throw error;
    }
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

  console.log('Deleted Acc(2) sales, laybys, items, and payments (no inventory restore).');
}

async function bumpInventoryForProducts(db, locationId, items) {
  const nowIso = new Date().toISOString();
  for (const item of items) {
    if (!item.product_id) continue;
    const qty = Number(item.quantity || 0);
    if (!(qty > 0)) continue;

    const { data: invRows, error } = await db
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', item.product_id)
      .eq('location', locationId);
    if (error) throw error;

    if (!invRows?.length) {
      const { error: insErr } = await db.from('inventory').insert([{
        product_id: item.product_id,
        location: locationId,
        quantity: qty,
        updated_at: nowIso,
      }]);
      if (insErr) throw insErr;
      continue;
    }

    const row = invRows[0];
    const { error: upErr } = await db
      .from('inventory')
      .update({ quantity: Number(row.quantity || 0) + qty, updated_at: nowIso })
      .eq('id', row.id);
    if (upErr) throw upErr;
  }
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

async function insertSaleBundle(db, {
  saleId,
  laybyId,
  saleDate,
  receiptNumber,
  items,
  locationId = null,
  deductStock = false,
}) {
  const total = sumItems(items);
  const nowIso = new Date().toISOString();
  const receipt = receiptNumber || null;

  const saleRow = {
    id: saleId,
    customer_id: CUSTOMER_ID,
    sale_date: saleDate,
    total_amount: total,
    currency: 'USD',
    status: 'layby',
    layby_id: laybyId,
    location_id: locationId,
    discount: 0,
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

  const firestoreDb = getFirestore();
  const itemIds = await allocateItemIds(firestoreDb, items.length);
  const itemRows = items.map((item, index) => ({
    id: itemIds[index],
    sale_id: saleId,
    product_id: item.product_id || null,
    display_name: item.display_name || null,
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    currency: 'USD',
    color: item.color || null,
  }));

  const { error: itemsErr } = await db.from('sales_items').insert(itemRows);
  if (itemsErr) throw itemsErr;

  if (deductStock && locationId) {
    await applyFirestoreInventoryDeduction(getFirestore(), {
      items: itemRows,
      locationId,
      saleId,
      receiptNumber: receipt,
    });
  }

  return { saleId, total };
}

async function insertSettlementPayment(db, { saleId, laybyId }) {
  const paymentId = newUuid();
  const batchId = newUuid();
  const nowIso = new Date().toISOString();

  const paymentRow = {
    id: paymentId,
    sale_id: saleId,
    amount: SETTLEMENT_PAYMENT.amount,
    payment_type: SETTLEMENT_PAYMENT.payment_type,
    currency: SETTLEMENT_PAYMENT.currency,
    payment_date: SETTLEMENT_PAYMENT.payment_date,
    reference: SETTLEMENT_PAYMENT.reference,
    allocation_batch_uuid: batchId,
    discount_amount: 0,
    created_at: nowIso,
  };

  const { error: spErr } = await db.from('sales_payments').insert([paymentRow]);
  if (spErr) throw spErr;

  const laybyPaymentRow = {
    id: newUuid(),
    sale_id: saleId,
    customer_id: CUSTOMER_ID,
    layby_id: laybyId,
    amount: SETTLEMENT_PAYMENT.amount,
    payment_type: SETTLEMENT_PAYMENT.payment_type,
    currency: SETTLEMENT_PAYMENT.currency,
    payment_date: SETTLEMENT_PAYMENT.payment_date,
    reference: SETTLEMENT_PAYMENT.reference,
    allocation_batch_uuid: batchId,
    source_payment_id: paymentId,
    discount_amount: 0,
    notes: null,
    created_at: nowIso,
  };

  const { error: lpErr } = await db.from('layby_payments').insert([laybyPaymentRow]);
  if (lpErr) throw lpErr;
}

async function createAcc2Data(db) {
  const firestoreDb = getFirestore();
  if (!firestoreDb) throw new Error('Firestore not configured');

  const historicalTotal = HISTORICAL_SALES.reduce((sum, sale) => sum + sumItems(sale.items), 0);
  const grandTotal = historicalTotal + AUG24_SALE.total_amount;
  const expectedDue = grandTotal - SETTLEMENT_PAYMENT.amount;

  console.log(`Target totals: sale=${grandTotal}, deposit=${SETTLEMENT_PAYMENT.amount}, due=${expectedDue}`);

  if (!APPLY) {
    console.log('Would create:', {
      laybys: 1,
      historicalSales: HISTORICAL_SALES.length,
      aug24Sale: 1,
      settlementPayment: 1,
      customerCurrency: 'USD',
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const laybyId = newUuid();
  const { error: laybyErr } = await db.from('laybys').insert([{
    id: laybyId,
    customer_id: CUSTOMER_ID,
    total_amount: grandTotal,
    paid_amount: SETTLEMENT_PAYMENT.amount,
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
    notes: null,
    origin: 'reset',
  }]);
  if (laybyErr) throw laybyErr;

  const createdSaleIds = [];
  let anchorSaleId = null;

  for (const spec of HISTORICAL_SALES) {
    const saleId = await allocateSaleId(firestoreDb);
    await insertSaleBundle(db, {
      saleId,
      laybyId,
      saleDate: spec.saleDate,
      receiptNumber: spec.receiptNumber,
      items: spec.items,
    });
    createdSaleIds.push(saleId);
    if (!anchorSaleId) anchorSaleId = saleId;
    console.log(`Created historical sale #${saleId} (${spec.saleDate}) total=${sumItems(spec.items)}`);
  }

  await bumpInventoryForProducts(db, KITWE_LOCATION_ID, AUG24_SALE.items);
  const aug24SaleId = await allocateSaleId(firestoreDb);
  await insertSaleBundle(db, {
    saleId: aug24SaleId,
    laybyId,
    saleDate: AUG24_SALE.saleDate,
    receiptNumber: AUG24_SALE.receiptNumber,
    items: AUG24_SALE.items,
    locationId: KITWE_LOCATION_ID,
    deductStock: true,
  });
  createdSaleIds.push(aug24SaleId);
  console.log(`Created Aug 24 sale #${aug24SaleId} total=${AUG24_SALE.total_amount} (stock pre-bumped then deducted)`);

  await insertSettlementPayment(db, { saleId: anchorSaleId, laybyId });

  const { error: laybyLinkErr } = await db
    .from('laybys')
    .update({
      sale_id: anchorSaleId,
      total_amount: grandTotal,
      paid_amount: SETTLEMENT_PAYMENT.amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', laybyId);
  if (laybyLinkErr) throw laybyLinkErr;

  await db.from('customers').update({ currency: 'USD' }).eq('id', CUSTOMER_ID);

  console.log('Created Acc(2) live layby data:', {
    laybyId,
    saleIds: createdSaleIds,
    anchorSaleId,
    grandTotal,
    deposit: SETTLEMENT_PAYMENT.amount,
    due: expectedDue,
  });
}

async function verifyTotals(db) {
  const { data: sales, error } = await db
    .from('sales')
    .select('id, total_amount, currency, sale_date')
    .eq('customer_id', CUSTOMER_ID);
  if (error) throw error;

  const saleIds = (sales || []).map((row) => row.id);
  const { data: payments } = saleIds.length
    ? await db.from('sales_payments').select('amount').in('sale_id', saleIds)
  : { data: [] };
  const { data: laybyPayments } = await db
    .from('layby_payments')
    .select('amount')
    .eq('customer_id', CUSTOMER_ID);

  const totalSale = (sales || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const paidFromSales = (payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paidFromLayby = (laybyPayments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  console.log('\nVerification:', {
    saleCount: sales?.length || 0,
    totalSale,
    paidFromSales,
    paidFromLayby,
    due: totalSale - paidFromSales,
    sales: (sales || []).map((row) => `#${row.id} ${row.sale_date} ${row.currency} ${row.total_amount}`),
  });

  if (Math.abs(totalSale - 30965) > 0.01) throw new Error(`Expected total sale 30965, got ${totalSale}`);
  if (Math.abs(paidFromSales - 2000) > 0.01) throw new Error(`Expected deposit 2000, got ${paidFromSales}`);
  if (Math.abs(totalSale - paidFromSales - 28965) > 0.01) {
    throw new Error(`Expected due 28965, got ${totalSale - paidFromSales}`);
  }
}

async function main() {
  const db = getDataClient();
  console.log(APPLY ? 'APPLY mode' : 'DRY RUN (pass --apply to execute)');

  const saleIds = await fetchAcc2SaleIds(db);
  console.log(`Found ${saleIds.length} existing Acc(2) sales:`, saleIds);

  await deleteAcc2Data(db, saleIds);
  await createAcc2Data(db);

  if (APPLY) {
    await verifyTotals(db);
    console.log('\nAcc(2) reset complete. Refresh Layby Management and re-export PDF.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
