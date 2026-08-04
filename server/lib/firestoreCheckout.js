import { newUuid } from './uuid.js';
import {
  allocateNumericId,
  ensureSequenceInitialized,
  getFirestore,
} from './firestoreDb.js';
import {
  assertReceiptNumberAvailable,
  receiptNumberNormalizedField,
} from './firestoreReceipt.js';
import { applyFirestoreInventoryDeduction } from './firestoreInventoryDeduction.js';
import { RECEIPT_DUPLICATE_ERROR } from '../../src/utils/receiptNumber.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

function normalizeSaleActor(sale = {}) {
  const next = { ...sale };
  if (next.user_uid != null && !isUuid(next.user_uid)) {
    const legacy = Number(next.user_uid);
    if (Number.isFinite(legacy) && legacy > 0 && next.user_id == null) {
      next.user_id = legacy;
    }
    next.user_uid = null;
  }
  if (next.location_id != null && !isUuid(next.location_id)) {
    next.location_id = null;
  }
  if (next.customer_id != null && !isUuid(next.customer_id)) {
    throw new Error('customer_id must be a UUID');
  }
  if (next.layby_id != null && !isUuid(next.layby_id)) {
    next.layby_id = null;
  }
  return next;
}

/**
 * POS checkout on Firestore: sale header, items, payments, inventory deduction.
 */
export async function finalizeFirestoreCheckout(payload = {}) {
  const db = getFirestore();
  if (!db) {
    throw new Error('Firestore is not configured (FIREBASE_SERVICE_ACCOUNT)');
  }

  const sale = normalizeSaleActor(payload.sale || {});
  const items = Array.isArray(payload.items) ? payload.items : [];
  const payments = Array.isArray(payload.payments) ? payload.payments : [];

  if (!sale?.total_amount || !sale?.customer_id) {
    const err = new Error('Missing required fields: customer_id, total_amount');
    err.status = 400;
    throw err;
  }

  await Promise.all([
    ensureSequenceInitialized(db, 'sales'),
    ensureSequenceInitialized(db, 'sales_items'),
  ]);

  const hasReceipt = typeof sale?.receipt_number === 'string' && sale.receipt_number.trim() !== '';
  const storedReceiptNumber = hasReceipt ? sale.receipt_number.trim() : null;
  if (hasReceipt) {
    try {
      await assertReceiptNumberAvailable(db, storedReceiptNumber, {
        customerId: sale.customer_id,
      });
    } catch (dupErr) {
      dupErr.status = 409;
      throw dupErr;
    }
  }

  const nowIso = new Date().toISOString();
  const paymentsBatch = payments.length > 0 ? newUuid() : null;
  let saleId = null;
  let saleRow = null;
  let itemsInserted = 0;
  let paymentsInserted = 0;

  await db.runTransaction(async (tx) => {
    saleId = await allocateNumericId(db, 'sales', tx);

    const salePayload = {
      ...sale,
      id: saleId,
      receipt_number: storedReceiptNumber,
      receipt_number_normalized: storedReceiptNumber
        ? receiptNumberNormalizedField(storedReceiptNumber)
        : null,
      created_at: sale.created_at || nowIso,
      updated_at: sale.updated_at || nowIso,
    };
    const saleRef = db.collection('sales').doc(String(saleId));
    tx.set(saleRef, salePayload);
    saleRow = salePayload;

    const saleCurrency = salePayload.currency || sale.currency || null;
    for (const item of items) {
      const itemId = await allocateNumericId(db, 'sales_items', tx);
      const itemRow = {
        id: itemId,
        sale_id: saleId,
        product_id: item.product_id ?? null,
        display_name: item.display_name ?? null,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        currency: saleCurrency,
        color: item.color || null,
      };
      tx.set(db.collection('sales_items').doc(String(itemId)), itemRow);
      itemsInserted += 1;
    }

    for (const payment of payments) {
      const paymentId = newUuid();
      const paymentRow = {
        id: paymentId,
        sale_id: saleId,
        amount: Number(payment.amount || 0),
        payment_type: payment.payment_type || 'cash',
        currency: payment.currency || saleCurrency,
        payment_date: payment.payment_date || nowIso,
        reference: (payment.reference || '').trim() || null,
        allocation_batch_uuid: payment.allocation_batch_uuid || paymentsBatch,
        discount_amount: Number(payment.discount_amount || 0),
        created_at: payment.created_at || nowIso,
      };
      tx.set(db.collection('sales_payments').doc(paymentId), paymentRow);
      paymentsInserted += 1;
    }
  });

  let inventoryApplied = false;
  if (saleId != null && sale?.location_id && items.length > 0) {
    await applyFirestoreInventoryDeduction(db, {
      items,
      locationId: sale.location_id,
      saleId,
      receiptNumber: storedReceiptNumber,
      userUid: sale.user_uid || null,
      userId: sale.user_id || null,
    });
    inventoryApplied = true;
  }

  return {
    ok: true,
    sale: saleRow,
    storedReceiptNumber,
    itemsInserted,
    paymentsInserted,
    paymentsBatch,
    inventoryApplied,
    tableDebug: {
      backend: 'firestore',
      salesTable: 'sales',
      salesItemsTable: 'sales_items',
      salesPaymentsTable: 'sales_payments',
      usedAtomicCheckout: true,
    },
  };
}

export function isDuplicateReceiptCheckoutError(err) {
  return err?.code === 'DUPLICATE_RECEIPT'
    || String(err?.message || '').includes(RECEIPT_DUPLICATE_ERROR);
}
