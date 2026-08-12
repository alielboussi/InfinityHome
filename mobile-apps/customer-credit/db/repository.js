import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { getDb, getFirebaseAuth } from '../../shared/firebase';
import {
  COLLECTIONS,
  DEFAULT_PAYMENT_DEADLINE_DAYS,
  MONTHLY_REPORT_DAYS,
  SHARED_META_ID,
} from './constants';
import { daysBetween, emptyCurrencyMap, normalizeCurrency, customerHasBalance, CURRENCIES } from '../utils/format';
import { nowIso, todayIsoDate, uuid } from '../utils/ids';

function requireAuthUid() {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  return uid;
}

function customerRef(customerId) {
  return doc(getDb(), COLLECTIONS.customers, customerId);
}

function salesCollection(customerId) {
  return collection(getDb(), COLLECTIONS.customers, customerId, 'sales');
}

function paymentsCollection(customerId) {
  return collection(getDb(), COLLECTIONS.customers, customerId, 'payments');
}

function mapCustomerDoc(docSnap) {
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

async function sumSalesForCustomer(customerId) {
  const snap = await getDocs(salesCollection(customerId));
  const chargedByCurrency = emptyCurrencyMap();
  let firstSale = null;
  let lastSale = null;
  snap.forEach((row) => {
    const data = row.data();
    const currency = normalizeCurrency(data.currency);
    chargedByCurrency[currency] += Number(data.quantity || 0) * Number(data.unit_price || 0);
    const saleDate = data.sale_date;
    if (saleDate) {
      if (!firstSale || saleDate < firstSale) firstSale = saleDate;
      if (!lastSale || saleDate > lastSale) lastSale = saleDate;
    }
  });
  return { chargedByCurrency, firstSale, lastSale };
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

export async function enrichCustomer(customer) {
  const [{ chargedByCurrency, firstSale, lastSale }, paidByCurrency] = await Promise.all([
    sumSalesForCustomer(customer.id),
    sumPaymentsForCustomer(customer.id),
  ]);
  const balanceByCurrency = computeBalanceByCurrency(chargedByCurrency, paidByCurrency);
  const hasBalanceDue = customerHasBalance(balanceByCurrency);
  const startDate = hasBalanceDue
    ? (lastSale || firstSale || customer.created_at)
    : (firstSale || customer.created_at);
  const deadlineDays = Number(customer.payment_deadline_days) || DEFAULT_PAYMENT_DEADLINE_DAYS;
  const daysElapsed = daysBetween(startDate);
  const daysRemaining = deadlineDays - daysElapsed;
  const overdue = hasBalanceDue && daysRemaining < 0;

  return {
    ...customer,
    chargedByCurrency,
    paidByCurrency,
    balanceByCurrency,
    totalCharged: chargedByCurrency,
    totalPaid: paidByCurrency,
    balance: balanceByCurrency,
    hasBalance: hasBalanceDue,
    firstSaleDate: firstSale,
    lastSaleDate: lastSale,
    creditStartDate: startDate,
    daysElapsed,
    daysRemaining,
    overdue,
    paymentDeadlineDays: deadlineDays,
  };
}

async function fetchAllCustomers() {
  const snap = await getDocs(collection(getDb(), COLLECTIONS.customers));
  return snap.docs.map((row) => mapCustomerDoc(row)).filter(Boolean);
}

export async function listCustomers({ search = '' } = {}) {
  requireAuthUid();
  const rows = await fetchAllCustomers();
  const term = String(search || '').trim().toLowerCase();
  const filtered = term
    ? rows.filter((row) =>
      String(row.name || '').toLowerCase().includes(term)
      || String(row.phone || '').toLowerCase().includes(term))
    : rows;

  filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

  const enriched = [];
  for (const row of filtered) {
    enriched.push(await enrichCustomer(row));
  }
  return enriched;
}

export async function getCustomer(customerId) {
  requireAuthUid();
  const row = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!row) return null;
  return enrichCustomer(row);
}

export async function saveCustomer(payload) {
  const authUid = requireAuthUid();
  const id = payload.id || uuid();
  const now = nowIso();
  const existing = payload.id ? mapCustomerDoc(await getDoc(customerRef(id))) : null;

  const record = {
    owner_uid: existing?.owner_uid || authUid,
    name: String(payload.name || '').trim(),
    phone: String(payload.phone || '').trim(),
    address: String(payload.address || '').trim(),
    notes: String(payload.notes || '').trim(),
    payment_deadline_days: Math.max(1, Number(payload.payment_deadline_days) || DEFAULT_PAYMENT_DEADLINE_DAYS),
    updated_at: now,
    created_at: existing?.created_at || now,
  };

  if (!record.name) throw new Error('Customer name is required.');

  await setDoc(customerRef(id), record, { merge: true });
  return getCustomer(id);
}

async function deleteSubcollection(customerId, subName) {
  const snap = await getDocs(collection(getDb(), COLLECTIONS.customers, customerId, subName));
  await Promise.all(snap.docs.map((row) => deleteDoc(row.ref)));
}

export async function deleteCustomer(customerId) {
  requireAuthUid();
  const row = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!row) return;
  await deleteSubcollection(customerId, 'sales');
  await deleteSubcollection(customerId, 'payments');
  await deleteDoc(customerRef(customerId));
}

export async function listProducts({ search = '' } = {}) {
  requireAuthUid();
  const snap = await getDocs(collection(getDb(), COLLECTIONS.products));
  const term = String(search || '').trim().toLowerCase();
  const rows = snap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .filter((row) => !term || String(row.name || '').toLowerCase().includes(term));
  rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  return rows;
}

export async function getProduct(productId) {
  requireAuthUid();
  const snap = await getDoc(doc(getDb(), COLLECTIONS.products, productId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function saveProduct(payload) {
  const authUid = requireAuthUid();
  const id = payload.id || uuid();
  const now = nowIso();
  const existing = payload.id ? await getProduct(id) : null;

  const record = {
    owner_uid: existing?.owner_uid || authUid,
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim(),
    price: Math.max(0, Number(payload.price) || 0),
    currency: normalizeCurrency(payload.currency),
    updated_at: now,
    created_at: existing?.created_at || now,
  };

  if (!record.name) throw new Error('Product name is required.');

  await setDoc(doc(getDb(), COLLECTIONS.products, id), record, { merge: true });
  return getProduct(id);
}

export async function deleteProduct(productId) {
  requireAuthUid();
  const row = await getProduct(productId);
  if (!row) return;
  await deleteDoc(doc(getDb(), COLLECTIONS.products, productId));
}

export async function listCustomerSales(customerId) {
  requireAuthUid();
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer) return [];
  const snap = await getDocs(salesCollection(customerId));
  return snap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)));
}

export async function listAllSales({ search = '' } = {}) {
  const customers = await listCustomers();
  const term = String(search || '').trim().toLowerCase();
  const rows = [];

  for (const customer of customers) {
    const sales = await listCustomerSales(customer.id);
    sales.forEach((sale) => {
      rows.push({
        ...sale,
        customer_id: customer.id,
        customer_name: customer.name,
        line_total: Number(sale.quantity || 0) * Number(sale.unit_price || 0),
      });
    });
  }

  rows.sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)));

  if (!term) return rows;

  return rows.filter((row) =>
    String(row.customer_name || '').toLowerCase().includes(term)
    || String(row.product_name || '').toLowerCase().includes(term)
    || String(row.description || '').toLowerCase().includes(term)
    || String(row.notes || '').toLowerCase().includes(term));
}

export async function addCustomerSale(payload) {
  const authUid = requireAuthUid();
  const customerId = payload.customer_id;
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer) throw new Error('Customer not found.');

  const productName = String(payload.product_name || '').trim();
  const description = String(payload.description || '').trim();
  const notes = String(payload.notes || '').trim();
  const quantity = Math.max(0.01, Number(payload.quantity) || 1);
  const unitPrice = Math.max(0, Number(payload.unit_price) || 0);
  if (!productName && !description && !notes && unitPrice <= 0) {
    throw new Error('Enter a description, amount, or notes for this sale.');
  }

  const id = uuid();
  const now = nowIso();
  const record = {
    owner_uid: authUid,
    customer_id: customerId,
    product_id: payload.product_id || null,
    product_name: productName,
    description,
    quantity,
    unit_price: unitPrice,
    currency: normalizeCurrency(payload.currency),
    sale_date: payload.sale_date || todayIsoDate(),
    notes,
    created_at: now,
  };

  await setDoc(doc(salesCollection(customerId), id), record);
  await setDoc(customerRef(customerId), { updated_at: now }, { merge: true });
  return { id, ...record };
}

export async function listPayments(customerId) {
  requireAuthUid();
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer) return [];
  const snap = await getDocs(paymentsCollection(customerId));
  return snap.docs
    .map((row) => ({ id: row.id, ...row.data(), is_down_payment: Boolean(row.data().is_down_payment) }))
    .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)));
}

export async function addPayment(payload) {
  const authUid = requireAuthUid();
  const customerId = payload.customer_id;
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer) throw new Error('Customer not found.');

  const amount = Math.max(0.01, Number(payload.amount) || 0);
  const id = uuid();
  const now = nowIso();
  const record = {
    owner_uid: authUid,
    customer_id: customerId,
    amount,
    currency: normalizeCurrency(payload.currency),
    payment_date: payload.payment_date || todayIsoDate(),
    is_down_payment: payload.is_down_payment ? 1 : 0,
    notes: String(payload.notes || '').trim(),
    created_at: now,
  };

  await setDoc(doc(paymentsCollection(customerId), id), record);
  await setDoc(customerRef(customerId), { updated_at: now }, { merge: true });
  return { id, ...record, is_down_payment: Boolean(record.is_down_payment) };
}

async function getMeta() {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.meta, SHARED_META_ID));
  return snap.exists() ? snap.data() : {};
}

async function setMeta(patch) {
  await setDoc(doc(getDb(), COLLECTIONS.meta, SHARED_META_ID), patch, { merge: true });
}

export async function getDashboardData() {
  const customers = await listCustomers();
  const withBalance = customers.filter((c) => c.hasBalance);
  const overdue = withBalance.filter((c) => c.overdue);
  const totalOutstandingByCurrency = emptyCurrencyMap();
  withBalance.forEach((customer) => {
    CURRENCIES.forEach((currency) => {
      totalOutstandingByCurrency[currency] += Number(customer.balanceByCurrency?.[currency] || 0);
    });
  });
  const monthlyReport = await getMonthlyReportIfDue(withBalance);

  return {
    customers,
    withBalance,
    overdue,
    totalOutstandingByCurrency,
    monthlyReport,
    stats: {
      customerCount: customers.length,
      pendingCount: withBalance.length,
      overdueCount: overdue.length,
      totalOutstandingByCurrency,
    },
  };
}

export async function getMonthlyReportIfDue(withBalanceInput) {
  requireAuthUid();
  const withBalance = withBalanceInput || (await listCustomers()).filter((c) => c.hasBalance);
  const meta = await getMeta();
  const lastShown = meta.last_monthly_report_shown_at || '';
  const now = Date.now();
  const lastMs = lastShown ? new Date(lastShown).getTime() : 0;
  const due = !lastShown || (now - lastMs) >= MONTHLY_REPORT_DAYS * 24 * 60 * 60 * 1000;

  if (!due || withBalance.length === 0) {
    return { due: false, rows: [], totalOutstandingByCurrency: emptyCurrencyMap(), generatedAt: null };
  }

  const totalOutstandingByCurrency = emptyCurrencyMap();
  withBalance.forEach((customer) => {
    CURRENCIES.forEach((currency) => {
      totalOutstandingByCurrency[currency] += Number(customer.balanceByCurrency?.[currency] || 0);
    });
  });

  return {
    due: true,
    generatedAt: new Date().toISOString(),
    totalOutstandingByCurrency,
    rows: withBalance.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balanceByCurrency: c.balanceByCurrency,
      daysRemaining: c.daysRemaining,
      overdue: c.overdue,
    })),
  };
}

export async function acknowledgeMonthlyReport() {
  requireAuthUid();
  await setMeta({ last_monthly_report_shown_at: nowIso() });
}
