import db from '../dataClient';
import { checkout as checkoutApi } from './checkout';
import { resolveSaleActor, getCurrentUser } from '../accessControl';
import { logUserActivity } from '../utils/userActivityLog';
import { computeQuoteLaybyTotal } from '../utils/quotationDisplay';

const toNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

function isLocalHost() {
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch {
    return false;
  }
}


async function getAuthHeaders({ includeBypass = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeBypass) {
    const bypass = String(process.env.REACT_APP_VERCEL_BYPASS || '').trim();
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  }

  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}
  return headers;
}

function buildConvertApiUrls() {
  // On localhost, only use same-origin /api paths (CRA proxy adds bypass server-side; no CORS).
  if (isLocalHost()) {
    return [
      '/api/quote-convert-layby',
      '/api/transactions?action=quote-convert-layby',
      '/api/admin?adminAction=quote-convert-layby',
    ];
  }

  const apiBase = String(process.env.REACT_APP_API_BASE || '').trim().replace(/\/+$/, '');
  const urls = [];
  if (apiBase) {
    urls.push(`${apiBase}/api/quote-convert-layby`);
    urls.push(`${apiBase}/api/transactions?action=quote-convert-layby`);
    urls.push(`${apiBase}/api/admin?adminAction=quote-convert-layby`);
  } else {
    urls.push('/api/quote-convert-layby');
    urls.push('/api/transactions?action=quote-convert-layby');
    urls.push('/api/admin?adminAction=quote-convert-layby');
  }
  return [...new Set(urls.filter(Boolean))];
}

function isCrossOriginUrl(url) {
  try {
    if (!url.startsWith('http')) return false;
    const target = new URL(url);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return Boolean(origin && target.origin !== origin);
  } catch {
    return false;
  }
}

function isNetworkFetchError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('load failed');
}

async function postQuoteConvert(payload) {
  const urls = buildConvertApiUrls();
  let lastError = null;

  for (const url of urls) {
    const headers = await getAuthHeaders({ includeBypass: isCrossOriginUrl(url) });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await response.text().catch(() => '');
      let json = {};
      if (text) {
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
      }
      if (response.ok && json?.ok) return json;
      lastError = json?.error || json?.raw || `Convert failed (${response.status})`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  const error = new Error(lastError || 'Convert failed');
  error.isNetworkError = isNetworkFetchError(error);
  throw error;
}

function buildSaleItems(items, normalizeItem, currency) {
  const normalize = typeof normalizeItem === 'function'
    ? normalizeItem
    : (item) => ({
        quantity: Math.max(1, Number(item?.quantity || 1) || 1),
        unit_price: Number(item?.unit_price || 0) || 0,
      });

  return (items || []).map((item) => {
    const normalized = normalize(item);
    return {
      product_id: item.product_id || null,
      quantity: normalized.quantity,
      unit_price: normalized.unit_price,
      currency,
      display_name: item.name_override || item.display_name || null,
    };
  });
}

async function convertQuoteToLaybyDirect({ quote, saleItems, total, saleDiscount, currency, quotationStatus }) {
  const nowIso = new Date().toISOString();
  const actor = resolveSaleActor(getCurrentUser());

  const { data: laybyRow, error: laybyErr } = await db
    .from('laybys')
    .insert([
      {
        customer_id: quote.customer_id,
        total_amount: total,
        paid_amount: 0,
        status: 'active',
        origin: 'quote',
        notes: 'origin=quote',
        created_at: nowIso,
        updated_at: nowIso,
      },
    ])
    .select('id')
    .single();
  if (laybyErr) throw laybyErr;

  const saleHeader = {
    customer_id: quote.customer_id,
    total_amount: total,
    currency,
    status: 'layby',
    sale_date: nowIso,
    layby_id: laybyRow.id,
    discount: saleDiscount,
    vat_apply: Boolean(quote?.vat_apply),
    vat_inclusive: Boolean(quote?.vat_apply) ? Boolean(quote?.vat_inclusive) : false,
    vat_rate: Boolean(quote?.vat_apply) ? Math.max(0, toNumber(quote?.vat_rate)) : 0,
    user_uid: actor.user_uid,
    user_id: actor.user_id,
  };

  const { data: checkoutData, error: checkoutErr } = await checkoutApi({
    sale: saleHeader,
    items: saleItems,
    payments: [],
  });
  if (checkoutErr) {
    try { await db.from('laybys').delete().eq('id', laybyRow.id); } catch {}
    throw checkoutErr;
  }

  const sale = checkoutData?.sale;
  if (!sale?.id) throw new Error('Quote conversion completed without a sale id');

  const { error: laybyLinkErr } = await db
    .from('laybys')
    .update({
      sale_id: sale.id,
      total_amount: total,
      updated_at: new Date().toISOString(),
    })
    .eq('id', laybyRow.id);
  if (laybyLinkErr) throw laybyLinkErr;

  try {
    await db
      .from('quotations')
      .update({ status: quotationStatus, sale_id: sale.id, layby_id: laybyRow.id })
      .eq('id', quote.id);
  } catch {
    await db
      .from('quotations')
      .update({ status: quotationStatus, sale_id: sale.id })
      .eq('id', quote.id);
  }

  return { sale, laybyId: laybyRow.id };
}

export async function convertQuoteToLayby({ quote, items, normalizeItem, quotationStatus = 'converted' }) {
  if (!quote?.id) throw new Error('Quote id is required');
  if (!quote?.customer_id) throw new Error('Quote customer is required');

  const currency = quote.currency || 'K';
  const saleItems = buildSaleItems(items, normalizeItem, currency);
  const subtotal = saleItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0);
  const saleDiscount = Math.max(0, Number(quote.discount || 0) || 0);
  const total = computeQuoteLaybyTotal({ quote, subtotal, discount: saleDiscount });

  let sale;
  let laybyId;

  try {
    const payload = await postQuoteConvert({ quote, items: saleItems, quotationStatus });
    sale = payload.sale;
    laybyId = payload.laybyId;
  } catch (apiErr) {
    if (!isLocalHost()) throw apiErr;

    try { console.warn('[quote-convert] API unavailable on localhost; falling back to browser writes.', apiErr?.message || apiErr); } catch {}
    const direct = await convertQuoteToLaybyDirect({
      quote,
      saleItems,
      total,
      saleDiscount,
      currency,
      quotationStatus,
    });
    sale = direct.sale;
    laybyId = direct.laybyId;
  }

  if (!sale?.id) throw new Error('Quote conversion completed without a sale id');

  logUserActivity({
    actionType: 'layby',
    actionLabel: 'Layby Created from Quote',
    details: `${quote.quote_number || quote.id} • ${saleItems.length} line${saleItems.length === 1 ? '' : 's'} • Total ${currency} ${total.toLocaleString()}`,
    reference: quote.quote_number || String(quote.id),
    entityType: 'layby',
    entityId: String(laybyId),
    metadata: { quote_id: quote.id, sale_id: sale.id },
  });

  return { sale, laybyId };
}
