export const RECEIPT_DUPLICATE_ERROR = 'Receipt number already exists. Please use a different receipt number.';

export function normalizeReceiptNumber(raw) {
  return String(raw || '').trim().replace(/^#\s*/, '').replace(/\s+/g, ' ').toLowerCase();
}

export function formatPosReceiptNumber(raw) {
  const stripped = String(raw || '').trim().replace(/^#+/, '');
  return stripped ? `#${stripped}` : '';
}

export function receiptNumbersEquivalent(a, b) {
  const left = normalizeReceiptNumber(a);
  const right = normalizeReceiptNumber(b);
  return left !== '' && left === right;
}

function quoteOrFilterValue(value) {
  const v = String(value ?? '').replace(/"/g, '""');
  return `"${v}"`;
}

export function buildReceiptDuplicateOrFilter(receiptNumber) {
  const stripped = String(receiptNumber || '').trim().replace(/^#\s*/, '').replace(/[*,]/g, '');
  if (!stripped) return null;
  const withoutHash = stripped.replace(/^#+/, '');
  const withHash = `#${withoutHash}`;
  return `receipt_number.ilike.${quoteOrFilterValue(withoutHash)},receipt_number.ilike.${quoteOrFilterValue(withHash)}`;
}

export function isDuplicateReceiptError(error) {
  const msg = String(error?.message || error?.details || error || '');
  const code = String(error?.code || '');
  return code === '23505' || /duplicate key value|ux_sales_receipt|receipt number already exists/i.test(msg);
}

export async function findExistingReceiptSale(db, salesTable, receiptNumber, { excludeSaleId } = {}) {
  const orExpr = buildReceiptDuplicateOrFilter(receiptNumber);
  if (!orExpr || !db || !salesTable) return null;

  const { data, error } = await db.from(salesTable).select('id, receipt_number').or(orExpr).limit(20);
  if (error) throw error;

  for (const row of Array.isArray(data) ? data : []) {
    if (excludeSaleId != null && String(row.id) === String(excludeSaleId)) continue;
    if (receiptNumbersEquivalent(row.receipt_number, receiptNumber)) {
      return row;
    }
  }
  return null;
}

export async function assertReceiptNumberAvailable(db, salesTable, receiptNumber, options = {}) {
  const existing = await findExistingReceiptSale(db, salesTable, receiptNumber, options);
  if (existing) {
    const err = new Error(RECEIPT_DUPLICATE_ERROR);
    err.code = 'DUPLICATE_RECEIPT';
    throw err;
  }
}
