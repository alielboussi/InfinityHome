// Consolidated notifications serverless API (WasenderApi / Whapi.Cloud groups or Meta Cloud API).

import {
  isBasyouniCustomer,
  usesCashBookWhatsAppRouting,
  usesCompactDownpaymentWhatsApp,
  BASYOUNI_CASH_BOOK_GROUP_ID,
} from '../src/utils/whatsappCustomerRules.js';

const WHATSAPP_TEXT_LIMIT = 4096;
const WHAPI_TIMEOUT_MS = Number(process.env.WHAPI_TIMEOUT_MS || 20000);
const WASENDER_API_URL = String(process.env.WASENDER_API_URL || 'https://www.wasenderapi.com/api/send-message').trim();
const WASENDER_TIMEOUT_MS = Number(process.env.WASENDER_TIMEOUT_MS || WHAPI_TIMEOUT_MS);
const WASENDER_MIN_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.WASENDER_MIN_INTERVAL_MS || 5500) || 5500,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWasenderRateLimitError(err) {
  const parts = [
    err?.message,
    err?.details?.error?.message,
    err?.details?.message,
    typeof err?.details?.error === 'string' ? err.details.error : '',
  ];
  const msg = parts.filter(Boolean).join(' ').toLowerCase();
  return msg.includes('account protection')
    || msg.includes('every 5 second')
    || msg.includes('rate limit');
}

function wasenderMessageId(response) {
  return response?.data?.id || response?.message?.id || response?.id || null;
}

async function sendWasenderWithPacing(targets, sendFn) {
  const unique = Array.from(new Set(targets));
  const results = [];

  for (let i = 0; i < unique.length; i += 1) {
    if (i > 0) await sleep(WASENDER_MIN_INTERVAL_MS);
    const to = unique[i];
    let response;
    try {
      response = await sendFn(to);
    } catch (err) {
      if (!isWasenderRateLimitError(err)) throw err;
      await sleep(WASENDER_MIN_INTERVAL_MS);
      response = await sendFn(to);
    }
    results.push({ to, messageId: wasenderMessageId(response) });
  }

  return results;
}



const FAHME_CUSTOMER_IDS = new Set([

  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',

  'efb21cad-1a8d-4d64-9487-51e816fcb429',

]);

const LUSAKA_BRANCH_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';



const RECIPIENT_KEYS = {

  layby: ['WHATSAPP_LAYBY_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  sale: ['WHATSAPP_SALES_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  transfer: ['WHATSAPP_TRANSFER_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  labels: ['WHATSAPP_LABELS_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  ledger: ['WHATSAPP_LEDGER_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

};



const GROUP_KEYS = {

  layby: 'WHATSAPP_LAYBY_GROUP_ID',

  sale: 'WHATSAPP_SALES_GROUP_ID',

  lusakaSale: 'WHATSAPP_LUSAKA_SALES_GROUP_ID',

  fahme: 'WHATSAPP_FAHME_GROUP_ID',

  transfer: 'WHATSAPP_TRANSFER_GROUP_ID',

  labels: 'WHATSAPP_LABELS_GROUP_ID',

  lusakaTransfer: 'WHATSAPP_LUSAKA_TRANSFER_GROUP_ID',

  monthlyBalance: 'WHATSAPP_MONTHLY_BALANCE_GROUP_ID',

  ledger: 'WHATSAPP_LEDGER_GROUP_ID',

};

// Documented in docs/whatsapp-groups.txt — safe fallback when env group id is unset.
const DOCUMENTED_WHATSAPP_GROUP_IDS = {
  labels: '120363410723287387@g.us',
  transfer: '120363410583418058@g.us',
  lusakaTransfer: '',
  lusakaSale: '260966000444-1611566360@g.us',
  sale: '120363420239254016@g.us',
  layby: '120363429021437712@g.us',
  fahme: '120363372527723284@g.us',
  ledger: '120363246815974105@g.us',
};



const normalizeCurrency = (raw) => {

  const val = String(raw || '').trim().toUpperCase();

  if (val === '$' || val === 'USD') return 'USD';

  if (val === 'K' || val === 'ZMW') return 'K';

  return val || 'K';

};



const BALANCE_CLOSED_THRESHOLD = 1;

function normalizeBalanceDue(balanceDue, currency = 'K') {
  const due = Math.max(0, Number(balanceDue || 0));
  const threshold = BALANCE_CLOSED_THRESHOLD;
  if (due < threshold) return 0;
  return due;
}

function isBalanceEffectivelyClosed(balanceDue, currency = 'K') {
  return normalizeBalanceDue(balanceDue, currency) <= 0;
}

function parseBalanceDueDays(value) {
  const n = Math.floor(Number(String(value ?? '').trim()));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function computeBalanceDueDeadline(createdAtIso, days) {
  const daysNum = parseBalanceDueDays(days);
  if (!daysNum) return null;
  const start = new Date(createdAtIso || new Date().toISOString());
  if (Number.isNaN(start.getTime())) return null;
  const deadline = new Date(start.getTime());
  deadline.setUTCDate(deadline.getUTCDate() + daysNum);
  return deadline.toISOString();
}

function buildLaybyPaymentLooseKey(row) {
  const saleId = String(row?.sale_id || '').trim();
  const dateRaw = String(row?.payment_date || '').trim();
  const day = dateRaw ? dateRaw.slice(0, 10) : '';
  const amount = Number(row?.amount || 0);
  const type = String(row?.payment_type || '').toLowerCase();
  const reference = String(row?.reference || '').trim().replace(/^#/, '').toLowerCase();
  return `${saleId}|${day}|${amount.toFixed(2)}|${type}|${reference}`;
}

function dedupeLaybyPaymentRows(rows = []) {
  const seen = new Set();
  const deduped = [];
  (rows || []).forEach((row) => {
    const normalized = {
      ...row,
      payment_type: String(row?.payment_type || '').toLowerCase(),
    };
    const key = buildLaybyPaymentLooseKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(normalized);
  });
  return deduped;
}

const formatAmount = (amount, currency) => {

  const n = Number(amount || 0);

  const decimals = n % 1 !== 0;

  const fmt = Number.isFinite(n)

    ? n.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })

    : '0';

  const label = normalizeCurrency(currency) === 'USD' ? '$' : 'K';

  return `${label} ${fmt}`;

};



const hasValue = (val) => {

  if (val === undefined || val === null) return false;

  if (typeof val === 'string' && val.trim() === '') return false;

  return true;

};



const pushLine = (lines, label, value) => {

  if (!hasValue(value)) return;

  lines.push(`${label}: ${value}`);

};



function isFahmeCustomer(customerId) {

  if (!customerId) return false;

  return FAHME_CUSTOMER_IDS.has(String(customerId).trim().toLowerCase());

}



function getWasenderToken() {
  return String(process.env.WASENDER_API_TOKEN || process.env.WHATSAPP_WASENDER_API_TOKEN || '').trim();
}

function isWasenderOnlyProvider() {
  const provider = String(process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  return provider === 'wasender' || provider === 'wasenderapi';
}

function canFallbackToWasender() {
  return Boolean(getWasenderToken());
}

function normalizeWasenderKind(kind) {
  const key = String(kind || '').trim().toLowerCase();
  if (key === 'monthlybalance' || key === 'monthly_balance' || key === 'monthly-balance') return 'layby';
  if (key === 'lusakatransfer' || key === 'lusaka_transfer' || key === 'lusaka-transfer') return 'transfer';
  return key;
}

function parseWasenderKinds() {
  const raw = String(process.env.WHATSAPP_WASENDER_KINDS || '').trim().toLowerCase();
  if (raw === 'all') return ['sale', 'layby', 'transfer', 'labels', 'ledger'];
  if (raw) {
    const kinds = raw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
    if (kinds.length && !kinds.includes('labels') && kinds.some((kind) => ['sale', 'layby', 'transfer'].includes(kind))) {
      kinds.push('labels');
    }
    return kinds;
  }
  if (isWasenderOnlyProvider()) return ['sale', 'layby', 'transfer', 'labels'];
  return [];
}

function isWasenderKindEnabled(kind) {
  return parseWasenderKinds().includes(normalizeWasenderKind(kind));
}

function getConfiguredProviderForKind(kind) {
  const normalized = normalizeWasenderKind(kind);
  const wasenderOnly = isWasenderOnlyProvider();
  if (getWasenderToken() && (isWasenderKindEnabled(kind) || wasenderOnly)) return 'wasender';
  if (wasenderOnly) return 'wasender';
  if (!wasenderOnly && getWhapiToken()) return 'whapi';
  return 'meta';
}

function isWhapiProvider() {

  const provider = String(process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();

  if (provider === 'whapi') return true;

  if (provider === 'wasender' || provider === 'wasenderapi') return false;

  if (provider === 'meta' || provider === 'cloud') return false;

  const token = getWhapiToken();

  const hasGroup = Boolean(readGroupId('layby') || readGroupId('fahme') || readGroupId('sale'));

  const metaPhone = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  return Boolean(token && hasGroup && !metaPhone);

}



function getWhapiToken() {

  if (isWasenderOnlyProvider()) return '';

  return String(process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();

}



function readGroupId(kind) {

  const key = GROUP_KEYS[kind];

  if (!key) return '';

  const fromEnv = String(process.env[key] || '').trim();

  if (fromEnv) return fromEnv;

  return String(DOCUMENTED_WHATSAPP_GROUP_IDS[kind] || '').trim();

}



function readRecipients(kind) {

  const keys = RECIPIENT_KEYS[kind] || ['WHATSAPP_RECIPIENTS'];

  for (const key of keys) {

    const raw = String(process.env[key] || '').trim();

    if (!raw) continue;

    const numbers = raw

      .split(/[,;\s]+/)

      .map((part) => part.replace(/[^\d]/g, ''))

      .filter(Boolean);

    if (numbers.length) return numbers;

  }

  return [];

}



function resolveDeliveryTargets(kind, customerId, options = {}) {

  const targets = [];

  const provider = getConfiguredProviderForKind(kind);

  if (provider === 'wasender' || provider === 'whapi') {

    if (kind === 'layby') {

      if (isFahmeCustomer(customerId)) {

        const fahmeGroup = readGroupId('fahme');

        if (fahmeGroup) targets.push(fahmeGroup);

      } else {

        const laybyGroup = readGroupId('layby');

        if (laybyGroup) targets.push(laybyGroup);

      }

    } else if (kind === 'sale') {

      const locationId = options.locationId != null ? String(options.locationId).trim() : '';

      if (locationId === LUSAKA_BRANCH_ID) {

        const lusakaSalesGroup = readGroupId('lusakaSale');

        if (lusakaSalesGroup) targets.push(lusakaSalesGroup);

      } else {

        const salesGroup = readGroupId('sale');

        if (salesGroup) targets.push(salesGroup);

      }

    } else {

      const groupId = readGroupId(kind);

      if (groupId) targets.push(groupId);

    }

    return targets.length
      ? { mode: 'group', targets: Array.from(new Set(targets)), provider }
      : { mode: 'none', targets: [], provider };

  }

  const recipients = readRecipients(kind);

  return recipients.length
    ? { mode: 'dm', targets: recipients, provider: 'meta' }
    : { mode: 'none', targets: [], provider: 'meta' };

}



function resolveLaybyNotificationTargets(customerId, { locationId } = {}) {

  const locId = locationId != null ? String(locationId).trim() : '';

  if (locId === LUSAKA_BRANCH_ID && !isFahmeCustomer(customerId)) {

    const lusakaRouting = resolveDeliveryTargets('sale', customerId, { locationId: LUSAKA_BRANCH_ID });

    return {

      mode: lusakaRouting.mode,

      provider: lusakaRouting.provider,

      targets: lusakaRouting.targets,

    };

  }

  const laybyRouting = resolveDeliveryTargets('layby', customerId);

  return {

    mode: laybyRouting.mode,

    provider: laybyRouting.provider,

    targets: laybyRouting.targets,

  };

}



function resolveCashBookGroupId() {

  return readGroupId('ledger') || BASYOUNI_CASH_BOOK_GROUP_ID || DOCUMENTED_WHATSAPP_GROUP_IDS.ledger;

}



function resolveCustomerWhatsAppRouting(kind, customerId, customerName, options = {}) {

  if (usesCashBookWhatsAppRouting(customerId, customerName)) {

    const group = resolveCashBookGroupId();

    const provider = getConfiguredProviderForKind(kind);

    return group

      ? { mode: 'group', targets: [group], provider }

      : { mode: 'none', targets: [], provider };

  }

  if (kind === 'layby') {

    return resolveLaybyNotificationTargets(customerId, options);

  }

  return resolveDeliveryTargets(kind, customerId, options);

}



function getMetaWhatsAppConfig() {

  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '').trim();

  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v21.0').trim() || 'v21.0';

  if (!accessToken || !phoneNumberId) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }

  return { accessToken, phoneNumberId, apiVersion };

}



function getWasenderConfig() {

  const token = getWasenderToken();

  if (!token) {

    const err = new Error('WhatsApp env not configured (WASENDER_API_TOKEN)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }

  return { token };

}



function getWhapiConfig() {

  const token = getWhapiToken();

  if (!token) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_API_TOKEN)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }

  return { token };

}



function setCors(res) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass');

}



async function getDbClient() {
  const { getDataClient } = await import('../server/lib/getDataClient.js');
  return getDataClient();
}



function resolveAction(req) {

  const action = String(req.query?.action || req.query?.a || req.body?.action || req.body?.a || '')

    .trim()

    .toLowerCase();

  if (action) return action;



  if (req.body?.saleId !== undefined && req.body?.saleId !== null) return 'whatsapp-sale';

  if (req.body?.laybyId) return 'whatsapp-layby';

  if (req.body?.pdfUrl) return 'whatsapp-labels';

  if (req.body?.message) return 'whatsapp-transfer';

  return '';

}



const LUSAKA_TZ = 'Africa/Lusaka';
const PRODUCT_LINE_SEP = '─────────────────';
const WHATSAPP_CAPTION_LIMIT = 1020;

function formatDateTimeParts(iso) {

  if (!iso) return { date: '', time: '' };

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {

    const raw = String(iso);

    return { date: raw.slice(0, 10), time: '' };

  }

  try {

    const parts = new Intl.DateTimeFormat('en-GB', {

      timeZone: LUSAKA_TZ,

      day: '2-digit',

      month: '2-digit',

      year: 'numeric',

      hour: '2-digit',

      minute: '2-digit',

      second: '2-digit',

      hour12: false,

    }).formatToParts(d);

    const get = (type) => parts.find((part) => part.type === type)?.value || '';

    return {

      date: `${get('day')}/${get('month')}/${get('year')}`,

      time: `${get('hour')}:${get('minute')}:${get('second')}`,

    };

  } catch {

    const pad = (n) => String(n).padStart(2, '0');

    return {

      date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,

      time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,

    };

  }

}



function formatSaleDateForMessage(isoOrDate) {
  if (!isoOrDate) return '';
  const raw = String(isoOrDate).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  return formatDateTimeParts(raw).date;
}

function formatReceiptNumberForMessage(receiptNumber) {
  return String(receiptNumber || '')
    .split(',')
    .map((part) => part.trim().replace(/^#+\s*/, ''))
    .filter(Boolean)
    .join(', ');
}

function resolveMessageDateIso({ sale, payments, eventType, fallbackIso }) {
  if (eventType === 'payment' && Array.isArray(payments) && payments.length) {
    const latest = payments[payments.length - 1];
    if (latest?.payment_date) return latest.payment_date;
  }
  if (sale?.sale_date) return sale.sale_date;
  if (sale?.created_at) return sale.created_at;
  return fallbackIso || '';
}

function formatPaymentMethod(type) {

  const key = String(type || '').trim().toLowerCase();

  const map = {

    cash: 'CASH',

    bank_transfer: 'BANK TRANSFER',

    mobile_money: 'MOBILE MONEY',

    cheque: 'CHEQUE',

    visa_card: 'VISA CARD',

    goods: 'GOODS',

    credit: 'CREDIT',

  };

  return map[key] || key.replace(/_/g, ' ').toUpperCase();

}



function getPaymentMethodEmoji(type) {

  const key = String(type || '').trim().toLowerCase();

  const map = {

    cash: '💵',

    visa_card: '💳',

    bank_transfer: '🏦',

    mobile_money: '💸',

  };

  return map[key] || '💳';

}



function paymentMethodDisplayName(type) {

  const key = String(type || '').trim().toLowerCase();

  const map = {

    cash: 'Cash',

    bank_transfer: 'Bank Transfer',

    mobile_money: 'Mobile Money',

    cheque: 'Cheque',

    visa_card: 'Visa Card',

    goods: 'Goods',

    credit: 'Credit',

    down_payment: 'Down Payment',

  };

  return map[key] || formatPaymentMethod(type).toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

}



function waBold(text) {

  return `*${String(text || '').replace(/\*/g, '').trim()}*`;

}



function sumSaleCashPayments(salePayments) {
  return (salePayments || []).reduce((sum, payment) => {
    if (String(payment.payment_type || '').toLowerCase() === 'credit') return sum;
    return sum + Number(payment.amount || 0);
  }, 0);
}

// Mirrors POS partial/layby settlement: discounted sales can still accrue net total to layby.
function computeSaleLaybyOutstanding(sale, salePayments) {
  const net = Number(sale?.total_amount || 0);
  const disc = Number(sale?.discount || 0);
  const subtotal = net + disc;
  const paid = sumSaleCashPayments(salePayments);
  let outstanding = Math.max(0, subtotal - paid - disc);
  if (disc > 0 && paid + 0.0001 < subtotal && outstanding < 0.0001) {
    outstanding = net;
  }
  return outstanding;
}

function computeLaybyAdditionBalances(sales, payments, focusSaleId) {
  const rows = Array.isArray(sales) ? sales.filter(Boolean) : [];
  const payRows = Array.isArray(payments) ? payments : [];
  let previousDueBalance = 0;
  let newSaleDue = 0;
  rows.forEach((sale) => {
    const salePayments = payRows.filter((payment) => String(payment.sale_id) === String(sale.id));
    const outstanding = computeSaleLaybyOutstanding(sale, salePayments);
    if (focusSaleId != null && String(sale.id) === String(focusSaleId)) {
      newSaleDue = outstanding;
    } else {
      previousDueBalance += outstanding;
    }
  });
  return {
    previousDueBalance,
    newSaleDue,
    balanceDue: previousDueBalance + newSaleDue,
  };
}

const LAYBY_SALE_SELECT = 'id, sale_date, created_at, currency, total_amount, location_id, receipt_number, discount';

function mergeSaleRows(existing, extra) {
  const rows = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(rows.map((row) => String(row.id)));
  (Array.isArray(extra) ? extra : [extra]).forEach((row) => {
    if (!row?.id) return;
    const key = String(row.id);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  });
  return rows;
}

async function fetchSaleRowById(db, saleId) {
  const id = saleId != null ? String(saleId).trim() : '';
  if (!id) return null;
  const { data } = await db
    .from('sales')
    .select(LAYBY_SALE_SELECT)
    .eq('id', saleId)
    .maybeSingle();
  return data || null;
}

async function loadLaybySalesForNotify(db, layby, focusSaleId) {
  let sales = [];
  const laybyId = layby?.id;

  if (laybyId != null) {
    const { data: byLayby } = await db
      .from('sales')
      .select(LAYBY_SALE_SELECT)
      .eq('layby_id', laybyId);
    sales = mergeSaleRows(sales, byLayby);

    const laybyIdNum = typeof laybyId === 'string' ? parseInt(laybyId, 10) : laybyId;
    if (Number.isFinite(laybyIdNum) && String(laybyIdNum) !== String(laybyId)) {
      const { data: byLaybyNum } = await db
        .from('sales')
        .select(LAYBY_SALE_SELECT)
        .eq('layby_id', laybyIdNum);
      sales = mergeSaleRows(sales, byLaybyNum);
    }
  }

  const extraIds = [layby?.sale_id, focusSaleId].filter((value) => value != null);
  for (const saleId of extraIds) {
    if (sales.some((row) => String(row.id) === String(saleId))) continue;
    const row = await fetchSaleRowById(db, saleId);
    if (row) sales = mergeSaleRows(sales, [row]);
  }

  return sales;
}

function pickFocusSale(sales, focusSaleId) {

  const rows = Array.isArray(sales) ? sales.filter(Boolean) : [];

  if (!rows.length) return null;

  if (focusSaleId != null) {

    const match = rows.find((sale) => String(sale.id) === String(focusSaleId));

    if (match) return match;

  }

  return rows.slice().sort((a, b) => {

    const aTs = new Date(a.created_at || a.sale_date || 0).getTime();

    const bTs = new Date(b.created_at || b.sale_date || 0).getTime();

    return bTs - aTs;

  })[0];

}



async function loadProductPriceMap(db, items) {

  const productIds = Array.from(new Set((items || []).map((item) => item.product_id).filter(Boolean)));

  const map = new Map();

  if (!productIds.length) return map;



  const chunkSize = 100;

  for (let i = 0; i < productIds.length; i += chunkSize) {

    const chunk = productIds.slice(i, i + chunkSize);

    const { data: products, error } = await db

      .from('products')

      .select('id, name, price, promotional_price')

      .in('id', chunk);

    if (error) console.warn('loadProductPriceMap products query failed:', error.message || error);

    (products || []).forEach((row) => {

      map.set(String(row.id), row);

    });

  }



  const missing = productIds.filter((id) => !map.has(String(id)));

  if (missing.length) {

    for (let i = 0; i < missing.length; i += chunkSize) {

      const chunk = missing.slice(i, i + chunkSize);

      const { data: quoteProducts } = await db

        .from('quotation_products')

        .select('id, name')

        .in('id', chunk);

      (quoteProducts || []).forEach((row) => {

        map.set(String(row.id), {

          id: row.id,

          name: row.name,

          price: 0,

          promotional_price: 0,

        });

      });

    }

  }



  return map;

}



const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeOpaqueId(value) {

  const raw = String(value || '').trim();

  return UUID_RE.test(raw) || /^\d+$/.test(raw);

}



function resolveItemName(item, productMap) {

  const displayName = String(item.display_name || '').trim();

  if (displayName && !looksLikeOpaqueId(displayName)) return displayName;

  const productId = item.product_id;

  if (productId && productMap.has(String(productId))) {

    const productName = String(productMap.get(String(productId))?.name || '').trim();

    if (productName) return productName;

  }

  return 'Product';

}



function safeProductLabel(item, productMap) {

  const name = resolveItemName(item, productMap);

  return looksLikeOpaqueId(name) ? 'Product' : name;

}



function resolveItemUnitPrice(item, productMap, locationPriceMap) {

  return resolveItemPrices(item, productMap, locationPriceMap).unit;

}



async function loadProductLocationPriceMap(db, items, locationId) {

  const map = new Map();

  if (!locationId) return map;

  const productIds = new Set(

    (items || []).map((item) => item.product_id).filter(Boolean).map(String),

  );

  if (!productIds.size) return map;



  let rows = [];

  try {

    const { getFirestore, queryCollectionWhere } = await import('../server/lib/firestoreDb.js');

    const firestore = getFirestore();

    if (firestore) {

      rows = await queryCollectionWhere(firestore, 'product_location_prices', [

        { field: 'location_id', op: '==', value: locationId },

      ]);

    }

  } catch (err) {

    console.warn('loadProductLocationPriceMap firestore query failed:', err?.message || err);

  }



  if (!rows.length) {

    const { data, error } = await db

      .from('product_location_prices')

      .select('product_id, location_id, price, promotional_price')

      .eq('location_id', locationId);

    if (error) console.warn('loadProductLocationPriceMap client query failed:', error.message || error);

    rows = data || [];

  }



  rows.forEach((row) => {

    if (row?.product_id != null && productIds.has(String(row.product_id))) {

      map.set(String(row.product_id), row);

    }

  });



  return map;

}



function selectBestCatalogPrice(promo, standard) {

  const promoValue = Number(promo);

  if (promo != null && promo !== '' && !Number.isNaN(promoValue) && promoValue > 0) return promoValue;

  const standardValue = Number(standard);

  if (standard != null && standard !== '' && !Number.isNaN(standardValue) && standardValue > 0) return standardValue;

  return 0;

}



function resolveLocationUnitPrice(locationRow) {

  if (!locationRow) return 0;

  return selectBestCatalogPrice(locationRow.promotional_price, locationRow.price);

}



function resolveItemPrices(item, productMap, locationPriceMap, options = {}) {

  const stored = Number(item.unit_price || 0);

  const productId = item.product_id != null ? String(item.product_id) : '';

  const impliedUnit = Number(options.impliedUnit || 0);



  const locationUnit = productId && locationPriceMap?.has(productId)

    ? resolveLocationUnitPrice(locationPriceMap.get(productId))

    : 0;



  const product = productId && productMap.has(productId) ? productMap.get(productId) : null;

  const catalogUnit = product

    ? selectBestCatalogPrice(product.promotional_price, product.price)

    : 0;



  if (impliedUnit > 0) {

    return { unit: impliedUnit, standard: impliedUnit, usedPromo: false };

  }



  // Custom POS override (price differs from generic catalog).

  if (stored > 0 && catalogUnit > 0 && Math.abs(stored - catalogUnit) > 0.009) {

    return { unit: stored, standard: stored, usedPromo: false };

  }

  if (stored > 0 && catalogUnit <= 0) {

    return { unit: stored, standard: stored, usedPromo: false };

  }



  // Location promo/price (e.g. Lusaka K2,200) beats generic catalog (K2,850).

  if (locationUnit > 0) {

    return { unit: locationUnit, standard: locationUnit, usedPromo: false };

  }



  if (stored > 0) {

    return { unit: stored, standard: stored, usedPromo: false };

  }



  if (catalogUnit > 0) {

    return { unit: catalogUnit, standard: catalogUnit, usedPromo: false };

  }



  return { unit: stored, standard: stored, usedPromo: false };

}



function buildProductLines(items, currency, productMap, {

  saleId,

  locationPriceMap,

  saleTotal,

  saleDiscount,

} = {}) {

  const scoped = (items || []).filter((item) => {

    if (saleId != null && item.sale_id != null && String(item.sale_id) !== String(saleId)) return false;

    const qty = Number(item.quantity || 0);

    const name = safeProductLabel(item, productMap);

    if (!name || qty <= 0) return false;

    const unit = resolveItemUnitPrice(item, productMap, locationPriceMap);

    return unit > 0;

  });



  const chargedSubtotal = Number(saleTotal || 0) + Number(saleDiscount || 0);

  const resolved = scoped.map((item) => {

    const qty = Number(item.quantity || 0);

    const { unit } = resolveItemPrices(item, productMap, locationPriceMap);

    return { item, qty, unit };

  });

  let linesSubtotal = resolved.reduce((sum, row) => sum + row.qty * row.unit, 0);

  if (chargedSubtotal > 0) {

    if (linesSubtotal > 0 && Math.abs(linesSubtotal - chargedSubtotal) > 0.009) {

      const factor = chargedSubtotal / linesSubtotal;

      resolved.forEach((row) => {

        row.unit *= factor;

      });

      linesSubtotal = chargedSubtotal;

    } else if (resolved.length === 1 && resolved[0].qty > 0) {

      resolved[0].unit = chargedSubtotal / resolved[0].qty;

    }

  }



  return resolved.map(({ item, qty, unit }) => {

    const name = safeProductLabel(item, productMap);

    const lineTotal = qty * unit;

    return `${qty} x ${waBold(name)} = (${formatAmount(unit, currency)} x ${qty}) = ${formatAmount(lineTotal, currency)}`;

  });

}



function buildPaidLine(payments, currency) {

  const rows = (payments || []).filter((payment) => Number(payment.amount || 0) > 0);

  if (!rows.length) return '';

  return rows.map((payment) => {

    const emoji = getPaymentMethodEmoji(payment.payment_type);

    const method = formatPaymentMethod(payment.payment_type);

    return `${emoji} Paid ${formatAmount(payment.amount, currency)} BY: ${method}`;

  }).join('\n');

}



function buildSalePaidLines(payments, currency) {

  const rows = (payments || []).filter((payment) => {

    if (Number(payment.amount || 0) <= 0) return false;

    return String(payment.payment_type || '').trim().toLowerCase() !== 'credit';

  });

  if (!rows.length) return '';



  const byType = new Map();

  rows.forEach((payment) => {

    const type = String(payment.payment_type || 'cash').trim().toLowerCase();

    byType.set(type, (byType.get(type) || 0) + Number(payment.amount || 0));

  });



  const typeOrder = ['cash', 'visa_card', 'bank_transfer', 'mobile_money', 'cheque', 'goods', 'down_payment'];

  const lines = [];

  Array.from(byType.keys())

    .sort((left, right) => {

      const leftIndex = typeOrder.indexOf(left);

      const rightIndex = typeOrder.indexOf(right);

      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);

    })

    .forEach((type) => {

      const amount = Number(byType.get(type) || 0);

      if (amount <= 0) return;

      const emoji = getPaymentMethodEmoji(type);

      const label = paymentMethodDisplayName(type);

      lines.push(`${emoji} Total ${label} Paid: ${formatAmount(amount, currency)}`);

    });



  return lines.join('\n');

}



function buildLaybyMessage({

  eventType,

  isQuoteLayby,

  locationName,

  dateTimeIso,

  receiptNumber,

  customerName,

  customerPhone,

  productLines,

  discountAmount,

  summaryTotal,

  payments,

  balanceDue,

  currency,

  laybyClosed,

  editSummary,

  topupRequired,

  previousDueBalance,

  balanceDueDays,

  balanceDueDeadline,

}) {

  const date = formatSaleDateForMessage(dateTimeIso);

  const lines = [];



  if (eventType === 'quote_edit') {

    lines.push(laybyClosed

      ? '✅ *Lay-Buy Closed (Quote Edited)*'

      : '📝 *Quote Edited (Lay-Buy Updated)*');

  } else if (eventType === 'quote_convert' || (isQuoteLayby && !['new_layby', 'payment', 'statement'].includes(eventType))) {

    lines.push('🏭 *Factory Production*');

  } else if (eventType === 'layby_addition') {

    lines.push('➕ *Layby Addition*');

  } else if (eventType === 'new_layby') {

    lines.push('📋 *Layby Created*');

  } else if (eventType === 'payment') {

    lines.push('💵 *Layby Payment*');

  } else if (eventType === 'statement') {

    lines.push('📋 *Layby Statement*');

  } else if (eventType === 'sale') {

    lines.push('✅ *Completed Sale*');

  } else if (eventType === 'reversal') {

    lines.push('🔄 *_REVERSAL_*');

  } else if (eventType === 'replacement') {

    lines.push(topupRequired ? '🔄 *_REPLACEMENT — TOPUP REQUIRED_*' : '🔄 *_REPLACEMENT_*');

  } else if (eventType === 'addition') {

    lines.push(topupRequired ? '➕ *_ADDITION — TOPUP REQUIRED_*' : '➕ *_ADDITION_*');

  }



  pushLine(lines, '📍 Location', locationName);

  pushLine(lines, '📅 Date', date);

  pushLine(lines, '🧾 Receipt', formatReceiptNumberForMessage(receiptNumber));

  pushLine(lines, '👤 Customer Name', customerName);

  pushLine(lines, '📞 Customer Number', customerPhone);

  if (eventType === 'layby_addition') {

    if (previousDueBalance != null && Number(previousDueBalance) >= 0) {

      lines.push('');

      lines.push(`Previous Due Balance: ${formatAmount(previousDueBalance, currency)}`);

    }

    lines.push('');

    lines.push('*New Sale*');

    if (productLines?.length) {

      lines.push('');

      lines.push('🛒 *Products:*');

      lines.push(productLines.join(`\n${PRODUCT_LINE_SEP}\n`));

    }

  } else if (productLines?.length && eventType !== 'statement' && eventType !== 'payment') {

    lines.push('');

    lines.push('🛒 *Products:*');

    lines.push(productLines.join(`\n${PRODUCT_LINE_SEP}\n`));

  }



  if (Number(discountAmount || 0) > 0 && eventType !== 'statement') {

    lines.push('');

    pushLine(lines, 'Discount', formatAmount(discountAmount, currency));

  }



  lines.push('');

  lines.push(`📋 Summary: ${formatAmount(summaryTotal, currency)}`);



  const paidLine = eventType === 'statement'
    ? ''
    : (eventType === 'sale' ? buildSalePaidLines(payments, currency) : buildPaidLine(payments, currency));

  if (paidLine) lines.push(paidLine);



  const normalizedBalanceDue = normalizeBalanceDue(balanceDue, currency);

  if (normalizedBalanceDue > 0) {

    lines.push(`⏳ Balance Due: ${formatAmount(normalizedBalanceDue, currency)}`);

    const allowanceDays = Number(balanceDueDays || 0);
    if (allowanceDays > 0) {
      const deadlineLabel = balanceDueDeadline ? formatSaleDateForMessage(balanceDueDeadline) : '';
      if (deadlineLabel) {
        lines.push(`⏳ Balance completion period: ${allowanceDays} days (by ${deadlineLabel})`);
      } else {
        lines.push(`⏳ Balance completion period: ${allowanceDays} days`);
      }
    }

  } else {

    lines.push("This customer's due balance is fully closed");

  }

  if (eventType === 'sale') {

    lines.push('');

    lines.push('These sale products have been deducted from your inventory. Kindly confirm your inventory.');

  }



  if (Array.isArray(editSummary) && editSummary.length && eventType === 'quote_edit') {

    lines.push('');

    lines.push('📝 *Changes:*');

    editSummary.forEach((line) => lines.push(`• ${String(line || '').trim()}`));

  }



  return lines.join('\n').trim();

}



function buildCashBookDownpaymentMessage({

  dateTimeIso,

  customerName,

  customerPhone,

  currency,

  currentDueBalance,

  paidAmount,

  remainingDueBalance,

}) {

  const lines = [];

  pushLine(lines, '📅 Date', formatSaleDateForMessage(dateTimeIso));

  pushLine(lines, '👤 Customer Name', customerName);

  pushLine(lines, '📞 Customer Number', customerPhone);

  lines.push('');

  lines.push(`📋 Summary: ${formatAmount(currentDueBalance, currency)}`);

  lines.push(`💵 Paid ${formatAmount(paidAmount, currency)}`);

  lines.push(`💵 Remaining Due Balance ${formatAmount(remainingDueBalance, currency)}`);

  return lines.join('\n').trim();

}



function buildCashBookPosSaleMessage({

  onCredit,

  locationName,

  dateTimeIso,

  receiptNumber,

  customerName,

  customerPhone,

  productLines,

  discountAmount,

  summaryTotal,

  payments,

  balanceDue,

  currency,

}) {

  const lines = [];

  lines.push(onCredit ? '🧾 *On Credit*' : '✅ *Completed Sale*');

  pushLine(lines, '📍 Location', locationName);

  pushLine(lines, '📅 Date', formatSaleDateForMessage(dateTimeIso));

  pushLine(lines, '🧾 Receipt', formatReceiptNumberForMessage(receiptNumber));

  pushLine(lines, '👤 Customer Name', customerName);

  pushLine(lines, '📞 Customer Number', customerPhone);

  if (productLines?.length) {

    lines.push('');

    lines.push('🛒 *Products:*');

    lines.push(productLines.join(`\n${PRODUCT_LINE_SEP}\n`));

  }

  if (Number(discountAmount || 0) > 0) {

    lines.push('');

    pushLine(lines, 'Discount', formatAmount(discountAmount, currency));

  }

  lines.push('');

  lines.push(`📋 Summary: ${formatAmount(summaryTotal, currency)}`);

  const paidLine = onCredit

    ? buildPaidLine(payments, currency)

    : buildSalePaidLines(payments, currency);

  if (paidLine) lines.push(paidLine);

  const remaining = normalizeBalanceDue(balanceDue, currency);

  if (onCredit && remaining > 0) {

    lines.push(`💵 Remaining Due Balance ${formatAmount(remaining, currency)}`);

  }

  return lines.join('\n').trim();

}



async function sendMetaWhatsAppMessage({ to, type, payload }) {

  const { accessToken, phoneNumberId, apiVersion } = getMetaWhatsAppConfig();

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const resp = await fetch(url, {

    method: 'POST',

    headers: {

      Authorization: `Bearer ${accessToken}`,

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({

      messaging_product: 'whatsapp',

      recipient_type: 'individual',

      to,

      type,

      ...payload,

    }),

  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {

    const msg = json?.error?.message || `WhatsApp ${type} failed`;

    const err = new Error(msg);

    err.status = 502;

    err.stage = 'whatsapp';

    err.details = json?.error || null;

    throw err;

  }

  return json;

}



function resolveWhapiApiError(json, fallback = 'Whapi request failed') {
  if (!json || typeof json !== 'object') return fallback;
  if (typeof json.error === 'string' && json.error.trim()) return json.error.trim();
  if (json.error?.message) return String(json.error.message).trim();
  if (json.message) return String(json.message).trim();
  return fallback;
}

async function sendWhapiText(to, body) {

  const { token } = getWhapiConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Whapi text timeout')), WHAPI_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch('https://gate.whapi.cloud/messages/text', {

    method: 'POST',

    headers: {

      Authorization: `Bearer ${token}`,

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({ to, body }),
    signal: controller.signal,
  });
  } catch (err) {
    const e = new Error(err?.name === 'AbortError' ? `Whapi text timeout after ${WHAPI_TIMEOUT_MS}ms` : (err?.message || 'Whapi text send failed'));
    e.status = 504;
    e.stage = 'whatsapp';
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {

    const whapiDetail = resolveWhapiApiError(json, 'Whapi text send failed');

    const err = new Error(`Whapi text send failed: ${whapiDetail}`);

    err.status = 502;

    err.stage = 'whatsapp';

    err.details = json || null;

    throw err;

  }

  return json;

}



async function sendWasenderMessage({ to, text, documentUrl, fileName }) {

  const { token } = getWasenderConfig();

  const payload = { to: String(to || '').trim() };

  if (!payload.to) {

    const err = new Error('Wasender recipient missing');

    err.status = 400;

    err.stage = 'whatsapp';

    throw err;

  }

  if (documentUrl) {

    payload.documentUrl = String(documentUrl).trim();

    if (text) payload.text = String(text).slice(0, WHATSAPP_CAPTION_LIMIT);

    if (fileName) payload.fileName = String(fileName).trim();

  } else {

    payload.text = String(text || '').trim().slice(0, WHATSAPP_TEXT_LIMIT);

  }

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(new Error('Wasender message timeout')), WASENDER_TIMEOUT_MS);

  let resp;

  try {

    resp = await fetch(WASENDER_API_URL, {

      method: 'POST',

      headers: {

        Authorization: `Bearer ${token}`,

        'Content-Type': 'application/json',

      },

      body: JSON.stringify(payload),

      signal: controller.signal,

    });

  } catch (err) {

    const e = new Error(err?.name === 'AbortError' ? `Wasender timeout after ${WASENDER_TIMEOUT_MS}ms` : (err?.message || 'Wasender send failed'));

    e.status = 504;

    e.stage = 'whatsapp';

    throw e;

  } finally {

    clearTimeout(timeout);

  }

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {

    const msg = json?.error?.message || json?.message || json?.error || 'Wasender send failed';

    const err = new Error(typeof msg === 'string' ? msg : 'Wasender send failed');

    err.status = 502;

    err.stage = 'whatsapp';

    err.details = json || null;

    throw err;

  }

  return json;

}



async function deliverText(targets, text, mode, provider = 'whapi') {

  const body = String(text || '').trim().slice(0, WHATSAPP_TEXT_LIMIT);

  if (!body || !targets.length) return [];



  const unique = Array.from(new Set(targets));

  const results = [];



  if (provider === 'wasender') {

    return sendWasenderWithPacing(unique, (to) => sendWasenderMessage({ to, text: body }));

  }



  if (provider === 'whapi' || mode === 'group') {

    try {
      for (const to of unique) {

        const response = await sendWhapiText(to, body);

        results.push({ to, messageId: response?.message?.id || response?.id || null });

      }

      return results;
    } catch (whapiErr) {
      if (!canFallbackToWasender()) throw whapiErr;

      return sendWasenderWithPacing(unique, (to) => sendWasenderMessage({ to, text: body }));
    }

  }



  for (const to of unique) {

    const response = await sendMetaWhatsAppMessage({

      to,

      type: 'text',

      payload: { text: { body } },

    });

    results.push({ to, messageId: response?.messages?.[0]?.id || null });

  }

  return results;

}



async function resolveDocumentBuffer(link) {
  const trimmed = String(link || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHAPI_TIMEOUT_MS);
    try {
      const resp = await fetch(trimmed, { signal: controller.signal });
      if (!resp.ok) {
        const err = new Error(`Failed to download PDF (${resp.status})`);
        err.status = 502;
        err.stage = 'download';
        throw err;
      }
      return Buffer.from(await resp.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  const base64 = trimmed.replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '').replace(/\s+/g, '');
  if (!base64) return null;
  return Buffer.from(base64, 'base64');
}

async function resolveWasenderDocumentUrl(link, filename = 'document.pdf') {
  const trimmed = String(link || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const buffer = await resolveDocumentBuffer(trimmed);
  if (!buffer?.length) {
    const err = new Error('Document payload is empty');
    err.status = 400;
    err.stage = 'validate';
    throw err;
  }

  const { uploadPdfAndGetUrl } = await import('../server/lib/firebaseStorage.js');
  const bucket = 'labels';
  const safeName = String(filename || 'document.pdf').replace(/[^\w.\-() ]+/g, '_') || 'document.pdf';
  const path = `whatsapp/${Date.now()}_${safeName}`;

  return uploadPdfAndGetUrl({
    bucket,
    path,
    buffer,
    contentType: 'application/pdf',
    signedSeconds: 3600,
    downloadName: safeName,
  });
}

function whapiDocumentError(json, fallback = 'Whapi document send failed') {
  const whapiDetail = resolveWhapiApiError(json, fallback);
  const err = new Error(`${fallback}: ${whapiDetail}`);
  err.status = 502;
  err.stage = 'whatsapp';
  err.details = json;
  return err;
}

async function sendWhapiDocument({ to, buffer, filename, caption, token }) {
  const safeName = filename || 'document.pdf';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Whapi document timeout')), WHAPI_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append('to', to);
    form.append('filename', safeName);
    form.append('mime_type', 'application/pdf');
    if (caption) form.append('caption', String(caption).slice(0, WHATSAPP_CAPTION_LIMIT));
    form.append('media', new Blob([buffer], { type: 'application/pdf' }), safeName);

    let resp = await fetch('https://gate.whapi.cloud/messages/document', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });

    let json = await resp.json().catch(() => ({}));
    if (resp.ok) return json;

    // JSON/base64 fallback when multipart is rejected.
    resp = await fetch('https://gate.whapi.cloud/messages/document', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        media: buffer.toString('base64'),
        filename: safeName,
        mime_type: 'application/pdf',
        caption: caption ? String(caption).slice(0, WHATSAPP_CAPTION_LIMIT) : undefined,
      }),
      signal: controller.signal,
    });
    json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw whapiDocumentError(json);
    return json;
  } catch (err) {
    if (err?.stage === 'whatsapp') throw err;
    const e = new Error(err?.name === 'AbortError' ? `Whapi document timeout after ${WHAPI_TIMEOUT_MS}ms` : (err?.message || 'Whapi document send failed'));
    e.status = err?.name === 'AbortError' ? 504 : 502;
    e.stage = 'whatsapp';
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}



async function deliverDocument(targets, link, filename, mode, provider = 'whapi', caption = '') {

  if (!link || !targets.length) return [];

  const unique = Array.from(new Set(targets));



  if (provider === 'wasender') {

    const documentUrl = await resolveWasenderDocumentUrl(link, filename || 'document.pdf');

    return sendWasenderWithPacing(unique, (to) => sendWasenderMessage({

      to,

      text: caption,

      documentUrl,

      fileName: filename || 'document.pdf',

    }));

  }



  if (provider === 'whapi' || mode === 'group') {

    const { token } = getWhapiConfig();
    const buffer = await resolveDocumentBuffer(link);
    if (!buffer?.length) {
      const err = new Error('Document payload is empty');
      err.status = 400;
      err.stage = 'validate';
      throw err;
    }

    const results = [];

    try {
      for (const to of unique) {
        const json = await sendWhapiDocument({
          to,
          buffer,
          filename: filename || 'document.pdf',
          caption,
          token,
        });
        results.push({ to, messageId: json?.message?.id || json?.id || null });
      }

      return results;
    } catch (whapiErr) {
      if (!canFallbackToWasender()) throw whapiErr;

      const documentUrl = await resolveWasenderDocumentUrl(link, filename || 'document.pdf');

      return sendWasenderWithPacing(unique, (to) => sendWasenderMessage({

        to,

        text: caption,

        documentUrl,

        fileName: filename || 'document.pdf',

      }));
    }

  }



  const results = [];

  for (const to of unique) {

    const response = await sendMetaWhatsAppMessage({

      to,

      type: 'document',

      payload: { document: { link, filename } },

    });

    results.push({ to, messageId: response?.messages?.[0]?.id || null });

  }

  return results;

}



async function deliverNotification(targets, message, mode, provider = 'whapi', { pdfUrl, pdfFilename } = {}) {

  const body = String(message || '').trim();

  if (!targets.length) return [];

  if (pdfUrl) {

    return deliverDocument(targets, pdfUrl, pdfFilename, mode, provider, body);

  }

  if (!body) return [];

  return deliverText(targets, body, mode, provider);

}



async function handleWhatsAppShopOrder(body) {

  const order = body?.order || body || {};

  const routing = resolveDeliveryTargets('sale', order?.customer_id || null, {

    locationId: LUSAKA_BRANCH_ID,

  });

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_LUSAKA_SALES_GROUP_ID)');

    err.status = 500;

    throw err;

  }



  const customer = order.customer || {};

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'Customer';

  const currencyLabel = String(order.currency || 'K').toUpperCase() === 'USD' ? '$' : 'K';

  const total = Number(order.total_amount || 0);

  const totalFmt = total % 1 === 0 ? total.toLocaleString() : total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemLines = (order.items || []).map((item) => {

    const lineTotal = Number(item.unit_price || 0) * Number(item.quantity || 0);

    const lineFmt = lineTotal % 1 === 0 ? lineTotal.toLocaleString() : lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `• ${item.display_name} × ${item.quantity} — ${currencyLabel} ${lineFmt}`;

  });



  const message = [

    '🛒 *New Online Order — Lusaka*',

    '',

    `👤 ${name}`,

    `📞 ${customer.phone || '—'}`,

    `✉️ ${customer.email || '—'}`,

    `📍 ${[customer.address, customer.city].filter(Boolean).join(', ') || '—'}`,

    '',

    '🧾 *Items:*',

    ...(itemLines.length ? itemLines : ['• (no items)']),

    '',

    `💰 Total: ${currencyLabel} ${totalFmt}`,

    `🆔 Order: ${order.id || '—'}`,

    '',

    '_Status: pending confirmation_',

  ].join('\n');



  const deliveries = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {});

  return { ok: true, deliveries };

}




async function handleWhatsAppSale(body) {

  const isPreview = body?.preview === true || String(body?.preview || '').trim() === '1';

  const saleId = body.saleId;

  if (saleId === undefined || saleId === null || String(saleId).trim() === '') {

    const err = new Error('Missing saleId');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const db = await getDbClient();

  const { data: sale, error: saleErr } = await db

    .from('sales')

    .select('id, customer_id, sale_date, created_at, status, total_amount, discount, currency, receipt_number, layby_id, location_id')

    .eq('id', saleId)

    .maybeSingle();

  if (saleErr || !sale) {

    const err = new Error(saleErr?.message || 'Sale not found');

    err.status = 404;

    err.stage = 'sale';

    throw err;

  }



  if (String(sale.status || '').toLowerCase() === 'layby') {

    const { data: customerForLaybySkip } = await db

      .from('customers')

      .select('name')

      .eq('id', sale.customer_id)

      .maybeSingle();

    if (!isBasyouniCustomer(sale.customer_id, customerForLaybySkip?.name)) {

      if (isPreview) {

        return {

          ok: true,

          preview: true,

          message: 'This sale is marked as layby. The WhatsApp button sends a layby notification instead of a completed-sale receipt.',

          skipped: 'layby',

        };

      }

      return { ok: true, skipped: 'layby' };

    }

  }

  // Fahme accounts must never expose individual POS sale details or receipts
  // in WhatsApp groups. POS sends their consolidated layby statement instead.
  if (isFahmeCustomer(sale.customer_id)) {

    if (isPreview) {

      return {

        ok: true,

        preview: true,

        message: 'Fahme account: WhatsApp sends the consolidated layby statement PDF (no individual sale text message).',

        skipped: 'fahme_layby_pdf_only',

      };

    }

    return { ok: true, skipped: 'fahme_layby_pdf_only' };

  }



  const { data: customer } = await db

    .from('customers')

    .select('name, phone, address, city, tpin, currency')

    .eq('id', sale.customer_id)

    .maybeSingle();

  const pdfUrl = String(body.pdfUrl || '').trim();

  const customerNameForFile = String(customer?.name || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').trim() || 'Customer';
  const pdfFilename = String(body.pdfFilename || '').trim() || `${customerNameForFile}_Sales_Receipt.pdf`;

  const isWebSale = String(body.channel || '').trim().toLowerCase() === 'web';



  const { data: itemsRows } = await db

    .from('sales_items')

    .select('display_name, product_id, quantity, unit_price, currency, color, sale_id')

    .eq('sale_id', sale.id);

  const items = Array.isArray(itemsRows) ? itemsRows : [];



  const { data: payRows } = await db

    .from('sales_payments')

    .select('amount, payment_type, payment_date, reference, notes, currency')

    .eq('sale_id', sale.id)

    .order('payment_date', { ascending: true });

  const payments = Array.isArray(payRows) ? payRows : [];



  let locationName = '';

  if (sale.location_id) {

    const { data: loc } = await db

      .from('locations')

      .select('name')

      .eq('id', sale.location_id)

      .maybeSingle();

    locationName = loc?.name || '';

  }



  const currency = normalizeCurrency(sale.currency || customer?.currency || 'K');

  const productMap = await loadProductPriceMap(db, items);

  const locationPriceMap = await loadProductLocationPriceMap(db, items, sale.location_id);

  const summaryTotal = Number(sale.total_amount || 0);

  const discountAmount = Number(sale.discount || 0);

  const productLines = buildProductLines(items, currency, productMap, {

    saleId: sale.id,

    locationPriceMap,

    saleTotal: summaryTotal,

    saleDiscount: discountAmount,

  });

  const balanceDue = Math.max(0, summaryTotal - payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));

  const customerName = customer?.name || '';

  const basyouni = isBasyouniCustomer(sale.customer_id, customerName);

  const message = basyouni

    ? buildCashBookPosSaleMessage({

      onCredit: balanceDue > 0.009,

      locationName,

      dateTimeIso: sale.sale_date || sale.created_at,

      receiptNumber: sale.receipt_number,

      customerName: customer?.name,

      customerPhone: customer?.phone,

      productLines,

      discountAmount,

      summaryTotal,

      payments,

      balanceDue,

      currency,

    })

    : buildLaybyMessage({

      eventType: 'sale',

      isQuoteLayby: false,

      locationName,

      dateTimeIso: sale.sale_date || sale.created_at,

      receiptNumber: sale.receipt_number,

      customerName: customer?.name,

      customerPhone: customer?.phone,

      productLines,

      discountAmount,

      summaryTotal,

      payments,

      balanceDue: 0,

      currency,

    });

  const finalMessage = isWebSale
    ? ['🛒 *Online shop order — payment received*', '', message].join('\n')
    : message;



  if (isPreview) {

    return {

      ok: true,

      preview: true,

      message: finalMessage,

      attachmentNote: 'Sales receipt PDF will be attached when sent.',

    };

  }



  const routing = basyouni

    ? resolveCustomerWhatsAppRouting('sale', sale.customer_id, customerName, { locationId: sale.location_id })

    : resolveDeliveryTargets('sale', sale.customer_id, { locationId: sale.location_id });

  if (!routing.targets.length) {

    const err = new Error(
      basyouni
        ? 'WhatsApp env not configured (WHATSAPP_LEDGER_GROUP_ID + WASENDER_API_TOKEN or WHATSAPP_API_TOKEN)'
        : (String(sale.location_id) === LUSAKA_BRANCH_ID
          ? 'WhatsApp env not configured (WHATSAPP_LUSAKA_SALES_GROUP_ID + WASENDER_API_TOKEN or WHATSAPP_API_TOKEN)'
          : 'WhatsApp env not configured (WHATSAPP_SALES_GROUP_ID + WASENDER_API_TOKEN or WHATSAPP_API_TOKEN)'),
    );

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const deliveries = await deliverNotification(routing.targets, finalMessage, routing.mode, routing.provider, {

    pdfUrl,

    pdfFilename,

  });

  return { ok: true, deliveries };
}



async function handleWhatsAppAdjustment(body) {

  const saleId = body.saleId;

  const eventType = String(body.eventType || body.operation || 'reversal').trim().toLowerCase();

  const topupRequired = Boolean(body.topupRequired);

  if (saleId === undefined || saleId === null || String(saleId).trim() === '') {

    const err = new Error('Missing saleId');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const db = await getDbClient();

  const { data: sale, error: saleErr } = await db

    .from('sales')

    .select('id, customer_id, sale_date, created_at, status, total_amount, discount, currency, receipt_number, layby_id, location_id')

    .eq('id', saleId)

    .maybeSingle();

  if (saleErr || !sale) {

    const err = new Error(saleErr?.message || 'Sale not found');

    err.status = 404;

    err.stage = 'sale';

    throw err;

  }



  if (isFahmeCustomer(sale.customer_id)) {

    return { ok: true, skipped: 'fahme_layby_pdf_only' };

  }



  const routing = resolveDeliveryTargets('sale', sale.customer_id, { locationId: sale.location_id });

  if (!routing.targets.length) {

    const err = new Error(
      String(sale.location_id) === LUSAKA_BRANCH_ID
        ? 'WhatsApp env not configured (WHATSAPP_LUSAKA_SALES_GROUP_ID + WASENDER_API_TOKEN or WHATSAPP_API_TOKEN)'
        : 'WhatsApp env not configured (WHATSAPP_SALES_GROUP_ID + WASENDER_API_TOKEN or WHATSAPP_API_TOKEN)',
    );

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const { data: customer } = await db

    .from('customers')

    .select('name, phone, address, city, tpin, currency')

    .eq('id', sale.customer_id)

    .maybeSingle();



  const { data: itemsRows } = await db

    .from('sales_items')

    .select('display_name, product_id, quantity, unit_price, currency, color, sale_id')

    .eq('sale_id', sale.id);

  const items = Array.isArray(itemsRows) ? itemsRows : [];



  let saleIds = [sale.id];

  if (sale.layby_id) {

    const { data: linkedSales } = await db

      .from('sales')

      .select('id')

      .eq('layby_id', sale.layby_id);

    const linkedIds = (linkedSales || []).map((row) => row.id).filter((value) => value != null);

    if (linkedIds.length) saleIds = linkedIds;

  }



  const { data: payRows } = await db

    .from('sales_payments')

    .select('amount, payment_type, payment_date, reference, notes, currency')

    .in('sale_id', saleIds)

    .order('payment_date', { ascending: true });

  const payments = (payRows || []).filter((p) => String(p.payment_type || '').toLowerCase() !== 'credit');



  let locationName = '';

  if (sale.location_id) {

    const { data: loc } = await db

      .from('locations')

      .select('name')

      .eq('id', sale.location_id)

      .maybeSingle();

    locationName = loc?.name || '';

  }



  const currency = normalizeCurrency(sale.currency || customer?.currency || 'K');

  const productMap = await loadProductPriceMap(db, items);

  const locationPriceMap = await loadProductLocationPriceMap(db, items, sale.location_id);

  const summaryTotal = Number(sale.total_amount || 0);

  const discountAmount = Number(sale.discount || 0);

  const productLines = buildProductLines(items, currency, productMap, {

    saleId: sale.id,

    locationPriceMap,

    saleTotal: summaryTotal,

    saleDiscount: discountAmount,

  });

  const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const balanceDue = Math.max(0, summaryTotal - paidTotal);



  const message = buildLaybyMessage({

    eventType,

    isQuoteLayby: false,

    locationName,

    dateTimeIso: sale.sale_date || sale.created_at,

    receiptNumber: sale.receipt_number,

    customerName: customer?.name,

    customerPhone: customer?.phone,

    productLines,

    discountAmount,

    summaryTotal,

    payments,

    balanceDue,

    currency,

    topupRequired,

  });



  const deliveries = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {});

  return { ok: true, deliveries };

}



async function tryResolveStoredLaybyPdfUrl(laybyId, customerId, filename = 'layby-statement.pdf') {
  const candidates = [
    `laybys/${String(laybyId || '').trim()}.pdf`,
    `laybys/${String(customerId || '').trim()}.pdf`,
  ].filter((path) => path !== 'laybys/.pdf');

  try {
    const { getStorageClient } = await import('../server/lib/firebaseStorage.js');
    const storage = getStorageClient();
    for (const bucket of ['laybypdfs', 'labels']) {
      for (const objectPath of candidates) {
        try {
          const { data, error } = await storage
            .from(bucket)
            .createSignedUrl(objectPath, 3600, { download: filename });
          if (!error && data?.signedUrl) return data.signedUrl;
        } catch {
          // try next path/bucket
        }
      }
    }
  } catch {
    // storage not configured
  }
  return '';
}



async function handleWhatsAppLayby(body) {

  const isPreview = body?.preview === true || String(body?.preview || '').trim() === '1';

  const laybyId = String(body.laybyId || '').trim();

  const eventType = String(body.eventType || '').trim() || 'layby_update';

  const focusSaleId = body.saleId;

  const pdfUrl = String(body.pdfUrl || '').trim();

  const laybyClosed = Boolean(body.laybyClosed);

  const editSummary = Array.isArray(body.editSummary)
    ? body.editSummary.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

  const pdfFilename = String(body.pdfFilename || '').trim() || 'layby-statement.pdf';
  const pdfBase64 = String(body.pdfBase64 || '')
    .replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '')
    .replace(/\s+/g, '');
  let pdfLink = pdfUrl || pdfBase64;

  if (!laybyId) {

    const err = new Error('Missing laybyId');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const db = await getDbClient();

  const { data: layby, error: laybyErr } = await db

    .from('laybys')

    .select('id, customer_id, total_amount, paid_amount, status, sale_id, created_at, updated_at, balance_due_days, balance_due_deadline')

    .eq('id', laybyId)

    .maybeSingle();

  if (laybyErr || !layby) {

    const err = new Error(laybyErr?.message || 'Layby not found');

    err.status = 404;

    err.stage = 'layby';

    throw err;

  }



  const { data: customer } = await db

    .from('customers')

    .select('name, phone, address, city, tpin, currency')

    .eq('id', layby.customer_id)

    .maybeSingle();



  const sales = await loadLaybySalesForNotify(db, layby, focusSaleId);

  const saleIds = sales.map((sale) => sale.id).filter((value) => value != null);

  if (!saleIds.length && layby.sale_id) saleIds.push(layby.sale_id);



  let isQuoteLayby = eventType === 'quote_convert';

  if (!isQuoteLayby && saleIds.length) {

    const { data: qRows } = await db

      .from('quotations')

      .select('id')

      .in('sale_id', saleIds)

      .limit(1);

    isQuoteLayby = Array.isArray(qRows) && qRows.length > 0;

  }



  const focusSale = pickFocusSale(sales, focusSaleId || layby.sale_id);

  const currency = normalizeCurrency(focusSale?.currency || sales[0]?.currency || customer?.currency || 'K');



  let locationName = '';

  const locationId = focusSale?.location_id || sales[0]?.location_id;

  if (locationId) {

    const { data: loc } = await db

      .from('locations')

      .select('name')

      .eq('id', locationId)

      .maybeSingle();

    locationName = loc?.name || '';

  }



  let payments = [];

  if (saleIds.length) {

    const [{ data: payRows }, { data: laybyPayRows }] = await Promise.all([
      db
        .from('sales_payments')
        .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes')
        .in('sale_id', saleIds)
        .order('payment_date', { ascending: true }),
      db
        .from('layby_payments')
        .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes')
        .in('sale_id', saleIds)
        .order('payment_date', { ascending: true }),
    ]);

    payments = dedupeLaybyPaymentRows([...(payRows || []), ...(laybyPayRows || [])]);

  }



  const focusSalePayments = focusSale

    ? payments.filter((payment) => String(payment.sale_id) === String(focusSale.id))

    : payments;



  let eventPayments = focusSalePayments;

  if (eventType === 'payment' && payments.length) {

    const latest = payments[payments.length - 1];

    eventPayments = latest ? [latest] : [];

  } else if (eventType === 'statement') {

    eventPayments = [];

  }



  const { data: itemRows } = saleIds.length

    ? await db

        .from('sales_items')

        .select('sale_id, display_name, product_id, quantity, unit_price, color')

        .in('sale_id', saleIds)

    : { data: [] };

  const items = Array.isArray(itemRows) ? itemRows : [];

  const productMap = await loadProductPriceMap(db, items);

  const pricingLocationId = focusSale?.location_id || sales[0]?.location_id || null;

  const locationPriceMap = await loadProductLocationPriceMap(db, items, pricingLocationId);



  const itemScopeSaleId = (eventType === 'new_layby' || eventType === 'quote_convert' || eventType === 'layby_addition') && focusSale

    ? focusSale.id

    : null;



  const laybyTotal = Number(layby.total_amount || 0) > 0

    ? Number(layby.total_amount || 0)

    : sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);

  const summaryTotal = eventType === 'statement'
    ? laybyTotal
    : (Number(focusSale?.total_amount || 0) > 0 ? Number(focusSale.total_amount) : laybyTotal);

  const discountAmount = Number(focusSale?.discount || 0);

  const productLines = buildProductLines(items, currency, productMap, {

    saleId: itemScopeSaleId,

    locationPriceMap,

    saleTotal: summaryTotal,

    saleDiscount: discountAmount,

  });



  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const totalDiscount = payments.reduce((sum, payment) => sum + Number(payment.discount_amount || 0), 0);

  const paidOnFocus = focusSalePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);



  let previousDueBalance = null;

  let balanceDue = Math.max(0, laybyTotal - totalPaid - totalDiscount);

  if (eventType === 'layby_addition' && focusSale) {

    const additionBalances = computeLaybyAdditionBalances(sales, payments, focusSale.id);

    previousDueBalance = additionBalances.previousDueBalance;

    balanceDue = additionBalances.balanceDue;

  } else if (eventType === 'new_layby' || eventType === 'quote_convert') {

    balanceDue = Math.max(0, summaryTotal - paidOnFocus);

  }

  const effectiveLaybyClosed = laybyClosed
    || (eventType === 'quote_edit' && isBalanceEffectivelyClosed(balanceDue, currency));

  balanceDue = normalizeBalanceDue(balanceDue, currency);



  const customerName = customer?.name || '';

  const basyouni = isBasyouniCustomer(layby.customer_id, customerName);

  const fahme = isFahmeCustomer(layby.customer_id);

  const compactPayment = eventType === 'payment'

    && usesCompactDownpaymentWhatsApp(layby.customer_id, customerName);

  const cashBookLaybySale = basyouni

    && ['new_layby', 'layby_addition', 'quote_convert'].includes(eventType);

  const messageDateIso = resolveMessageDateIso({

    sale: focusSale,

    payments: eventPayments,

    eventType,

    fallbackIso: layby.updated_at || layby.created_at,

  });



  let message = '';

  if (compactPayment) {

    const paidAmount = eventPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const paidDiscount = eventPayments.reduce((sum, payment) => sum + Number(payment.discount_amount || 0), 0);

    const applied = paidAmount + paidDiscount;

    const remaining = balanceDue;

    message = buildCashBookDownpaymentMessage({

      dateTimeIso: messageDateIso,

      customerName: customer?.name,

      customerPhone: customer?.phone,

      currency,

      currentDueBalance: remaining + applied,

      paidAmount: applied,

      remainingDueBalance: remaining,

    });

  } else if (cashBookLaybySale) {

    message = buildCashBookPosSaleMessage({

      onCredit: true,

      locationName,

      dateTimeIso: messageDateIso,

      receiptNumber: focusSale?.receipt_number || sales.map((sale) => sale.receipt_number).filter(Boolean).join(', '),

      customerName: customer?.name,

      customerPhone: customer?.phone,

      productLines,

      discountAmount,

      summaryTotal,

      payments: eventPayments,

      balanceDue,

      currency,

    });

  } else if (!fahme) {

    message = buildLaybyMessage({

      eventType,

      isQuoteLayby,

      locationName,

      dateTimeIso: messageDateIso,

      receiptNumber: focusSale?.receipt_number || sales.map((sale) => sale.receipt_number).filter(Boolean).join(', '),

      customerName: customer?.name,

      customerPhone: customer?.phone,

      productLines,

      discountAmount,

      summaryTotal,

      payments: eventPayments,

      balanceDue,

      currency,

      laybyClosed: effectiveLaybyClosed,

      editSummary,

      previousDueBalance,

      balanceDueDays: parseBalanceDueDays(layby.balance_due_days),

      balanceDueDeadline: layby.balance_due_deadline

        || computeBalanceDueDeadline(layby.created_at, layby.balance_due_days),

    });

  }

  const routingLocationId = focusSale?.location_id
    || (body.locationId != null ? String(body.locationId).trim() : '')
    || null;

  const routing = resolveCustomerWhatsAppRouting('layby', layby.customer_id, customerName, {
    locationId: routingLocationId,
  });

  if (!isPreview && !routing.targets.length) {
    const wantsFahme = isFahmeCustomer(layby.customer_id);
    const missingHint = basyouni
      ? 'Set WHATSAPP_LEDGER_GROUP_ID=120363246815974105@g.us in Vercel, then Redeploy'
      : (wantsFahme
        ? 'Set WHATSAPP_FAHME_GROUP_ID=120363372527723284@g.us in Vercel, keep WHATSAPP_WASENDER_KINDS=sale,layby, then Redeploy'
        : (routingLocationId === LUSAKA_BRANCH_ID
          ? 'Set WHATSAPP_LUSAKA_SALES_GROUP_ID for Lusaka laybys in Vercel, then Redeploy'
          : 'Set WHATSAPP_LAYBY_GROUP_ID (or WHATSAPP_LAYBY_RECIPIENTS) in Vercel, then Redeploy'));
    const err = new Error(`WhatsApp env not configured for ${basyouni ? 'Basyouni cash book' : wantsFahme ? 'Fahme' : 'layby'} (${missingHint})`);
    err.status = 500;
    err.stage = 'env';
    throw err;
  }

  if (fahme && eventType !== 'payment' && !pdfLink && !isPreview) {
    pdfLink = await tryResolveStoredLaybyPdfUrl(layby.id, layby.customer_id, pdfFilename);
  }

  if (fahme && eventType !== 'payment' && !pdfLink && !isPreview) {

    const err = new Error('Fahme WhatsApp notifications require the layby PDF');

    err.status = 400;

    err.stage = 'pdf';

    throw err;

  }



  if (isPreview) {

    const attachmentNote = isFahmeCustomer(layby.customer_id) || eventType === 'statement'
      ? 'Layby statement PDF will be attached when sent.'
      : (pdfUrl ? `PDF attached: ${pdfFilename}` : '');

    const previewMessage = [message, attachmentNote].filter(Boolean).join('\n\n');

    return {

      ok: true,

      preview: true,

      message: previewMessage || attachmentNote || '(No text body — PDF only)',

      attachmentNote,

    };

  }



  const deliveries = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {

    pdfUrl: pdfLink,

    pdfFilename,

  });



  return { ok: true, deliveries, pdfAttached: Boolean(pdfLink) };

}



function resolveLabelsTargets() {
  const provider = getConfiguredProviderForKind('labels');

  if (provider === 'meta') {
    const recipients = readRecipients('labels');
    return recipients.length
      ? { mode: 'dm', targets: recipients, provider }
      : { mode: 'none', targets: [], provider };
  }

  const groupId = readGroupId('labels') || DOCUMENTED_WHATSAPP_GROUP_IDS.labels;
  return groupId
    ? { mode: 'group', targets: [groupId], provider }
    : { mode: 'none', targets: [], provider };
}



function resolveLusakaTransferTargets(body = {}) {
  const explicitGroup = String(body.groupId || '').trim();
  if (explicitGroup) {
    const provider = getConfiguredProviderForKind('transfer');
    return provider === 'meta'
      ? { mode: 'none', targets: [], provider }
      : { mode: 'group', targets: [explicitGroup], provider };
  }

  const provider = getConfiguredProviderForKind('transfer');
  if (provider === 'meta') {
    const recipients = readRecipients('transfer');
    return recipients.length
      ? { mode: 'dm', targets: recipients, provider }
      : { mode: 'none', targets: [], provider };
  }

  const groupId = readGroupId('lusakaTransfer') || readGroupId('transfer');
  return groupId
    ? { mode: 'group', targets: [groupId], provider }
    : { mode: 'none', targets: [], provider };
}



async function handleWhatsAppLusakaTransfer(body) {

  const pdfUrl = String(body.pdfUrl || '').trim();

  if (!pdfUrl) {

    const err = new Error('Missing pdfUrl');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const routing = resolveLusakaTransferTargets(body);

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured for Lusaka transfers. Set WHATSAPP_LUSAKA_TRANSFER_GROUP_ID (or WHATSAPP_TRANSFER_GROUP_ID) and WASENDER_API_TOKEN.');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const filename = String(body.pdfFilename || 'Lusaka_Transfer.pdf').trim() || 'Lusaka_Transfer.pdf';

  const caption = String(body.message || 'Lusaka transfer').trim().slice(0, WHATSAPP_CAPTION_LIMIT);

  const deliveries = await deliverDocument(routing.targets, pdfUrl, filename, routing.mode, routing.provider, caption);

  return { ok: true, deliveries };

}



async function handleWhatsAppLabels(body) {

  const pdfUrl = String(body.pdfUrl || '').trim();
  const pdfBase64 = String(body.pdfBase64 || '')
    .replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '')
    .replace(/\s+/g, '');
  const documentLink = pdfUrl || pdfBase64;

  if (!documentLink) {

    const err = new Error('Missing pdfUrl or pdfBase64');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const routing = resolveLabelsTargets();

  if (!routing.targets.length) {
    const err = new Error('WhatsApp env not configured for price labels. Set WASENDER_API_TOKEN and WHATSAPP_LABELS_GROUP_ID in .env.local / Vercel.');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const filename = String(body.pdfFilename || 'Price_Labels.pdf').trim() || 'Price_Labels.pdf';

  const caption = String(body.message || 'Price labels').trim().slice(0, WHATSAPP_CAPTION_LIMIT);

  const deliveries = await deliverDocument(routing.targets, documentLink, filename, routing.mode, routing.provider, caption);

  return { ok: true, deliveries };

}



async function handleWhatsAppTransfer(body) {

  const rawMessage = String(body.message || '').trim();

  if (!rawMessage) {

    const err = new Error('Missing message');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const routing = resolveDeliveryTargets('transfer', null);

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_TRANSFER_GROUP_ID or WHATSAPP_TRANSFER_RECIPIENTS)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const message = rawMessage.slice(0, WHATSAPP_TEXT_LIMIT);

  const deliveries = await deliverText(routing.targets, message, routing.mode, routing.provider);

  return {

    ok: true,

    deliveries,

    truncated: rawMessage.length > WHATSAPP_TEXT_LIMIT,

  };

}



function formatLedgerUsd(amount) {

  const n = Number(amount || 0);

  const abs = Math.abs(n);

  const formatted = abs % 1 === 0

    ? abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

    : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `${n < 0 ? '-$ ' : '$ '}${formatted}`;

}



function formatLedgerDate(value) {

  const raw = String(value || '').trim();

  if (!raw) return '—';

  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return `${String(match[3]).padStart(2, '0')}/${Number(match[2])}/${match[1]}`;
  }

  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${String(match[1]).padStart(2, '0')}/${Number(match[2])}/${match[3]}`;
  }

  const d = new Date(raw);

  if (Number.isNaN(d.getTime())) return raw;

  return `${String(d.getDate()).padStart(2, '0')}/${d.getMonth() + 1}/${d.getFullYear()}`;

}



function buildLedgerWhatsAppMessage(body = {}) {

  const direction = String(body.direction || '').toLowerCase();

  const isDeposit = direction === 'credit';

  const typeLabel = isDeposit ? 'Paid In' : 'Paid Out';

  const header = `*Ledger — ${typeLabel}*`;

  const entryDate = formatLedgerDate(body.entryDate || body.createdAt || body.created_at);

  const personName = String(body.personName || body.person_name || '').trim() || '—';

  const reason = String(body.reason || '').trim();

  const amount = formatLedgerUsd(body.amount);

  const previousBalance = formatLedgerUsd(body.previousBalance);

  const newBalance = formatLedgerUsd(body.newBalance);

  const lines = [

    header,

    `Type: ${typeLabel}`,

    `Date: ${entryDate}`,

    '',

    `Previous balance: ${previousBalance}`,

    '',

    personName,

    amount,

  ];

  if (reason && reason !== '—') {
    lines.push(`"${reason}"`);
  }

  lines.push('', `New balance: ${newBalance}`);

  return lines.join('\n');

}



function buildLedgerPeriodCloseCaption(body = {}) {
  const periodLabel = String(body.periodLabel || 'Period').trim();
  const dateFrom = formatLedgerDate(body.dateFrom);
  const dateTo = formatLedgerDate(body.dateTo);
  const closingBalance = formatLedgerUsd(body.closingBalance);
  const lines = [
    '*Ledger — Period closed*',
    periodLabel,
  ];
  if (dateFrom && dateTo && dateFrom !== '—' && dateTo !== '—') {
    lines.push(`${dateFrom} – ${dateTo}`);
  } else if (dateFrom && dateFrom !== '—') {
    lines.push(`From ${dateFrom}`);
  } else if (dateTo && dateTo !== '—') {
    lines.push(`To ${dateTo}`);
  }
  lines.push('', `Closing balance: ${closingBalance}`, '', 'Statement attached.');
  return lines.join('\n');
}



async function handleWhatsAppLedger(body) {

  const preview = Boolean(body.preview);
  const pdfUrl = String(body.pdfUrl || '').trim();
  const pdfBase64 = String(body.pdfBase64 || '')
    .replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '')
    .replace(/\s+/g, '');
  const documentLink = pdfUrl || pdfBase64;
  const periodClose = Boolean(body.periodClose);

  if (periodClose && documentLink) {
    const caption = buildLedgerPeriodCloseCaption(body);
    if (preview) {
      return { ok: true, message: caption, preview: true };
    }

    const routing = resolveDeliveryTargets('ledger', null);
    if (!routing.targets.length) {
      const err = new Error('WhatsApp env not configured (WHATSAPP_LEDGER_GROUP_ID or WHATSAPP_LEDGER_RECIPIENTS)');
      err.status = 500;
      err.stage = 'env';
      throw err;
    }

    const filename = String(body.pdfFilename || 'Ledger_Period_Statement.pdf').trim() || 'Ledger_Period_Statement.pdf';
    const deliveries = await deliverDocument(
      routing.targets,
      documentLink,
      filename,
      routing.mode,
      routing.provider,
      caption,
    );
    return { ok: true, deliveries, message: caption };
  }

  const message = buildLedgerWhatsAppMessage(body);

  if (preview) {

    return { ok: true, message, preview: true };

  }



  const routing = resolveDeliveryTargets('ledger', null);

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_LEDGER_GROUP_ID or WHATSAPP_LEDGER_RECIPIENTS)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const deliveries = await deliverText(routing.targets, message.slice(0, WHATSAPP_TEXT_LIMIT), routing.mode, routing.provider);

  return { ok: true, deliveries, message };

}



function assertCronAuthorized(req) {

  const secret = String(process.env.CRON_SECRET || '').trim();

  if (!secret) return true;

  const auth = String(req.headers?.authorization || req.headers?.Authorization || '');

  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearer === secret;

}



function resolveMonthlyBalanceTargets() {

  const monthlyGroup = readGroupId('monthlyBalance') || readGroupId('layby');

  const provider = getConfiguredProviderForKind('layby');

  if (!monthlyGroup) {

    return { mode: 'none', targets: [], provider };

  }

  return { mode: 'group', targets: [monthlyGroup], provider };

}



function isTruthyForce(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}



async function handleMonthlyBalanceSend(body) {
  const messages = Array.isArray(body?.messages)
    ? body.messages.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  const single = String(body?.text || '').trim();
  const out = messages.length ? messages : (single ? [single] : []);
  if (!out.length) {
    const err = new Error('Missing message text');
    err.status = 400;
    err.stage = 'validate';
    throw err;
  }

  const routing = resolveMonthlyBalanceTargets();
  if (!routing.targets.length) {
    const err = new Error('WhatsApp env not configured (WHATSAPP_MONTHLY_BALANCE_GROUP_ID or WHATSAPP_LAYBY_GROUP_ID)');
    err.status = 500;
    err.stage = 'env';
    throw err;
  }

  const deliveries = [];
  for (const message of out) {
    const batch = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {});
    deliveries.push(...batch);
  }

  return {
    ok: true,
    messageCount: out.length,
    deliveries,
  };
}



async function handleLaybyOverdueReminders(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const force = isTruthyForce(req.query?.force) || isTruthyForce(body.force);

  const {
    fetchLaybysNeedingOverdueReminder,
    buildLaybyOverdueReminderMessages,
  } = await import('../server/lib/laybyOverdueReminders.js');

  if (!force && !assertCronAuthorized(req)) {
    const err = new Error('Unauthorized cron request');
    err.status = 401;
    err.stage = 'auth';
    throw err;
  }

  const db = await getDbClient();
  let rows = [];
  try {
    rows = await fetchLaybysNeedingOverdueReminder(db);
  } catch (error) {
    const err = new Error(error?.message || 'Failed to load overdue laybys');
    err.status = 500;
    err.stage = 'laybys';
    throw err;
  }

  if (!rows.length) {
    return { ok: true, skipped: 'no_overdue_laybys', reminderCount: 0 };
  }

  const messages = buildLaybyOverdueReminderMessages(rows);
  const routing = resolveDeliveryTargets('layby', null);
  if (!routing.targets.length) {
    const err = new Error('WhatsApp env not configured (WHATSAPP_LAYBY_GROUP_ID or WHATSAPP_LAYBY_RECIPIENTS)');
    err.status = 500;
    err.stage = 'env';
    throw err;
  }

  const deliveries = [];
  for (const message of messages) {
    const batch = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {});
    deliveries.push(...batch);
  }

  const remindedAt = new Date().toISOString();
  for (const row of rows) {
    try {
      await db
        .from('laybys')
        .update({ last_overdue_reminder_at: remindedAt, updated_at: remindedAt })
        .eq('id', row.laybyId);
    } catch (error) {
      console.warn('Failed to update layby overdue reminder timestamp', row.laybyId, error?.message || error);
    }
  }

  return {
    ok: true,
    reminderCount: rows.length,
    messageCount: messages.length,
    deliveries,
  };
}



async function handleMonthlyBalanceDues(req) {

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const force = isTruthyForce(req.query?.force) || isTruthyForce(body.force);

  const {

    fetchCustomersWithBalanceDue,

    buildMonthlyBalanceDueMessages,

    isScheduledMonthlyRunDay,

  } = await import('../server/lib/monthlyBalanceDues.js');

  if (!force && !isScheduledMonthlyRunDay()) {

    return { ok: true, skipped: 'not_scheduled_day', message: 'Runs on the 30th only (Africa/Lusaka). Pass force=1 to test.' };

  }

  if (!force && !assertCronAuthorized(req)) {

    const err = new Error('Unauthorized cron request');

    err.status = 401;

    err.stage = 'auth';

    throw err;

  }



  const db = await getDbClient();

  let rows = [];
  try {
    rows = await fetchCustomersWithBalanceDue(db);
  } catch (error) {
    const err = new Error(error?.message || 'Failed to load customer balances');
    err.status = 500;
    err.stage = 'balances';
    throw err;
  }

  const messages = buildMonthlyBalanceDueMessages(rows);

  const routing = resolveMonthlyBalanceTargets();

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_MONTHLY_BALANCE_GROUP_ID or WHATSAPP_LAYBY_GROUP_ID)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const deliveries = [];

  for (const message of messages) {

    const batch = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {});

    deliveries.push(...batch);

  }



  return {

    ok: true,

    customerCount: rows.length,

    messageCount: messages.length,

    deliveries,

  };

}



export default async function handler(req, res) {

  setCors(res);



  if (req.method === 'OPTIONS') {

    res.status(204).end();

    return;

  }

  const actionEarly = resolveAction(req);

  const isMonthlyCron = actionEarly === 'monthly-balance-dues' || actionEarly === 'monthly_balance_dues';
  const isLaybyOverdueCron = actionEarly === 'layby-overdue-reminders' || actionEarly === 'layby_overdue_reminders';



  if (req.method !== 'POST' && !(req.method === 'GET' && (isMonthlyCron || isLaybyOverdueCron))) {

    res.setHeader('Allow', 'POST, GET, OPTIONS');

    res.status(405).json({ ok: false, stage: 'method', error: 'Method Not Allowed' });

    return;

  }



  try {

    const action = resolveAction(req);

    const body = req.body || {};



    if (action === 'whatsapp-sale' || action === 'sale') {

      const payload = await handleWhatsAppSale(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-adjustment' || action === 'adjustment') {

      const payload = await handleWhatsAppAdjustment(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-layby' || action === 'layby') {

      const payload = await handleWhatsAppLayby(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-transfer' || action === 'transfer') {

      const payload = await handleWhatsAppTransfer(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-ledger' || action === 'ledger') {

      const payload = await handleWhatsAppLedger(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-labels' || action === 'labels') {

      const payload = await handleWhatsAppLabels(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-lusaka-transfer' || action === 'lusaka-transfer') {

      const payload = await handleWhatsAppLusakaTransfer(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'whatsapp-shop-order' || action === 'shop-order') {

      const payload = await handleWhatsAppShopOrder(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'monthly-balance-dues' || action === 'monthly_balance_dues') {

      const payload = await handleMonthlyBalanceDues(req);

      res.status(200).json(payload);

      return;

    }



    if (action === 'monthly-balance-send' || action === 'monthly_balance_send') {

      const payload = await handleMonthlyBalanceSend(body);

      res.status(200).json(payload);

      return;

    }



    if (action === 'layby-overdue-reminders' || action === 'layby_overdue_reminders') {

      const payload = await handleLaybyOverdueReminders(req);

      res.status(200).json(payload);

      return;

    }



    res.status(400).json({ ok: false, stage: 'validate', error: 'Unknown action' });

  } catch (error) {

    const status = error?.status || 500;

    const stage = error?.stage || 'unhandled';

    res.status(status).json({

      ok: false,

      stage,

      error: error?.message || String(error || 'Unknown error'),

      details: error?.details || null,

    });

  }

};

