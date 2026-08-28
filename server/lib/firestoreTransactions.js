import { newUuid } from './uuid.js';
import {
  deleteWhereIn,
  getFirestore,
  insertRows,
  queryCollectionWhere,
  queryWhereIn,
  updateWhereIn,
} from './firestoreDb.js';
import { normalizeLaybyStatement } from '../../src/utils/laybyStatementNormalize.js';
import { filterStatementToLaybyAccount } from '../../src/utils/laybyRollup.js';
import { applyFahmeStatementLock, filterLockedFahmeSales, isFahmeStatementLocked } from '../../src/utils/fahmeStatementLock.js';

const ALLOWED_USER_ID = '1b5e098e-1206-447e-b4bc-6d009b85b5d3';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

function isNumericId(value) {
  const raw = String(value || '').trim();
  return raw !== '' && !Number.isNaN(Number(raw));
}

function sanitizePaymentNote(note) {
  const raw = String(note || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered.includes('auto-migrated') && lowered.includes('down_payment')) return '';
  if (lowered.includes('migrated from sales.down_payment')) return '';
  return raw;
}

function paymentMergeKey(row) {
  const batch = String(row?.allocation_batch_uuid || '').trim();
  if (batch) return `batch:${batch}`;
  return [
    row?.id || '',
    row?.sale_id || '',
    row?.payment_date || '',
    Number(row?.amount || 0),
    String(row?.payment_type || '').toLowerCase(),
    String(row?.reference || ''),
    String(row?.notes || ''),
  ].join('|');
}

function mergePaymentRows(rows = []) {
  const seen = new Set();
  const merged = [];
  for (const row of rows) {
    const key = paymentMergeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

async function computeSaleFinancials(db, saleIds) {
  const totalsBySale = new Map();
  const sales = await queryWhereIn(db, 'sales', 'id', saleIds);
  const payments = mergePaymentRows([
    ...(await queryWhereIn(db, 'sales_payments', 'sale_id', saleIds)),
    ...(await queryWhereIn(db, 'layby_payments', 'sale_id', saleIds)),
  ]);

  const paidBySale = new Map();
  payments.forEach((payment) => {
    const key = String(payment.sale_id);
    paidBySale.set(key, (paidBySale.get(key) || 0) + Number(payment.amount || 0));
  });

  sales.forEach((sale) => {
    const key = String(sale.id);
    const totalDue = Number(sale.total_amount || 0);
    const paid = Number(paidBySale.get(key) || 0);
    totalsBySale.set(key, {
      currency: sale.currency || null,
      total_due: totalDue,
      paid_amount: paid,
      outstanding_amount: Math.max(0, totalDue - paid),
      subtotal_before_discount: Number(sale.subtotal_before_discount || totalDue + Number(sale.discount || 0)),
      discount_amount: Number(sale.discount || 0),
    });
  });

  return totalsBySale;
}

async function rejectLockedFahmePaymentsForSales(db, saleIds = []) {
  const uniqueSaleIds = [...new Set((saleIds || []).filter((value) => value != null).map(String))];
  for (const saleId of uniqueSaleIds) {
    const rows = await queryWhereIn(db, 'sales', 'id', [saleId]);
    const customerId = rows?.[0]?.customer_id;
    if (!isFahmeStatementLocked(customerId)) continue;
    const err = new Error('This layby statement is locked to the signed-off PDF. Payments cannot be added or changed.');
    err.status = 403;
    throw err;
  }
}

export async function firestorePaymentsCreate(body = {}) {
  const db = getFirestore();
  const payments = Array.isArray(body.payments) ? body.payments : [];
  if (!payments.length) {
    const err = new Error('No payments provided');
    err.status = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const allMissing = payments.every((p) => !p.allocation_batch_uuid);
  const defaultBatch = allMissing ? newUuid() : null;

  const mapped = payments.map((p) => ({
    id: p.id || newUuid(),
    sale_id: p.sale_id,
    amount: Number(p.amount || 0),
    payment_type: p.payment_type || 'cash',
    currency: p.currency || null,
    payment_date: p.payment_date || nowIso,
    discount_amount: Number(p.discount_amount || 0),
    reference: (p.reference || '').trim() || null,
    notes: (p.notes || '').trim() || null,
    allocation_batch_uuid: p.allocation_batch_uuid || defaultBatch || newUuid(),
    created_at: p.created_at || nowIso,
  }));

  for (const row of mapped) {
    const amt = Number(row.amount || 0);
    const disc = Number(row.discount_amount || 0);
    if (!row.sale_id || (!Number.isFinite(amt) && !Number.isFinite(disc))) {
      const err = new Error('Invalid payment row (sale_id and amount or discount required)');
      err.status = 400;
      throw err;
    }
    if (amt <= 0 && disc <= 0) {
      const err = new Error('Invalid payment row (amount or discount required)');
      err.status = 400;
      throw err;
    }
  }

  await rejectLockedFahmePaymentsForSales(db, mapped.map((row) => row.sale_id));

  await insertRows(db, 'sales_payments', mapped);
  const batch = defaultBatch || mapped[0]?.allocation_batch_uuid || null;
  return { ok: true, count: mapped.length, batch };
}

export async function firestorePaymentsList(body = {}) {
  const db = getFirestore();
  const saleIds = Array.isArray(body.saleIds) ? body.saleIds.filter((v) => v != null) : [];
  if (!saleIds.length) {
    const err = new Error('saleIds is required');
    err.status = 400;
    throw err;
  }
  const rows = await queryWhereIn(db, 'sales_payments', 'sale_id', saleIds);
  rows.sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')));
  return { ok: true, rows };
}

export async function firestorePaymentsDelete(body = {}) {
  const db = getFirestore();
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (!ids.length) return { ok: true, count: 0 };
  const batch = db.batch();
  ids.forEach((id) => batch.delete(db.collection('sales_payments').doc(id)));
  await batch.commit();
  return { ok: true, count: ids.length };
}

export async function firestoreLaybyStatement(body = {}) {
  const db = getFirestore();
  const customerId = body.customerId || body.customer_id;
  const laybyId = String(body.laybyId || body.layby_id || '').trim();
  const laybySaleId = String(body.laybySaleId || body.layby_sale_id || body.saleId || '').trim();
  if (!customerId || !isUuid(customerId)) {
    const err = new Error('customerId is required');
    err.status = 400;
    throw err;
  }

  const laybyRows = await queryCollectionWhere(db, 'laybys', [
    { field: 'customer_id', op: '==', value: customerId },
  ]);
  const laybyIds = new Set((laybyRows || []).map((r) => String(r.id || '')).filter(Boolean));
  const laybySaleIds = new Set((laybyRows || []).map((r) => String(r.sale_id || '')).filter(Boolean));
  const scopedLaybyRow = laybyId
    ? (laybyRows || []).find((row) => String(row.id || '') === laybyId)
    : null;
  const resolvedLaybySaleId = laybySaleId || String(scopedLaybyRow?.sale_id || '').trim();

  const salesRows = await queryCollectionWhere(db, 'sales', [
    { field: 'customer_id', op: '==', value: customerId },
  ]);

  const laybySales = (salesRows || []).filter((sale) => {
    const saleId = String(sale.id || '');
    const laybyId = String(sale.layby_id || '');
    const status = String(sale.status || '').trim().toLowerCase();
    return status === 'layby' || laybyIds.has(laybyId) || laybySaleIds.has(saleId);
  });

  const scopedLaybySales = isFahmeStatementLocked(customerId)
    ? filterLockedFahmeSales(laybySales, customerId)
    : laybySales;

  const saleIds = scopedLaybySales.map((sale) => sale.id).filter((v) => v != null);
  if (!saleIds.length) {
    return { ok: true, sales: [], items: [], payments: [] };
  }

  const totalsBySale = await computeSaleFinancials(db, saleIds);
  const allCustomerSales = await queryCollectionWhere(db, 'sales', [
    { field: 'customer_id', op: '==', value: customerId },
  ]);
  const mergedSaleIds = [...new Set([
    ...saleIds.map(String),
    ...(allCustomerSales || []).map((sale) => String(sale.id)),
  ])];

  const [items, laybyPay, salesPay, customerLaybyPay, quoteRows] = await Promise.all([
    queryWhereIn(db, 'sales_items', 'sale_id', saleIds),
    queryWhereIn(db, 'layby_payments', 'sale_id', mergedSaleIds),
    queryWhereIn(db, 'sales_payments', 'sale_id', mergedSaleIds),
    queryCollectionWhere(db, 'layby_payments', [{ field: 'customer_id', op: '==', value: customerId }]),
    queryWhereIn(db, 'quotations', 'sale_id', saleIds),
  ]);

  const quoteBySale = new Map();
  (quoteRows || [])
    .filter((quote) => ['converted', 'invoice'].includes(String(quote?.status || '').toLowerCase()))
    .forEach((quote) => {
      const saleId = String(quote?.sale_id || '').trim();
      const quoteTotal = Number(quote?.total || 0);
      if (!saleId || !(quoteTotal > 0)) return;
      quoteBySale.set(saleId, {
        total_due: quoteTotal,
        discount_amount: Number(quote?.discount || 0),
        currency: quote?.currency || null,
      });
    });

  const sales = scopedLaybySales.map((sale) => {
    const fin = totalsBySale.get(String(sale.id)) || {};
    const quoteFin = quoteBySale.get(String(sale.id));
    const shouldUseQuoteTotal = quoteFin && Math.abs(Number(fin.total_due || 0) - Number(quoteFin.total_due || 0)) > 0.009;
    const totalDue = shouldUseQuoteTotal ? Number(quoteFin.total_due || 0) : Number(fin.total_due || 0);
    const paidAmount = Number(fin.paid_amount || 0);
    const discountAmount = shouldUseQuoteTotal ? Number(quoteFin.discount_amount || 0) : Number(fin.discount_amount || 0);
    const subtotalBeforeDiscount = shouldUseQuoteTotal
      ? Math.max(Number(fin.subtotal_before_discount || 0), totalDue + discountAmount)
      : Number(fin.subtotal_before_discount || 0);

    return {
      sale_id: sale.id,
      sale_date: sale.sale_date || sale.created_at || null,
      currency: sale.currency || quoteFin?.currency || fin.currency || null,
      layby_id: sale.layby_id || null,
      receipt_number: sale.receipt_number || null,
      total_due: totalDue,
      paid_amount: paidAmount,
      outstanding_amount: Number(fin.outstanding_amount ?? Math.max(0, totalDue - paidAmount)),
      subtotal_before_discount: subtotalBeforeDiscount,
      discount_amount: discountAmount,
    };
  });

  const payments = mergePaymentRows([...laybyPay, ...salesPay, ...customerLaybyPay]).map((payment) => ({
    ...payment,
    notes: sanitizePaymentNote(payment.notes),
    payment_type: String(payment.payment_type || '').toLowerCase(),
  }));

  const locked = applyFahmeStatementLock(customerId, { sales, items, payments });
  if (locked.statementLocked) {
    const lockedStatement = normalizeLaybyStatement({
      sales: locked.sales,
      items: locked.items,
      payments: locked.payments,
    });
    const scoped = laybyId || resolvedLaybySaleId
      ? filterStatementToLaybyAccount(lockedStatement, { laybyId, laybySaleId: resolvedLaybySaleId })
      : lockedStatement;
    return { ok: true, ...scoped };
  }

  const fullStatement = normalizeLaybyStatement({ sales, items, payments });
  const scoped = laybyId || resolvedLaybySaleId
    ? filterStatementToLaybyAccount(fullStatement, { laybyId, laybySaleId: resolvedLaybySaleId })
    : fullStatement;
  return { ok: true, ...scoped };
}

export async function firestoreLaybyDeleteCustomer(body = {}) {
  const userId = String(body.userId || '').toLowerCase();
  if (userId !== ALLOWED_USER_ID) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const laybyIds = Array.isArray(body.laybyIds) ? body.laybyIds.filter((v) => v != null) : [];
  if (!laybyIds.length) {
    const err = new Error('laybyIds is required');
    err.status = 400;
    throw err;
  }

  const laybyIdsUuid = laybyIds.filter(isUuid);
  const laybyIdsNumeric = laybyIds.filter(isNumericId).map((v) => Number(v));

  const db = getFirestore();
  for (const list of [laybyIdsUuid, laybyIdsNumeric]) {
    if (!list.length) continue;
    await updateWhereIn(db, 'sales', 'layby_id', list, { layby_id: null });
    await deleteWhereIn(db, 'laybys', 'id', list);
  }

  return { ok: true, deleted: laybyIds.length };
}

export async function firestoreLaybyPaymentsDelete(body = {}) {
  const db = getFirestore();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return { ok: true, count: 0 };

  const saleIds = rows.map((row) => row?.sale_id).filter((value) => value != null);
  await rejectLockedFahmePaymentsForSales(db, saleIds);

  const laybyIds = rows
    .map((row) => String(row?.id || '').trim())
    .filter((value) => value && !value.startsWith('down-'));

  if (laybyIds.length) {
    const batch = db.batch();
    laybyIds.forEach((id) => batch.delete(db.collection('layby_payments').doc(id)));
    await batch.commit();
  }

  for (const row of rows) {
    const saleId = row?.sale_id ?? null;
    if (!saleId) continue;
    const batchUuid = row?.allocation_batch_uuid || null;
    const candidates = await queryWhereIn(db, 'sales_payments', 'sale_id', [saleId]);
    const toDelete = candidates.filter((payment) => {
      if (batchUuid) return String(payment.allocation_batch_uuid) === String(batchUuid);
      return Number(payment.amount || 0) === Number(row?.amount || 0)
        && String(payment.payment_type || 'cash') === String(row?.payment_type || 'cash')
        && String(payment.payment_date || '') === String(row?.payment_date || '')
        && String(payment.reference || '') === String(row?.reference || '')
        && String(payment.notes || '') === String(row?.notes || '');
    });
    if (toDelete.length) {
      const batch = db.batch();
      toDelete.forEach((payment) => batch.delete(db.collection('sales_payments').doc(String(payment.id))));
      await batch.commit();
    }
  }

  return { ok: true, count: laybyIds.length };
}

export async function handleFirestoreTransactionAction(action, req) {
  const body = req.body || {};
  switch (action) {
    case 'payments':
      return firestorePaymentsCreate(body);
    case 'payments-list':
      return firestorePaymentsList(body);
    case 'payments-delete':
      return firestorePaymentsDelete(body);
    case 'layby-statement':
      return firestoreLaybyStatement(body);
    case 'layby-delete-customer':
      return firestoreLaybyDeleteCustomer(body);
    case 'layby-payments-delete':
      return firestoreLaybyPaymentsDelete(body);
    default:
      return null;
  }
}
