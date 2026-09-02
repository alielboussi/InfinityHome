import { computeLaybyColumnDue } from './laybyColumnTotals';

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

/** Locked opening due on the customer record (never auto-reduced by payments). */
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

function cloneTotalsByCurrency(totalsByCurrency) {
  const next = {};
  Object.entries(totalsByCurrency || {}).forEach(([code, bucket]) => {
    next[code] = { ...(bucket || {}) };
  });
  return next;
}

export function applyStartingDueToTotalsByCurrency(totalsByCurrency, customer) {
  const amount = getStartingDueBalance(customer);
  const currency = normalizeStartingDueCurrency(customer?.currency);
  const next = cloneTotalsByCurrency(totalsByCurrency);
  if (amount <= 0.009) return next;
  const existing = next[currency] || { total: 0, paid: 0, discount: 0, due: 0 };
  const priorTotal = toAmount(existing.total);
  const priorPaid = toAmount(existing.paid);
  const priorDue = toAmount(existing.due);
  const paymentDiscount = Math.max(0, priorTotal - priorPaid - priorDue);
  const total = priorTotal + amount;
  const paid = priorPaid;
  const due = computeLaybyColumnDue({ contractTotal: total, paid, paymentDiscount });
  next[currency] = {
    ...existing,
    total,
    paid,
    due,
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

/** One pooled customer balance — reduce opening portion first, remainder stays customer-level (not per sale date). */
export function allocatePooledStartingDuePayment({
  paymentAmount = 0,
  paymentDiscount = 0,
  startingDue = 0,
} = {}) {
  const totalPay = Math.max(0, toAmount(paymentAmount)) + Math.max(0, toAmount(paymentDiscount));
  const openingDue = Math.max(0, toAmount(startingDue));
  const payToStarting = Math.min(openingDue, totalPay);
  return {
    payToStarting,
    payToSalesPool: Math.max(0, totalPay - payToStarting),
    totalOutstanding: openingDue,
  };
}

/**
 * @deprecated Starting due balance is locked on the customer record.
 * Payments reduce pooled due via layby_payments only — do not mutate starting_due_balance.
 */
export async function applyStartingDuePaymentReduction() {
  return undefined;
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
    const priorTotal = toAmount(bucket.total);
    const priorPaid = toAmount(bucket.paid);
    const priorOutstanding = toAmount(bucket.outstanding);
    const paymentDiscount = Math.max(0, priorTotal - priorPaid - priorOutstanding);
    const total = priorTotal + amount;
    bucket.total = total;
    bucket.outstanding = computeLaybyColumnDue({
      contractTotal: total,
      paid: priorPaid,
      paymentDiscount,
    });
  });
  return next;
}
