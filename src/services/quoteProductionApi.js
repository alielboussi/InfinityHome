import db from '../dataClient';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';

async function authHeaders() {
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function fetchQuoteProductionRouting(quoteId) {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ op: 'get-routing', quote_id: String(quoteId) });
  const resp = await fetch(apiUrl(`/api/admin?adminAction=quote-production&${qs}`), {
    headers: withApiHeaders(headers),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload?.ok) throw new Error(payload?.error || 'Failed to load production routing');
  return payload.routing || null;
}

export async function saveQuoteProductionRoute(quoteId, route, { metadata } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  };
  const body = { op: 'set-routing', quote_id: quoteId, route };
  if (metadata && typeof metadata === 'object') body.metadata = metadata;
  const resp = await fetch(apiUrl('/api/admin?adminAction=quote-production'), {
    method: 'POST',
    headers: withApiHeaders(headers),
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload?.ok) throw new Error(payload?.error || 'Failed to save production route');
  return payload.routing || null;
}

export async function sendQuoteToWarehouseProduction(quoteId) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  };
  const resp = await fetch(apiUrl('/api/admin?adminAction=quote-production'), {
    method: 'POST',
    headers: withApiHeaders(headers),
    body: JSON.stringify({ op: 'send-to-production', quote_id: quoteId }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload?.ok) throw new Error(payload?.error || 'Send to production failed');
  return payload;
}

export async function fetchQuoteProductionRoutingsMap(quoteIds = []) {
  const ids = [...new Set((quoteIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  };
  const resp = await fetch(apiUrl('/api/admin?adminAction=quote-production'), {
    method: 'POST',
    headers: withApiHeaders(headers),
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
    const headers = {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    };
    const resp = await fetch(apiUrl('/api/admin?adminAction=quote-production'), {
      method: 'POST',
      headers: withApiHeaders(headers),
      body: JSON.stringify({ op: 'translate-arabic', texts: list }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && payload?.ok && payload.translations) {
      return payload.translations;
    }
  } catch {
    // ignore and return empty map so local fallback handles it
  }
  return {};
}

export async function sendFactoryOrderWhatsApp({ message, pdfBase64, pdfFilename } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  };
  const resp = await fetch(apiUrl('/api/whatsapp-factory-order'), {
    method: 'POST',
    headers: withApiHeaders(headers),
    body: JSON.stringify({
      action: 'whatsapp-factory-order',
      message,
      pdfBase64,
      pdfFilename,
    }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.ok === false) {
    throw new Error(payload?.error || `WhatsApp send failed (${resp.status})`);
  }
  return payload;
}
