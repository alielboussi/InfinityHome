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
