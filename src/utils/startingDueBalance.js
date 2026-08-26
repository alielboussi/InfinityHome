const toAmount = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export function normalizeStartingDueCurrency(value, fallback = 'K') {
  const raw = String(value || fallback).trim().toUpperCase();
  if (!raw) return fallback;
  if (raw === '$' || raw === 'USD') return 'USD';
  if (raw === 'K' || raw === 'ZMW') return 'K';
  return raw;
}

/** Remaining opening due stored on the customer record (decreases as payments apply). */
export function getStartingDueBalance(customer) {
  const amount = toAmount(customer?.starting_due_balance);
  return amount > 0.009 ? amount : 0;
}

export function normalizeStartingDueDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  try {
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  } catch {
    return null;
  }
}

export function getStartingDueBalanceDate(customer) {
  return normalizeStartingDueDate(customer?.starting_due_balance_date);
}

export function parseStartingDueDateInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return normalizeStartingDueDate(raw);
}

export function parseStartingDueInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parsed = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return parsed;
}

export function applyStartingDueToTotalsByCurrency(totalsByCurrency, customer) {
  const amount = getStartingDueBalance(customer);
  if (amount <= 0.009) return { ...(totalsByCurrency || {}) };
  const currency = normalizeStartingDueCurrency(customer?.currency);
  const next = { ...(totalsByCurrency || {}) };
  const existing = next[currency] || { total: 0, paid: 0, discount: 0, due: 0 };
  next[currency] = {
    total: toAmount(existing.total) + amount,
    paid: toAmount(existing.paid),
    discount: toAmount(existing.discount),
    due: toAmount(existing.due) + amount,
    startingDue: amount,
  };
  return next;
}

export function splitPaymentAcrossStartingDue({
  paymentAmount = 0,
  paymentDiscount = 0,
  salesOutstanding = 0,
  startingDue = 0,
} = {}) {
  const pay = Math.max(0, toAmount(paymentAmount));
  const disc = Math.max(0, toAmount(paymentDiscount));
  const totalPay = pay + disc;
  const salesDue = Math.max(0, toAmount(salesOutstanding));
  const openingDue = Math.max(0, toAmount(startingDue));
  const payToSales = Math.min(totalPay, salesDue);
  const payToStarting = Math.min(openingDue, Math.max(0, totalPay - payToSales));
  return {
    payToSales,
    payToStarting,
    totalOutstanding: salesDue + openingDue,
  };
}

export async function applyStartingDuePaymentReduction(db, customerId, amount) {
  const applied = Math.max(0, toAmount(amount));
  if (!customerId || applied <= 0.009) return;
  const { data: row, error } = await db
    .from('customers')
    .select('starting_due_balance')
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw error;
  const current = getStartingDueBalance(row || {});
  const next = Math.max(0, current - applied);
  if (Math.abs(next - current) <= 0.009) return;
  const { error: updateErr } = await db
    .from('customers')
    .update({
      starting_due_balance: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId);
  if (updateErr) throw updateErr;
}

export function buildStartingDuePrimaryLayby(customerId, customer) {
  const amount = getStartingDueBalance(customer);
  if (amount <= 0.009) return null;
  const dateKey = getStartingDueBalanceDate(customer);
  const dated = dateKey ? `${dateKey}T00:00:00.000Z` : null;
  return {
    id: null,
    sale_id: null,
    customer_id: customerId,
    status: 'layby',
    total_amount: amount,
    paid_amount: 0,
    origin: 'starting_due_balance',
    created_at: dated,
    updated_at: dated,
  };
}

/** Synthetic statement row for PDF/layby display (not folded into pooled sale totals). */
export function buildStartingDueStatementSale(customer) {
  const amount = getStartingDueBalance(customer);
  if (amount <= 0.009) return null;
  const dateKey = getStartingDueBalanceDate(customer);
  const saleDate = dateKey ? `${dateKey}T00:00:00.000Z` : null;
  const currency = normalizeStartingDueCurrency(customer?.currency);
  return {
    sale_id: 'starting_due_balance',
    sale_date: saleDate,
    created_at: saleDate,
    currency,
    total_due: amount,
    total_amount: amount,
    paid_amount: 0,
    outstanding_amount: amount,
    subtotal_before_discount: amount,
    discount_amount: 0,
    description: 'Opening balance',
    _startingDue: true,
    _synthetic: true,
  };
}

/** Fold remaining starting due into per-customer totals maps (All Sales / customer-totals API). */
export function mergeStartingDueIntoCustomerTotals(totals = {}, customers = []) {
  const next = { ...(totals || {}) };
  (customers || []).forEach((customer) => {
    const amount = getStartingDueBalance(customer);
    if (amount <= 0.009) return;
    const customerId = String(customer?.id || '').trim();
    if (!customerId) return;
    const code = normalizeStartingDueCurrency(customer?.currency);
    if (!next[customerId]) next[customerId] = {};
    if (!next[customerId][code]) {
      next[customerId][code] = { total: 0, paid: 0, discount: 0, outstanding: 0 };
    }
    const bucket = next[customerId][code];
    bucket.total = Number(bucket.total || 0) + amount;
    bucket.outstanding = Number(bucket.outstanding || 0) + amount;
  });
  return next;
}
