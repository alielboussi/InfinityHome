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

/** Layby down-payment receipt must not belong to another customer's sale or payment. */
export async function assertLaybyPaymentReceiptAvailable(db, receiptNumber, { customerId } = {}) {
  const raw = String(receiptNumber || '').trim();
  if (!raw || /^-+$/.test(raw)) return;
  const payCustomerId = String(customerId || '').trim();

  const existingSale = await findExistingReceiptSale(db, 'sales', raw);
  if (existingSale) {
    const { data: saleRow, error: saleErr } = await db
      .from('sales')
      .select('id, customer_id')
      .eq('id', existingSale.id)
      .maybeSingle();
    if (saleErr) throw saleErr;
    const saleCustomerId = String(saleRow?.customer_id || '').trim();
    if (saleCustomerId && payCustomerId && saleCustomerId !== payCustomerId) {
      const err = new Error(RECEIPT_DUPLICATE_ERROR);
      err.code = 'DUPLICATE_RECEIPT';
      throw err;
    }
  }

  const orExpr = buildReceiptDuplicateOrFilter(raw);
  if (!orExpr) return;
  const { data: paymentRows, error: payErr } = await db
    .from('layby_payments')
    .select('id, customer_id, reference')
    .or(orExpr)
    .limit(50);
  if (payErr) throw payErr;
  for (const row of Array.isArray(paymentRows) ? paymentRows : []) {
    const rowCustomerId = String(row?.customer_id || '').trim();
    if (!receiptNumbersEquivalent(row?.reference, raw)) continue;
    if (rowCustomerId && payCustomerId && rowCustomerId !== payCustomerId) {
      const err = new Error(RECEIPT_DUPLICATE_ERROR);
      err.code = 'DUPLICATE_RECEIPT';
      throw err;
    }
  }
}
