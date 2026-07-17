// Consolidated notifications serverless API (WasenderApi / Whapi.Cloud groups or Meta Cloud API).



const { createClient } = require('@supabase/supabase-js');



const WHATSAPP_TEXT_LIMIT = 4096;
const WHAPI_TIMEOUT_MS = Number(process.env.WHAPI_TIMEOUT_MS || 20000);
const WASENDER_API_URL = String(process.env.WASENDER_API_URL || 'https://www.wasenderapi.com/api/send-message').trim();
const WASENDER_TIMEOUT_MS = Number(process.env.WASENDER_TIMEOUT_MS || WHAPI_TIMEOUT_MS);



const FAHME_CUSTOMER_IDS = new Set([

  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',

  'efb21cad-1a8d-4d64-9487-51e816fcb429',

]);



const RECIPIENT_KEYS = {

  layby: ['WHATSAPP_LAYBY_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  sale: ['WHATSAPP_SALES_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  transfer: ['WHATSAPP_TRANSFER_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

  labels: ['WHATSAPP_LABELS_RECIPIENTS', 'WHATSAPP_RECIPIENTS'],

};



const GROUP_KEYS = {

  layby: 'WHATSAPP_LAYBY_GROUP_ID',

  sale: 'WHATSAPP_SALES_GROUP_ID',

  fahme: 'WHATSAPP_FAHME_GROUP_ID',

  transfer: 'WHATSAPP_TRANSFER_GROUP_ID',

  labels: 'WHATSAPP_LABELS_GROUP_ID',

};



const normalizeCurrency = (raw) => {

  const val = String(raw || '').trim().toUpperCase();

  if (val === '$' || val === 'USD') return 'USD';

  if (val === 'K' || val === 'ZMW') return 'K';

  return val || 'K';

};



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

function parseWasenderKinds() {
  const raw = String(process.env.WHATSAPP_WASENDER_KINDS || '').trim().toLowerCase();
  if (raw === 'all') return ['sale', 'layby', 'transfer', 'labels'];
  if (raw) {
    return raw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  }
  const provider = String(process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  if (provider === 'wasender' || provider === 'wasenderapi') return ['sale'];
  return [];
}

function isWasenderKindEnabled(kind) {
  return parseWasenderKinds().includes(String(kind || '').trim().toLowerCase());
}

function getConfiguredProviderForKind(kind) {
  const key = String(kind || '').trim().toLowerCase();
  if (getWasenderToken() && isWasenderKindEnabled(key)) return 'wasender';
  if (getWhapiToken()) return 'whapi';
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

  return String(process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();

}



function readGroupId(kind) {

  const key = GROUP_KEYS[kind];

  if (!key) return '';

  return String(process.env[key] || '').trim();

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



function resolveDeliveryTargets(kind, customerId) {

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

      const salesGroup = readGroupId('sale');

      if (salesGroup) targets.push(salesGroup);

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

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

}



function getSupabaseServiceClient() {

  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {

    const err = new Error('Supabase service env not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }

  return createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });

}



function resolveAction(req) {

  const action = String(req.query?.action || req.query?.a || req.body?.action || req.body?.a || '')

    .trim()

    .toLowerCase();

  if (action) return action;



  if (req.body?.saleId !== undefined && req.body?.saleId !== null) return 'whatsapp-sale';

  if (req.body?.laybyId) return 'whatsapp-layby';

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



async function loadProductPriceMap(supabase, items) {

  const productIds = Array.from(new Set((items || []).map((item) => item.product_id).filter(Boolean)));

  const map = new Map();

  if (!productIds.length) return map;



  const { data: products } = await supabase

    .from('products')

    .select('id, price, promotional_price')

    .in('id', productIds);

  (products || []).forEach((row) => {

    map.set(String(row.id), row);

  });

  return map;

}



function resolveItemUnitPrice(item, productMap) {

  return resolveItemPrices(item, productMap).unit;

}



function resolveItemPrices(item, productMap) {

  const stored = Number(item.unit_price || 0);

  const productId = item.product_id;

  if (productId && productMap.has(String(productId))) {

    const product = productMap.get(String(productId));

    const promo = Number(product.promotional_price || 0);

    const standard = Number(product.price || 0);

    if (promo > 0) return { unit: promo, standard: standard > 0 ? standard : promo, usedPromo: true };

    if (standard > 0) return { unit: standard, standard, usedPromo: false };

  }

  return { unit: stored, standard: stored, usedPromo: false };

}



function buildProductLines(items, currency, productMap, { saleId } = {}) {

  const scoped = (items || []).filter((item) => {

    if (saleId != null && item.sale_id != null && String(item.sale_id) !== String(saleId)) return false;

    const qty = Number(item.quantity || 0);

    const name = String(item.display_name || item.product_id || '').trim();

    if (!name || qty <= 0) return false;

    const unit = resolveItemUnitPrice(item, productMap);

    return unit > 0;

  });



  return scoped.map((item) => {

    const qty = Number(item.quantity || 0);

    const name = String(item.display_name || item.product_id || '').trim();

    const { unit } = resolveItemPrices(item, productMap);

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



  const totalPaid = rows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  lines.push(`💳 Total Paid: ${formatAmount(totalPaid, currency)}`);

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

}) {

  const { date, time } = formatDateTimeParts(dateTimeIso);

  const lines = [];



  if (eventType === 'quote_convert' || isQuoteLayby) {

    lines.push('🏭 *Factory Production*');

  } else if (eventType === 'new_layby') {

    lines.push('📋 *Layby Created*');

  } else if (eventType === 'payment') {

    lines.push('💵 *Layby Payment*');

  } else if (eventType === 'statement') {

    lines.push('📋 *Layby Statement*');

  } else if (eventType === 'sale') {

    lines.push('✅ *Completed Sale*');

  }



  pushLine(lines, '📍 Location', locationName);

  if (date && time) {

    lines.push(`📅 Date: ${date} & 🕐 Time ${time}`);

  } else if (date) {

    pushLine(lines, '📅 Date', date);

  }

  pushLine(lines, '🧾 Receipt #', receiptNumber);

  pushLine(lines, '👤 Customer Name', customerName);

  pushLine(lines, '📞 Customer Number', customerPhone);

  if (productLines?.length && eventType !== 'statement') {

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



  if (Number(balanceDue || 0) > 0) {

    lines.push(`⏳ Balance Due: ${formatAmount(balanceDue, currency)}`);

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

    const msg = json?.error?.message || json?.message || 'Whapi text send failed';

    const err = new Error(msg);

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

    for (const to of unique) {

      const response = await sendWasenderMessage({ to, text: body });

      results.push({ to, messageId: response?.data?.id || response?.message?.id || response?.id || null });

    }

    return results;

  }



  if (provider === 'whapi' || mode === 'group') {

    for (const to of unique) {

      const response = await sendWhapiText(to, body);

      results.push({ to, messageId: response?.message?.id || response?.id || null });

    }

    return results;

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



async function deliverDocument(targets, link, filename, mode, provider = 'whapi', caption = '') {

  if (!link || !targets.length) return [];

  const unique = Array.from(new Set(targets));



  if (provider === 'wasender') {

    const results = [];

    for (const to of unique) {

      const response = await sendWasenderMessage({

        to,

        text: caption,

        documentUrl: link,

        fileName: filename || 'document.pdf',

      });

      results.push({ to, messageId: response?.data?.id || response?.message?.id || response?.id || null });

    }

    return results;

  }



  if (provider === 'whapi' || mode === 'group') {

    const { token } = getWhapiConfig();

    const results = [];

    for (const to of unique) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('Whapi document timeout')), WHAPI_TIMEOUT_MS);
      let resp;
      try {
        resp = await fetch('https://gate.whapi.cloud/messages/document', {

        method: 'POST',

        headers: {

          Authorization: `Bearer ${token}`,

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          to,

          media: link,

          filename: filename || 'document.pdf',

          mime_type: 'application/pdf',

          caption: caption ? String(caption).slice(0, WHATSAPP_CAPTION_LIMIT) : undefined,

        }),
          signal: controller.signal,
        });
      } catch (err) {
        const e = new Error(err?.name === 'AbortError' ? `Whapi document timeout after ${WHAPI_TIMEOUT_MS}ms` : (err?.message || 'Whapi document send failed'));
        e.status = 504;
        e.stage = 'whatsapp';
        throw e;
      } finally {
        clearTimeout(timeout);
      }

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {

        const err = new Error(json?.error?.message || json?.message || 'Whapi document send failed');

        err.status = 502;

        err.stage = 'whatsapp';

        throw err;

      }

      results.push({ to, messageId: json?.message?.id || json?.id || null });

    }

    return results;

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



async function handleWhatsAppSale(body) {

  const saleId = body.saleId;

  if (saleId === undefined || saleId === null || String(saleId).trim() === '') {

    const err = new Error('Missing saleId');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const supabase = getSupabaseServiceClient();

  const { data: sale, error: saleErr } = await supabase

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

    return { ok: true, skipped: 'layby' };

  }

  // Fahme accounts must never expose individual POS sale details or receipts
  // in WhatsApp groups. POS sends their consolidated layby statement instead.
  if (isFahmeCustomer(sale.customer_id)) {

    return { ok: true, skipped: 'fahme_layby_pdf_only' };

  }



  const routing = resolveDeliveryTargets('sale', sale.customer_id);

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_SALES_GROUP_ID + WASENDER_API_TOKEN or WHATSAPP_API_TOKEN)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const pdfUrl = String(body.pdfUrl || '').trim();

  const pdfFilename = String(body.pdfFilename || '').trim() || 'sales-receipt.pdf';



  const { data: customer } = await supabase

    .from('customers')

    .select('name, phone, address, city, tpin, currency')

    .eq('id', sale.customer_id)

    .maybeSingle();



  const { data: itemsRows } = await supabase

    .from('sales_items')

    .select('display_name, product_id, quantity, unit_price, currency, color, sale_id')

    .eq('sale_id', sale.id);

  const items = Array.isArray(itemsRows) ? itemsRows : [];



  const { data: payRows } = await supabase

    .from('sales_payments')

    .select('amount, payment_type, payment_date, reference, notes, currency')

    .eq('sale_id', sale.id)

    .order('payment_date', { ascending: true });

  const payments = Array.isArray(payRows) ? payRows : [];



  let locationName = '';

  if (sale.location_id) {

    const { data: loc } = await supabase

      .from('locations')

      .select('name')

      .eq('id', sale.location_id)

      .maybeSingle();

    locationName = loc?.name || '';

  }



  const currency = normalizeCurrency(sale.currency || customer?.currency || 'K');

  const productMap = await loadProductPriceMap(supabase, items);

  const productLines = buildProductLines(items, currency, productMap, { saleId: sale.id });

  const summaryTotal = Number(sale.total_amount || 0);

  const discountAmount = Number(sale.discount || 0);

  const balanceDue = Math.max(0, summaryTotal - payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));



  const message = buildLaybyMessage({

    eventType: 'sale',

    isQuoteLayby: false,

    locationName,

    dateTimeIso: sale.created_at || sale.sale_date,

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



  const deliveries = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {

    pdfUrl,

    pdfFilename,

  });

  return { ok: true, deliveries };
}



async function handleWhatsAppLayby(body) {

  const laybyId = String(body.laybyId || '').trim();

  const eventType = String(body.eventType || '').trim() || 'layby_update';

  const focusSaleId = body.saleId;

  const pdfUrl = String(body.pdfUrl || '').trim();

  const pdfFilename = String(body.pdfFilename || '').trim() || 'layby-statement.pdf';

  if (!laybyId) {

    const err = new Error('Missing laybyId');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const supabase = getSupabaseServiceClient();

  const { data: layby, error: laybyErr } = await supabase

    .from('laybys')

    .select('id, customer_id, total_amount, paid_amount, status, sale_id, created_at, updated_at')

    .eq('id', laybyId)

    .maybeSingle();

  if (laybyErr || !layby) {

    const err = new Error(laybyErr?.message || 'Layby not found');

    err.status = 404;

    err.stage = 'layby';

    throw err;

  }



  const routing = resolveDeliveryTargets('layby', layby.customer_id);

  if (!routing.targets.length) {

    const wantsFahme = isFahmeCustomer(layby.customer_id);

    const missingHint = wantsFahme
      ? 'Set WHATSAPP_FAHME_GROUP_ID=120363372527723284@g.us in Vercel, keep WHATSAPP_WASENDER_KINDS=sale,layby, then Redeploy'
      : 'Set WHATSAPP_LAYBY_GROUP_ID (or WHATSAPP_LAYBY_RECIPIENTS) in Vercel, then Redeploy';

    const err = new Error(`WhatsApp env not configured for ${wantsFahme ? 'Fahme' : 'layby'} (${missingHint})`);

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const { data: customer } = await supabase

    .from('customers')

    .select('name, phone, address, city, tpin, currency')

    .eq('id', layby.customer_id)

    .maybeSingle();



  const { data: salesRows } = await supabase

    .from('sales')

    .select('id, sale_date, created_at, currency, total_amount, location_id, receipt_number, discount')

    .eq('layby_id', laybyId);

  const sales = Array.isArray(salesRows) ? salesRows : [];

  const saleIds = sales.map((sale) => sale.id).filter((value) => value != null);

  if (!saleIds.length && layby.sale_id) saleIds.push(layby.sale_id);



  let isQuoteLayby = eventType === 'quote_convert';

  if (!isQuoteLayby && saleIds.length) {

    const { data: qRows } = await supabase

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

    const { data: loc } = await supabase

      .from('locations')

      .select('name')

      .eq('id', locationId)

      .maybeSingle();

    locationName = loc?.name || '';

  }



  let payments = [];

  if (saleIds.length) {

    const { data: payRows } = await supabase

      .from('sales_payments')

      .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes')

      .in('sale_id', saleIds)

      .order('payment_date', { ascending: true });

    const seen = new Set();

    (payRows || []).forEach((payment) => {

      const key = `${payment.sale_id}|${payment.payment_date || ''}|${Number(payment.amount || 0)}|${Number(payment.discount_amount || 0)}|${String(payment.reference || '')}|${String(payment.notes || '')}|${String(payment.payment_type || '').toLowerCase()}`;

      if (seen.has(key)) return;

      seen.add(key);

      payments.push(payment);

    });

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

    ? await supabase

        .from('sales_items')

        .select('sale_id, display_name, product_id, quantity, unit_price, color')

        .in('sale_id', saleIds)

    : { data: [] };

  const items = Array.isArray(itemRows) ? itemRows : [];

  const productMap = await loadProductPriceMap(supabase, items);



  const itemScopeSaleId = (eventType === 'new_layby' || eventType === 'quote_convert') && focusSale

    ? focusSale.id

    : null;

  const productLines = buildProductLines(items, currency, productMap, { saleId: itemScopeSaleId });



  const laybyTotal = Number(layby.total_amount || 0) > 0

    ? Number(layby.total_amount || 0)

    : sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);

  const summaryTotal = eventType === 'statement'
    ? laybyTotal
    : (Number(focusSale?.total_amount || 0) > 0 ? Number(focusSale.total_amount) : laybyTotal);

  const discountAmount = Number(focusSale?.discount || 0);



  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const totalDiscount = payments.reduce((sum, payment) => sum + Number(payment.discount_amount || 0), 0);

  const paidOnFocus = focusSalePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);



  let balanceDue = Math.max(0, laybyTotal - totalPaid - totalDiscount);

  if (eventType === 'new_layby' || eventType === 'quote_convert') {

    balanceDue = Math.max(0, summaryTotal - paidOnFocus);

  }



  const message = isFahmeCustomer(layby.customer_id) ? '' : buildLaybyMessage({

    eventType,

    isQuoteLayby,

    locationName,

    dateTimeIso: focusSale?.created_at || focusSale?.sale_date || layby.updated_at || layby.created_at,

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

  if (isFahmeCustomer(layby.customer_id) && !pdfUrl) {

    const err = new Error('Fahme WhatsApp notifications require the layby PDF');

    err.status = 400;

    err.stage = 'pdf';

    throw err;

  }



  const deliveries = await deliverNotification(routing.targets, message, routing.mode, routing.provider, {

    pdfUrl,

    pdfFilename,

  });



  return { ok: true, deliveries, pdfAttached: Boolean(pdfUrl) };

}



async function handleWhatsAppLabels(body) {

  const pdfUrl = String(body.pdfUrl || '').trim();

  if (!pdfUrl) {

    const err = new Error('Missing pdfUrl');

    err.status = 400;

    err.stage = 'validate';

    throw err;

  }



  const routing = resolveDeliveryTargets('labels', null);

  if (!routing.targets.length) {

    const err = new Error('WhatsApp env not configured (WHATSAPP_LABELS_GROUP_ID or WHATSAPP_LABELS_RECIPIENTS)');

    err.status = 500;

    err.stage = 'env';

    throw err;

  }



  const filename = String(body.pdfFilename || 'Price_Labels.pdf').trim() || 'Price_Labels.pdf';

  const caption = String(body.message || 'Price labels').trim().slice(0, WHATSAPP_CAPTION_LIMIT);

  const deliveries = await deliverDocument(routing.targets, pdfUrl, filename, routing.mode, routing.provider, caption);

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



module.exports = async function handler(req, res) {

  setCors(res);



  if (req.method === 'OPTIONS') {

    res.status(204).end();

    return;

  }



  if (req.method !== 'POST') {

    res.setHeader('Allow', 'POST, OPTIONS');

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



    if (action === 'whatsapp-labels' || action === 'labels') {

      const payload = await handleWhatsAppLabels(body);

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

