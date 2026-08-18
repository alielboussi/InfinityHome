import { newUuid } from '../lib/uuid.js';
import { collectionRef, getFirestore, queryCollectionWhere } from '../lib/firestoreDb.js';
import { finalizeFirestoreCheckout } from '../lib/firestoreCheckout.js';
import { LUSAKA_LOCATION_ID, classifyWebOrderItems, deductShopVariantStock, validateWebOrderStock } from '../lib/firestoreShop.js';
import {
  fetchMobileMoneyPaymentStatus,
  paymentStatusIsFailed,
  paymentStatusIsSuccessful,
  requestMobileMoneyPayment,
} from '../lib/mobileMoney.js';
import { sendEmail } from '../lib/sendEmail.js';
import { requireBearerUser } from '../lib/verifyBearerUser.js';
import { formatPosReceiptNumber } from '../../src/utils/receiptNumber.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('260')) return digits;
  if (digits.startsWith('0')) return `260${digits.slice(1)}`;
  if (digits.length === 9) return `260${digits}`;
  return digits;
}

function normalizeItems(items = []) {
  return (items || [])
    .map((item) => ({
      product_id: String(item?.product_id || item?.productId || '').trim(),
      variant_id: String(item?.variant_id || item?.variantId || '').trim(),
      variant_name: String(item?.variant_name || item?.variantName || '').trim(),
      display_name: String(item?.display_name || item?.name || '').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
      unit_price: Number(item?.unit_price ?? item?.price ?? 0),
      currency: String(item?.currency || 'K').trim() || 'K',
    }))
    .filter((item) => item.product_id && item.display_name && item.quantity > 0);
}

function normalizePaymentType(raw) {
  const norm = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  const map = {
    cash: 'cash',
    mobile_money: 'mobile_money',
    mobilemoney: 'mobile_money',
    mtn: 'mobile_money',
    airtel: 'mobile_money',
    bank: 'bank_transfer',
    bank_transfer: 'bank_transfer',
    cheque: 'cheque',
    visa_card: 'visa_card',
    card: 'visa_card',
  };
  return map[norm] || 'mobile_money';
}

function buildWebReceiptNumber(orderId) {
  const suffix = String(orderId || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(2, 12);
  return formatPosReceiptNumber(`WEB${ts}${suffix}`);
}

function shopCurrencyToProvider(currency) {
  return String(currency || 'K').toUpperCase() === 'USD' ? 'USD' : 'ZMW';
}

function orderCustomerName(order) {
  const customer = order?.customer || {};
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'Customer';
}

async function saveWebOrderPatch(db, orderId, patch) {
  await collectionRef(db, 'web_orders').doc(String(orderId)).set(patch, { merge: true });
}

async function fetchAllCustomers(db) {
  const snap = await collectionRef(db, 'customers').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function findOrCreateCustomer(db, customerInput = {}) {
  const firstName = String(customerInput.first_name || customerInput.firstName || '').trim();
  const lastName = String(customerInput.last_name || customerInput.lastName || '').trim();
  const phone = normalizePhone(customerInput.phone);
  const email = String(customerInput.email || '').trim().toLowerCase();
  const address = String(customerInput.address || '').trim();
  const city = String(customerInput.city || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
    || String(customerInput.name || '').trim();

  if (!phone) throw new Error('Phone number is required');
  if (!email) throw new Error('Email is required');
  if (!fullName) throw new Error('Customer name is required');

  const existing = await fetchAllCustomers(db);
  const phoneMatch = (existing || []).find((row) => normalizePhone(row?.phone) === phone);
  const nowIso = new Date().toISOString();

  if (phoneMatch?.id) {
    await collectionRef(db, 'customers').doc(String(phoneMatch.id)).set({
      name: fullName,
      phone,
      email,
      address,
      city,
      updated_at: nowIso,
    }, { merge: true });
    return String(phoneMatch.id);
  }

  const customerId = newUuid();
  await collectionRef(db, 'customers').doc(customerId).set({
    id: customerId,
    name: fullName,
    phone,
    email,
    address,
    city,
    currency: 'K',
    created_at: nowIso,
    updated_at: nowIso,
    source: 'web_shop',
  });
  return customerId;
}

async function loadWebOrder(db, orderId) {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('orderId is required');
  const snap = await collectionRef(db, 'web_orders').doc(id).get();
  if (!snap.exists) throw new Error('Order not found');
  return { id: snap.id, ...snap.data() };
}

export async function listWebOrders({ status = 'pending', locationId = LUSAKA_LOCATION_ID } = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');

  const filters = [];
  if (locationId) filters.push({ field: 'location_id', op: '==', value: locationId });
  if (status && status !== 'all') filters.push({ field: 'status', op: '==', value: status });

  let rows = [];
  try {
    rows = await queryCollectionWhere(db, 'web_orders', filters);
  } catch {
    rows = (await collectionRef(db, 'web_orders').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if (locationId) rows = rows.filter((row) => String(row.location_id) === String(locationId));
    if (status && status !== 'all') rows = rows.filter((row) => String(row.status) === String(status));
  }

  return rows.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
}

export async function createWebOrder(payload = {}) {
  return initiateWebOrderPayment(payload);
}

export async function initiateWebOrderPayment(payload = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');

  const customerInput = payload.customer || {};
  const items = normalizeItems(payload.items);
  if (!items.length) throw new Error('Cart is empty');

  const provider = String(payload.provider || payload.payment_provider || 'mtn').trim().toLowerCase();
  if (!['mtn', 'airtel'].includes(provider)) {
    throw new Error('Choose MTN or Airtel for payment');
  }

  const totalAmount = items.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0,
  );
  if (!(totalAmount > 0)) throw new Error('Order total must be greater than zero');

  const customerId = await findOrCreateCustomer(db, customerInput);
  const locationId = LUSAKA_LOCATION_ID;
  await validateWebOrderStock(db, locationId, items);

  const orderId = newUuid();
  const paymentReferenceId = newUuid();
  const nowIso = new Date().toISOString();
  const currency = String(payload.currency || items[0]?.currency || 'K');

  const order = {
    id: orderId,
    status: 'awaiting_payment',
    channel: 'web',
    location_id: locationId,
    customer_id: customerId,
    customer: {
      first_name: String(customerInput.first_name || customerInput.firstName || '').trim(),
      last_name: String(customerInput.last_name || customerInput.lastName || '').trim(),
      phone: normalizePhone(customerInput.phone),
      email: String(customerInput.email || '').trim().toLowerCase(),
      address: String(customerInput.address || '').trim(),
      city: String(customerInput.city || '').trim(),
    },
    items,
    total_amount: totalAmount,
    currency,
    payment_status: 'awaiting_payment',
    payment_provider: provider,
    payment_reference_id: paymentReferenceId,
    sale_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await collectionRef(db, 'web_orders').doc(orderId).set(order);

  const payment = await requestMobileMoneyPayment({
    provider,
    phone: order.customer.phone,
    amount: totalAmount,
    currency: shopCurrencyToProvider(currency),
    referenceId: paymentReferenceId,
    externalId: orderId,
    note: `Infinity Home order ${orderId.slice(0, 8)}`,
  });

  await saveWebOrderPatch(db, orderId, {
    payment_status: payment?.status || 'awaiting_payment',
    updated_at: new Date().toISOString(),
  });

  return {
    order: { ...order, payment_status: payment?.status || 'awaiting_payment' },
    payment,
  };
}

export async function completeWebOrderOnPayment({
  orderId,
  paymentReference = '',
  paymentType = 'mobile_money',
  provider = '',
  financialTransactionId = '',
} = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');

  const order = await loadWebOrder(db, orderId);
  if (String(order.status) === 'confirmed') {
    return { order, alreadyCompleted: true };
  }
  if (String(order.status) !== 'awaiting_payment') {
    throw new Error(`Order is ${order.status}`);
  }

  const items = normalizeItems(order.items);
  if (!items.length) throw new Error('Order has no items');

  const locationId = order.location_id || LUSAKA_LOCATION_ID;
  await validateWebOrderStock(db, locationId, items);
  const { inventoryItems, variantItems } = await classifyWebOrderItems(db, locationId, items);

  const totalAmount = Number(order.total_amount || 0);
  if (!(totalAmount > 0)) throw new Error('Order total must be greater than zero');

  const formattedReceipt = buildWebReceiptNumber(order.id);
  const nowIso = new Date().toISOString();
  const paymentRef = String(
    financialTransactionId || paymentReference || order.payment_reference_id || '',
  ).trim() || formattedReceipt;

  const checkout = await finalizeFirestoreCheckout({
    sale: {
      customer_id: order.customer_id,
      sale_date: nowIso,
      total_amount: totalAmount,
      status: 'completed',
      location_id: locationId,
      currency: order.currency || items[0]?.currency || 'K',
      discount: 0,
      receipt_number: formattedReceipt,
      user_uid: null,
      user_id: null,
    },
    items: items.map((item) => ({
      product_id: item.product_id,
      display_name: item.display_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency: item.currency,
      color: item.variant_name || null,
    })),
    deductionItems: inventoryItems.map((item) => ({
      product_id: item.product_id,
      display_name: item.display_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency: item.currency,
    })),
    payments: [{
      amount: totalAmount,
      payment_type: normalizePaymentType(provider || paymentType),
      currency: order.currency || items[0]?.currency || 'K',
      payment_date: nowIso,
      reference: paymentRef,
    }],
  });

  const saleId = checkout?.sale?.id;
  let variantStockApplied = false;
  if (variantItems.length) {
    await deductShopVariantStock(db, locationId, variantItems, { orderId: order.id, saleId });
    variantStockApplied = true;
  }
  const patch = {
    status: 'confirmed',
    payment_status: 'paid',
    sale_id: saleId != null ? String(saleId) : null,
    receipt_number: formattedReceipt,
    payment_type: normalizePaymentType(provider || paymentType),
    payment_reference: paymentRef,
    confirmed_at: nowIso,
    updated_at: nowIso,
  };
  await saveWebOrderPatch(db, order.id, patch);

  return {
    order: { ...order, ...patch },
    sale: checkout.sale,
    inventoryApplied: checkout.inventoryApplied,
    variantStockApplied,
  };
}

export async function syncWebOrderPaymentStatus(orderId) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');

  const order = await loadWebOrder(db, orderId);
  if (String(order.status) === 'confirmed') {
    return { order, paymentStatus: 'SUCCESSFUL', completed: true };
  }
  if (String(order.status) !== 'awaiting_payment') {
    return { order, paymentStatus: order.payment_status || order.status, completed: false };
  }

  const provider = order.payment_provider;
  const referenceId = order.payment_reference_id;
  if (!provider || !referenceId) {
    throw new Error('Order is missing payment provider details');
  }

  const statusRow = await fetchMobileMoneyPaymentStatus({ provider, referenceId });
  const paymentStatus = statusRow?.status || 'PENDING';

  if (paymentStatusIsSuccessful(paymentStatus)) {
    const result = await completeWebOrderOnPayment({
      orderId: order.id,
      paymentReference: referenceId,
      paymentType: provider,
      provider,
      financialTransactionId: statusRow?.financialTransactionId,
    });
    return {
      order: result.order,
      paymentStatus,
      completed: true,
      sale: result.sale,
    };
  }

  if (paymentStatusIsFailed(paymentStatus)) {
    const patch = {
      status: 'failed',
      payment_status: 'failed',
      payment_failure_reason: statusRow?.reason || paymentStatus,
      updated_at: new Date().toISOString(),
    };
    await saveWebOrderPatch(db, order.id, patch);
    return {
      order: { ...order, ...patch },
      paymentStatus,
      completed: false,
      failed: true,
    };
  }

  await saveWebOrderPatch(db, order.id, {
    payment_status: String(paymentStatus).toLowerCase(),
    updated_at: new Date().toISOString(),
  });

  return {
    order: { ...order, payment_status: String(paymentStatus).toLowerCase() },
    paymentStatus,
    completed: false,
  };
}

export async function cancelWebOrder({ orderId, reason = '', cancelledBy = null } = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');

  const order = await loadWebOrder(db, orderId);
  if (!['awaiting_payment', 'pending'].includes(String(order.status))) {
    throw new Error(`Order is already ${order.status}`);
  }

  const nowIso = new Date().toISOString();
  const patch = {
    status: 'cancelled',
    payment_status: 'cancelled',
    cancel_reason: String(reason || '').trim() || null,
    cancelled_by: cancelledBy || null,
    cancelled_at: nowIso,
    updated_at: nowIso,
  };
  await collectionRef(db, 'web_orders').doc(String(order.id)).set(patch, { merge: true });
  return { ...order, ...patch };
}

export async function confirmWebOrder(payload = {}) {
  return completeWebOrderOnPayment({
    orderId: payload.orderId || payload.order_id,
    paymentReference: payload.paymentReference || payload.payment_reference,
    paymentType: payload.paymentType || payload.payment_type,
    provider: payload.provider || payload.payment_provider,
    financialTransactionId: payload.financialTransactionId || payload.financial_transaction_id,
  });
}

export async function emailWebOrderReceipt({
  to,
  customerName,
  receiptNumber,
  pdfUrl,
  pdfFilename,
  orderId,
} = {}) {
  const recipient = String(to || '').trim();
  if (!recipient) throw new Error('Customer email is required');

  const receiptLabel = formatPosReceiptNumber(receiptNumber) || String(receiptNumber || '').trim();
  const name = String(customerName || 'Customer').trim();
  const subject = `Infinity Home receipt ${receiptLabel || ''}`.trim();
  const currencyNote = 'Thank you for shopping with Infinity Home.';
  const text = [
    `Dear ${name},`,
    '',
    `Your online order${orderId ? ` (${orderId})` : ''} has been confirmed.`,
    receiptLabel ? `Receipt: ${receiptLabel}` : '',
    pdfUrl ? `Receipt PDF: ${pdfUrl}` : '',
    '',
    currencyNote,
  ].filter(Boolean).join('\n');

  const html = `
    <p>Dear ${name},</p>
    <p>Your online order has been confirmed.</p>
    ${receiptLabel ? `<p><strong>Receipt:</strong> ${receiptLabel}</p>` : ''}
    ${pdfUrl ? `<p><a href="${pdfUrl}">Download your receipt PDF</a></p>` : ''}
    <p>${currencyNote}</p>
  `;

  await sendEmail({
    to: recipient,
    subject,
    text,
    html,
    pdfUrl,
    pdfFilename: pdfFilename || `${name.replace(/\s+/g, '_')}_Sales_Receipt.pdf`,
  });

  return { ok: true };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const body = req.body || {};
    const action = String(req.query?.action || body.action || (req.method === 'GET' ? 'list' : 'create')).trim().toLowerCase();
    const staffActions = new Set(['list', 'cancel', 'email-receipt']);
    let actor = null;
    if (staffActions.has(action)) {
      actor = await requireBearerUser(req);
    }

    if (action === 'payment-status' && (req.method === 'GET' || req.method === 'POST')) {
      const orderId = String(req.query?.orderId || req.query?.order_id || body.orderId || body.order_id || '').trim();
      const result = await syncWebOrderPaymentStatus(orderId);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (action === 'list' && (req.method === 'GET' || req.method === 'POST')) {
      const status = String(req.query?.status || body.status || 'pending').trim().toLowerCase();
      const orders = await listWebOrders({ status });
      res.status(200).json({ ok: true, orders });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    if (action === 'create' || action === 'initiate-payment') {
      const result = await initiateWebOrderPayment(body);
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (action === 'payment-callback') {
      const orderId = String(body.externalId || body.orderId || body.order_id || req.query?.orderId || '').trim();
      const provider = String(body.provider || req.query?.provider || '').trim().toLowerCase();
      if (!orderId) {
        res.status(400).json({ ok: false, error: 'Missing order reference' });
        return;
      }
      const result = await syncWebOrderPaymentStatus(orderId);
      res.status(200).json({ ok: true, provider, ...result });
      return;
    }

    if (action === 'send-customer-receipt') {
      const orderId = String(body.orderId || body.order_id || '').trim();
      const order = await loadWebOrder(getFirestore(), orderId);
      if (String(order.status) !== 'confirmed') {
        throw new Error('Receipt is only available for confirmed orders');
      }
      const email = String(order?.customer?.email || '').trim();
      if (!email) throw new Error('Customer email is missing on this order');
      await emailWebOrderReceipt({
        to: email,
        customerName: orderCustomerName(order),
        receiptNumber: order.receipt_number,
        pdfUrl: body.pdfUrl || body.pdf_url,
        pdfFilename: body.pdfFilename || body.pdf_filename,
        orderId: order.id,
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'confirm') {
      res.status(410).json({
        ok: false,
        error: 'Manual order confirmation is disabled. Orders complete automatically when MTN or Airtel payment succeeds.',
      });
      return;
    }

    if (action === 'cancel') {
      const order = await cancelWebOrder({
        orderId: body.orderId || body.order_id,
        reason: body.reason,
        cancelledBy: body.cancelledBy || body.cancelled_by || actor?.email || null,
      });
      res.status(200).json({ ok: true, order });
      return;
    }

    if (action === 'email-receipt') {
      const payload = await emailWebOrderReceipt({
        to: body.to || body.email,
        customerName: body.customerName || body.customer_name,
        receiptNumber: body.receiptNumber || body.receipt_number,
        pdfUrl: body.pdfUrl || body.pdf_url,
        pdfFilename: body.pdfFilename || body.pdf_filename,
        orderId: body.orderId || body.order_id,
      });
      res.status(200).json(payload);
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const status = err?.status || 400;
    res.status(status).json({ ok: false, error: err?.message || String(err), code: err?.code || null });
  }
}
