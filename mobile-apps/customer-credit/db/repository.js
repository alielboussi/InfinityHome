import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { getDb, getFirebaseAuth } from '../../shared/firebase';
import { COLLECTIONS, DEFAULT_PAYMENT_DEADLINE_DAYS, MONTHLY_REPORT_DAYS } from './constants';
import { hasBalance, daysBetween } from '../utils/format';
import { nowIso, todayIsoDate, uuid } from '../utils/ids';

function requireOwnerUid() {
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
  let total = 0;
  let firstSale = null;
  snap.forEach((row) => {
    const data = row.data();
    total += Number(data.quantity || 0) * Number(data.unit_price || 0);
    const saleDate = data.sale_date;
    if (saleDate && (!firstSale || saleDate < firstSale)) firstSale = saleDate;
  });
  return { total, firstSale };
}

async function sumPaymentsForCustomer(customerId) {
  const snap = await getDocs(paymentsCollection(customerId));
  let total = 0;
  snap.forEach((row) => {
    total += Number(row.data().amount || 0);
  });
  return total;
}

export async function enrichCustomer(customer) {
  const [{ total: totalCharged, firstSale }, totalPaid] = await Promise.all([
    sumSalesForCustomer(customer.id),
    sumPaymentsForCustomer(customer.id),
  ]);
  const balance = Math.max(0, totalCharged - totalPaid);
  const startDate = firstSale || customer.created_at;
  const deadlineDays = Number(customer.payment_deadline_days) || DEFAULT_PAYMENT_DEADLINE_DAYS;
  const daysElapsed = daysBetween(startDate);
  const daysRemaining = deadlineDays - daysElapsed;
  const overdue = hasBalance(balance) && daysRemaining < 0;

  return {
    ...customer,
    totalCharged,
    totalPaid,
    balance,
    firstSaleDate: firstSale,
    creditStartDate: startDate,
    daysElapsed,
    daysRemaining,
    overdue,
    paymentDeadlineDays: deadlineDays,
  };
}

async function fetchCustomersForOwner(ownerUid) {
  const snap = await getDocs(
    query(collection(getDb(), COLLECTIONS.customers), where('owner_uid', '==', ownerUid)),
  );
  return snap.docs.map((row) => mapCustomerDoc(row)).filter(Boolean);
}

export async function listCustomers({ search = '' } = {}) {
  const ownerUid = requireOwnerUid();
  const rows = await fetchCustomersForOwner(ownerUid);
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
  const ownerUid = requireOwnerUid();
  const row = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!row || row.owner_uid !== ownerUid) return null;
  return enrichCustomer(row);
}

export async function saveCustomer(payload) {
  const ownerUid = requireOwnerUid();
  const id = payload.id || uuid();
  const now = nowIso();
  const existing = payload.id ? mapCustomerDoc(await getDoc(customerRef(id))) : null;

  if (existing && existing.owner_uid !== ownerUid) {
    throw new Error('Customer not found.');
  }

  const record = {
    owner_uid: ownerUid,
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
  const ownerUid = requireOwnerUid();
  const row = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!row || row.owner_uid !== ownerUid) return;
  await deleteSubcollection(customerId, 'sales');
  await deleteSubcollection(customerId, 'payments');
  await deleteDoc(customerRef(customerId));
}

export async function listProducts({ search = '' } = {}) {
  const ownerUid = requireOwnerUid();
  const snap = await getDocs(
    query(collection(getDb(), COLLECTIONS.products), where('owner_uid', '==', ownerUid)),
  );
  const term = String(search || '').trim().toLowerCase();
  const rows = snap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .filter((row) => !term || String(row.name || '').toLowerCase().includes(term));
  rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  return rows;
}

export async function getProduct(productId) {
  const ownerUid = requireOwnerUid();
  const snap = await getDoc(doc(getDb(), COLLECTIONS.products, productId));
  if (!snap.exists()) return null;
  const row = { id: snap.id, ...snap.data() };
  return row.owner_uid === ownerUid ? row : null;
}

export async function saveProduct(payload) {
  const ownerUid = requireOwnerUid();
  const id = payload.id || uuid();
  const now = nowIso();
  const existing = payload.id ? await getProduct(id) : null;

  const record = {
    owner_uid: ownerUid,
    name: String(payload.name || '').trim(),
    price: Math.max(0, Number(payload.price) || 0),
    currency: String(payload.currency || 'K').trim() || 'K',
    updated_at: now,
    created_at: existing?.created_at || now,
  };

  if (!record.name) throw new Error('Product name is required.');

  await setDoc(doc(getDb(), COLLECTIONS.products, id), record, { merge: true });
  return getProduct(id);
}

export async function deleteProduct(productId) {
  const ownerUid = requireOwnerUid();
  const row = await getProduct(productId);
  if (!row || row.owner_uid !== ownerUid) return;
  await deleteDoc(doc(getDb(), COLLECTIONS.products, productId));
}

export async function listCustomerSales(customerId) {
  const ownerUid = requireOwnerUid();
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer || customer.owner_uid !== ownerUid) return [];
  const snap = await getDocs(salesCollection(customerId));
  return snap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)));
}

export async function addCustomerSale(payload) {
  const ownerUid = requireOwnerUid();
  const customerId = payload.customer_id;
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer || customer.owner_uid !== ownerUid) throw new Error('Customer not found.');

  const productName = String(payload.product_name || '').trim();
  const quantity = Math.max(0.01, Number(payload.quantity) || 1);
  const unitPrice = Math.max(0, Number(payload.unit_price) || 0);
  if (!productName) throw new Error('Product name is required.');

  const id = uuid();
  const now = nowIso();
  const record = {
    owner_uid: ownerUid,
    customer_id: customerId,
    product_id: payload.product_id || null,
    product_name: productName,
    quantity,
    unit_price: unitPrice,
    currency: String(payload.currency || 'K'),
    sale_date: payload.sale_date || todayIsoDate(),
    notes: String(payload.notes || '').trim(),
    created_at: now,
  };

  await setDoc(doc(salesCollection(customerId), id), record);
  await setDoc(customerRef(customerId), { updated_at: now }, { merge: true });
  return { id, ...record };
}

export async function listPayments(customerId) {
  const ownerUid = requireOwnerUid();
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer || customer.owner_uid !== ownerUid) return [];
  const snap = await getDocs(paymentsCollection(customerId));
  return snap.docs
    .map((row) => ({ id: row.id, ...row.data(), is_down_payment: Boolean(row.data().is_down_payment) }))
    .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)));
}

export async function addPayment(payload) {
  const ownerUid = requireOwnerUid();
  const customerId = payload.customer_id;
  const customer = mapCustomerDoc(await getDoc(customerRef(customerId)));
  if (!customer || customer.owner_uid !== ownerUid) throw new Error('Customer not found.');

  const amount = Math.max(0.01, Number(payload.amount) || 0);
  const id = uuid();
  const now = nowIso();
  const record = {
    owner_uid: ownerUid,
    customer_id: customerId,
    amount,
    currency: String(payload.currency || 'K'),
    payment_date: payload.payment_date || todayIsoDate(),
    is_down_payment: payload.is_down_payment ? 1 : 0,
    notes: String(payload.notes || '').trim(),
    created_at: now,
  };

  await setDoc(doc(paymentsCollection(customerId), id), record);
  await setDoc(customerRef(customerId), { updated_at: now }, { merge: true });
  return { id, ...record, is_down_payment: Boolean(record.is_down_payment) };
}

async function getMeta(ownerUid) {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.meta, ownerUid));
  return snap.exists() ? snap.data() : {};
}

async function setMeta(ownerUid, patch) {
  await setDoc(doc(getDb(), COLLECTIONS.meta, ownerUid), patch, { merge: true });
}

export async function getDashboardData() {
  const customers = await listCustomers();
  const withBalance = customers.filter((c) => hasBalance(c.balance));
  const overdue = withBalance.filter((c) => c.overdue);
  const totalOutstanding = withBalance.reduce((sum, c) => sum + c.balance, 0);
  const monthlyReport = await getMonthlyReportIfDue(withBalance);

  return {
    customers,
    withBalance,
    overdue,
    totalOutstanding,
    monthlyReport,
    stats: {
      customerCount: customers.length,
      pendingCount: withBalance.length,
      overdueCount: overdue.length,
      totalOutstanding,
    },
  };
}

export async function getMonthlyReportIfDue(withBalanceInput) {
  const ownerUid = requireOwnerUid();
  const withBalance = withBalanceInput || (await listCustomers()).filter((c) => hasBalance(c.balance));
  const meta = await getMeta(ownerUid);
  const lastShown = meta.last_monthly_report_shown_at || '';
  const now = Date.now();
  const lastMs = lastShown ? new Date(lastShown).getTime() : 0;
  const due = !lastShown || (now - lastMs) >= MONTHLY_REPORT_DAYS * 24 * 60 * 60 * 1000;

  if (!due || withBalance.length === 0) {
    return { due: false, rows: [], totalOutstanding: 0, generatedAt: null };
  }

  const totalOutstanding = withBalance.reduce((sum, c) => sum + c.balance, 0);
  return {
    due: true,
    generatedAt: new Date().toISOString(),
    totalOutstanding,
    rows: withBalance.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: c.balance,
      daysRemaining: c.daysRemaining,
      overdue: c.overdue,
    })),
  };
}

export async function acknowledgeMonthlyReport() {
  const ownerUid = requireOwnerUid();
  await setMeta(ownerUid, { last_monthly_report_shown_at: nowIso() });
}
