import {
  collection,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { firestoreDb, firebaseAuth } from '../firebase';

const COLLECTIONS = {
  customers: 'credit_app_customers',
  meta: 'credit_app_meta',
};

const SHARED_META_ID = 'shared';

const CURRENCIES = ['K', '$'];
const DEFAULT_PAYMENT_DEADLINE_DAYS = 45;
const MONTHLY_REPORT_DAYS = 30;
const BALANCE_EPSILON = 0.01;

function requireAuth() {
  if (!firebaseAuth.currentUser?.uid) {
    throw new Error('You must be signed in with Firebase.');
  }
}

function normalizeCurrency(value) {
  const raw = String(value || 'K').trim();
  return raw === '$' ? '$' : 'K';
}

function emptyCurrencyMap() {
  return { K: 0, $: 0 };
}

function daysBetween(startIso, endDate = new Date()) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function hasBalance(balance) {
  return Number(balance) > BALANCE_EPSILON;
}

function customerHasBalance(balanceByCurrency) {
  return CURRENCIES.some((currency) => hasBalance(balanceByCurrency?.[currency]));
}

function salesCollection(customerId) {
  return collection(firestoreDb, COLLECTIONS.customers, customerId, 'sales');
}

function paymentsCollection(customerId) {
  return collection(firestoreDb, COLLECTIONS.customers, customerId, 'payments');
}

async function sumSalesForCustomer(customerId) {
  const snap = await getDocs(salesCollection(customerId));
  const chargedByCurrency = emptyCurrencyMap();
  let firstSale = null;
  snap.forEach((row) => {
    const data = row.data();
    const currency = normalizeCurrency(data.currency);
    chargedByCurrency[currency] += Number(data.quantity || 0) * Number(data.unit_price || 0);
    const saleDate = data.sale_date;
    if (saleDate && (!firstSale || saleDate < firstSale)) firstSale = saleDate;
  });
  return { chargedByCurrency, firstSale };
}

async function sumPaymentsForCustomer(customerId) {
  const snap = await getDocs(paymentsCollection(customerId));
  const paidByCurrency = emptyCurrencyMap();
  snap.forEach((row) => {
    const currency = normalizeCurrency(row.data().currency);
    paidByCurrency[currency] += Number(row.data().amount || 0);
  });
  return paidByCurrency;
}

function computeBalanceByCurrency(chargedByCurrency, paidByCurrency) {
  const balanceByCurrency = emptyCurrencyMap();
  CURRENCIES.forEach((currency) => {
    balanceByCurrency[currency] = Math.max(
      0,
      Number(chargedByCurrency[currency] || 0) - Number(paidByCurrency[currency] || 0),
    );
  });
  return balanceByCurrency;
}

async function enrichCustomer(customer) {
  const [{ chargedByCurrency, firstSale }, paidByCurrency] = await Promise.all([
    sumSalesForCustomer(customer.id),
    sumPaymentsForCustomer(customer.id),
  ]);
  const balanceByCurrency = computeBalanceByCurrency(chargedByCurrency, paidByCurrency);
  const startDate = firstSale || customer.created_at;
  const deadlineDays = Number(customer.payment_deadline_days) || DEFAULT_PAYMENT_DEADLINE_DAYS;
  const daysElapsed = daysBetween(startDate);
  const daysRemaining = deadlineDays - daysElapsed;
  const hasBalanceDue = customerHasBalance(balanceByCurrency);
  const overdue = hasBalanceDue && daysRemaining < 0;

  return {
    ...customer,
    balanceByCurrency,
    hasBalance: hasBalanceDue,
    daysRemaining,
    overdue,
    paymentDeadlineDays: deadlineDays,
  };
}

export function formatMoney(amount, currency = 'K') {
  const c = normalizeCurrency(currency);
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${c} 0`;
  const decimals = n % 1 !== 0;
  const fmt = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return `${c} ${fmt}`;
}

export function formatBalances(balanceByCurrency) {
  return CURRENCIES
    .filter((currency) => hasBalance(balanceByCurrency?.[currency]))
    .map((currency) => formatMoney(balanceByCurrency[currency], currency))
    .join(' · ') || formatMoney(0);
}

export async function fetchCustomerPrivateBalancesDashboard() {
  requireAuth();
  const snap = await getDocs(collection(firestoreDb, COLLECTIONS.customers));
  const customers = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
  customers.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

  const enriched = [];
  for (const customer of customers) {
    enriched.push(await enrichCustomer(customer));
  }

  const withBalance = enriched.filter((c) => c.hasBalance);
  const overdue = withBalance.filter((c) => c.overdue);
  const totalOutstandingByCurrency = emptyCurrencyMap();
  withBalance.forEach((customer) => {
    CURRENCIES.forEach((currency) => {
      totalOutstandingByCurrency[currency] += Number(customer.balanceByCurrency?.[currency] || 0);
    });
  });

  const metaSnap = await getDoc(doc(firestoreDb, COLLECTIONS.meta, SHARED_META_ID));
  const meta = metaSnap.exists() ? metaSnap.data() : {};
  const lastShown = meta.last_monthly_report_shown_at || '';
  const now = Date.now();
  const lastMs = lastShown ? new Date(lastShown).getTime() : 0;
  const monthlyDue = (!lastShown || (now - lastMs) >= MONTHLY_REPORT_DAYS * 24 * 60 * 60 * 1000) && withBalance.length > 0;

  return {
    customers: enriched,
    withBalance,
    overdue,
    totalOutstandingByCurrency,
    stats: {
      pendingCount: withBalance.length,
      overdueCount: overdue.length,
      totalOutstandingByCurrency,
    },
    monthlyReport: monthlyDue ? {
      due: true,
      generatedAt: new Date().toISOString(),
      totalOutstandingByCurrency,
      rows: withBalance.map((c) => ({
        id: c.id,
        name: c.name,
        balanceByCurrency: c.balanceByCurrency,
        daysRemaining: c.daysRemaining,
        overdue: c.overdue,
      })),
    } : { due: false, rows: [] },
  };
}
