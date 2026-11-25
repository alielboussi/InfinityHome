import db from '../dataClient';
import { apiUrl, getApiBase, isLocalDev, withApiHeaders } from '../utils/apiUrl';
import { compressQuoteLineImageFile } from '../utils/compressQuoteLineImage';
import { phraseStillHasEnglishWords, translateTermToArabic } from '../utils/quoteArabicTranslate';

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

export function isValidProductionRoute(route) {
  const r = String(route || '').trim().toLowerCase();
  return r === 'carpentry' || r === 'upholstery' || r === 'aluminum';
}

const MISSING_ROUTE_MSG =
  'Set the workshop route on this quote first (Upholstery, Carpentry, or Aluminum), save, then Send Order.';

/** Use saved quote routing only — Hassan picks the route on the quote page, not at send time. */
export async function pickQuoteProductionRouteForSend(quoteId, { fallbackRoute = '' } = {}) {
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('Quote ID is required.');
  const routing = await fetchQuoteProductionRouting(qid).catch(() => null);
  const route = String(routing?.route || fallbackRoute || '').trim().toLowerCase();
  if (isValidProductionRoute(route)) {
    return { quote_id: qid, route, routing };
  }
  const err = new Error(MISSING_ROUTE_MSG);
  err.code = 'send_order_missing_route';
  throw err;
}

async function quoteProductionFetch(url, init = {}, {
  requireAuth = true,
  apiLabel = 'order API',
  timeoutMs = 120000,
} = {}) {
  const auth = await authHeaders();
  if (requireAuth && !auth.Authorization) {
    throw new Error('Sign in again — your session may have expired.');
  }
  const headers = withApiHeaders({ ...auth, ...(init.headers || {}) });
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = timeoutMs > 0 && controller
    ? setTimeout(() => controller.abort(), timeoutMs)
  : null;
  let resp;
  try {
    resp = await fetch(apiUrl(url), {
      ...init,
      headers,
      signal: controller?.signal,
    });
  } catch (err) {
    const msg = String(err?.message || err || 'Network error');
    if (err?.name === 'AbortError' || /aborted/i.test(msg)) {
      throw new Error(
        `${apiLabel} timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection or try again in a minute.`,
      );
    }
    if (msg === 'Failed to fetch' || err instanceof TypeError) {
      throw new Error(
        `Cannot reach the ${apiLabel} (${msg}).${localApiHint()} Check your internet connection, disable ad blockers for this site, and reload.`,
      );
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return resp;
}

async function readJsonOrThrow(resp, fallbackError) {
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.ok === false) {
    if (resp.status === 413) {
      throw new Error('Image is too large for upload. Try a smaller photo.');
    }
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
  const compressed = await compressQuoteLineImageFile(file);
  const image_base64 = await readFileAsDataUrl(compressed);
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
  const map = await translateQuoteStringsToArabicComplete(texts, { requireComplete: false });
  return map;
}

/**
 * Fetch Arabic map from server (static + Gemini). When requireComplete, throws if any phrase is still English.
 */
const ARABIC_TRANSLATE_CHUNK = 36;
const ARABIC_TRANSLATE_MAX_REQUESTS = 16;

export async function translateQuoteStringsToArabicComplete(texts = [], { requireComplete = true, maxRounds = 3 } = {}) {
  const list = [...new Set((texts || []).map((t) => String(t ?? '').trim()).filter(Boolean))].slice(0, 120);
  if (!list.length) return {};

  let map = {};
  let lastErr = null;

  const needsArabic = (phrase) => {
    const ar = translateTermToArabic(phrase, map);
    return !ar || phraseStillHasEnglishWords(ar);
  };

  const maxRequests = Math.max(1, Math.floor(Number(maxRounds) || 3) * 6);
  let requests = 0;
  while (requests < ARABIC_TRANSLATE_MAX_REQUESTS && requests < maxRequests) {
    const missing = list.filter(needsArabic);
    if (!missing.length) break;
    const chunk = missing.slice(0, ARABIC_TRANSLATE_CHUNK);
    const keysBefore = Object.keys(map).length;
    try {
      const resp = await quoteProductionFetch(QUOTE_PRODUCTION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'translate-arabic', texts: chunk }),
      }, { requireAuth: true, apiLabel: 'Arabic translation API', timeoutMs: 35000 });
      const payload = await readJsonOrThrow(resp, 'Arabic translation failed');
      if (payload.translations && typeof payload.translations === 'object') {
        map = { ...map, ...payload.translations };
      }
      requests += 1;
      if (Object.keys(map).length === keysBefore) {
        break;
      }
    } catch (err) {
      lastErr = err;
      break;
    }
  }

  const stillMissing = list.filter(needsArabic);
  if (requireComplete && stillMissing.length) {
    const rawMsg = String(lastErr?.message || '').trim();
    const friendly = /high demand|try again later/i.test(rawMsg)
      ? 'Google Arabic translation is busy (high demand). Wait about 30 seconds and tap Send Order again.'
      : rawMsg;
    const err = new Error(
      friendly
        || `Arabic translation is not ready yet (${stillMissing.length} phrase(s)). Wait a few seconds and send the order again.`,
    );
    err.code = 'arabic_incomplete';
    err.phrases = stillMissing.slice(0, 8);
    throw err;
  }

  return map;
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
    factory_order_pdf_built: true,
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
  }, { apiLabel: 'factory message API', timeoutMs: 180000 });
  return readJsonOrThrow(resp, 'Factory group message failed');
}
