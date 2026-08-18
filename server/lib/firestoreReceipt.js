import {
  RECEIPT_DUPLICATE_ERROR,
  normalizeReceiptNumber,
  receiptNumbersEquivalent,
} from '../../src/utils/receiptNumber.js';
import { queryCollectionWhere } from './firestoreDb.js';

const FAHME_CUSTOMER_IDS = new Set([
  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',
  'efb21cad-1a8d-4d64-9487-51e816fcb429',
]);

function receiptVariants(receiptNumber) {
  const raw = String(receiptNumber || '').trim();
  if (!raw) return [];
  const stripped = raw.replace(/^#\s*/, '');
  const withoutHash = stripped.replace(/^#+/, '');
  const withHash = `#${withoutHash}`;
  return [...new Set([raw, stripped, withoutHash, withHash].filter(Boolean))];
}

export function isFahmeCustomer(customerId) {
  return FAHME_CUSTOMER_IDS.has(String(customerId || '').trim().toLowerCase())
    || FAHME_CUSTOMER_IDS.has(String(customerId || '').trim());
}

export async function findExistingReceiptSale(db, receiptNumber, { excludeSaleId, customerId } = {}) {
  if (!receiptNumber || !db) return null;
  if (isFahmeCustomer(customerId)) return null;

  const normalized = receiptNumberNormalizedField(receiptNumber);
  if (normalized) {
    const normalizedRows = await queryCollectionWhere(db, 'sales', [
      { field: 'receipt_number_normalized', op: '==', value: normalized },
    ]);
    for (const row of normalizedRows) {
      if (excludeSaleId != null && String(row.id) === String(excludeSaleId)) continue;
      if (receiptNumbersEquivalent(row.receipt_number, receiptNumber)) return row;
    }
  }

  const variants = receiptVariants(receiptNumber);
  const seen = new Map();
  for (const variant of variants) {
    const rows = await queryCollectionWhere(db, 'sales', [
      { field: 'receipt_number', op: '==', value: variant },
    ]);
    for (const row of rows) {
      seen.set(String(row.id), row);
    }
  }

  for (const row of seen.values()) {
    if (excludeSaleId != null && String(row.id) === String(excludeSaleId)) continue;
    if (receiptNumbersEquivalent(row.receipt_number, receiptNumber)) return row;
  }
  return null;
}

export async function assertReceiptNumberAvailable(db, receiptNumber, options = {}) {
  const existing = await findExistingReceiptSale(db, receiptNumber, options);
  if (existing) {
    const err = new Error(RECEIPT_DUPLICATE_ERROR);
    err.code = 'DUPLICATE_RECEIPT';
    throw err;
  }
}

export function receiptNumberNormalizedField(receiptNumber) {
  const normalized = normalizeReceiptNumber(receiptNumber);
  return normalized || null;
}
