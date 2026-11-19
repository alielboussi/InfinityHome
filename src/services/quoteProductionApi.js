import db from '../dataClient';
import { apiUrl, getApiBase, isLocalDev, withApiHeaders } from '../utils/apiUrl';

const QUOTE_PRODUCTION_API = '/api/quote-production';

async function authHeaders() {
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function localApiHint() {
  if (!isLocalDev()) return '';
  if (getApiBase()) return '';
  return ' Add REACT_APP_API_BASE in .env.local (see docs/local-development.md) and restart npm start.';
}

async function quoteProductionFetch(url, init = {}, { requireAuth = true, apiLabel = 'order API' } = {}) {
  const auth = await authHeaders();
  if (requireAuth && !auth.Authorization) {
    throw new Error('Sign in again — your session may have expired.');
  }
  const headers = withApiHeaders({ ...auth, ...(init.headers || {}) });
  let resp;
  try {
    resp = await fetch(apiUrl(url), { ...init, headers });
  } catch (err) {
    const msg = String(err?.message || err || 'Network error');
    if (msg === 'Failed to fetch' || err instanceof TypeError) {
      throw new Error(
        `Cannot reach the ${apiLabel} (${msg}).${localApiHint()} Check your internet connection, disable ad blockers for this site, and reload.`,
      );
    }
    throw err;
  }
  return resp;
}

async function readJsonOrThrow(resp, fallbackError) {
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.ok === false) {
    throw new Error(payload?.error || fallbackError || `Request failed (${resp.status})`);
  }
  return payload;
}

export async function fetchQuoteProductionRouting(quoteId) {
  const qs = new URLSearchParams({ op: 'get-routing', quote_id: String(quoteId) });
  const resp = await quoteProductionFetch(`${QUOTE_PRODUCTION_API}?${qs}`, { method: 'GET' });
  const payload = await readJsonOrThrow(resp, 'Failed to load production routing');
  return payload.routing || null;
}

export async function saveQuoteProductionRoute(quoteId, route, { metadata } = {}) {
  const body = { op: 'set-routing', quote_id: quoteId, route };
  if (metadata && typeof metadata === 'object') body.metadata = metadata;
  const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonOrThrow(resp, 'Failed to save production route');
  return payload.routing || null;
}

export async function sendQuoteToWarehouseProduction(quoteId) {
  const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'send-to-production', quote_id: quoteId }),
  });
  return readJsonOrThrow(resp, 'Send to production failed');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

/** Hassan quote line reference — server upload (Firebase Admin), not client storage rules. */
export async function uploadQuoteLineReferenceImageViaApi(quoteId, itemId, file) {
  const image_base64 = await readFileAsDataUrl(file);
  const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'quote-line-image-upload',
      quote_id: String(quoteId || 'draft').trim(),
      item_id: String(itemId || 'line').trim(),
      image_base64,
    }),
  });
  const payload = await readJsonOrThrow(resp, 'Line image upload failed');
  return String(payload.line_image_url || '').trim();
}

export async function suggestAluminumAccessories(productName) {
  const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'suggest-aluminum-accessories',
      product_name: String(productName || '').trim(),
    }),
  });
  const payload = await readJsonOrThrow(resp, 'Failed to suggest aluminum accessories');
  return Array.isArray(payload.accessories) ? payload.accessories : [];
}

export async function fetchQuoteProductionRoutingsMap(quoteIds = []) {
  const ids = [...new Set((quoteIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};
  const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'list-routings', quote_ids: ids }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload?.ok) return {};
  const map = {};
  for (const row of payload.routings || []) {
    if (row?.quote_id) map[String(row.quote_id)] = row;
  }
  return map;
}

export async function translateQuoteStringsToArabic(texts = []) {
  const list = [...new Set((texts || []).map((t) => String(t ?? '').trim()).filter(Boolean))];
  if (!list.length) return {};
  try {
    const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'translate-arabic', texts: list }),
    }, { requireAuth: false });
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && payload?.ok && payload.translations) {
      return payload.translations;
    }
  } catch {
    // ignore and return empty map so local fallback handles it
  }
  return {};
}

export async function sendFactoryOrderWhatsApp({
  message,
  pdfBase64,
  pdfUrl,
  pdfFilename,
  route,
  quote_id: quoteId,
  illustrationImageUrl,
  drawing_url: drawingUrl,
} = {}) {
  const url = String(pdfUrl || '').trim();
  const b64 = String(pdfBase64 || '').replace(/\s+/g, '');
  const payload = {
    op: 'deliver-factory-order',
    message,
    pdfFilename,
    route: String(route || '').trim().toLowerCase() || undefined,
    quote_id: quoteId,
    illustrationImageUrl: illustrationImageUrl || drawingUrl,
    drawing_url: drawingUrl || illustrationImageUrl,
  };
  if (url) {
    payload.pdfUrl = url;
  } else if (b64) {
    payload.pdfBase64 = b64;
  } else {
    throw new Error('Factory order PDF is missing. Save the quote and try again.');
  }
  const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, { apiLabel: 'factory message API' });
  return readJsonOrThrow(resp, 'Factory group message failed');
}
