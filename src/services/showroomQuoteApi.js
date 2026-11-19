import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';

async function authHeaders() {
  const token = await firebaseGetAccessToken(false);
  if (!token) throw new Error('Sign in required.');
  return withApiHeaders({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
}

export async function createShowroomQuoteAndSend(lines) {
  const headers = await authHeaders();
  const resp = await fetch(apiUrl('/api/quote-production'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ op: 'create-showroom-order', lines }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Showroom order failed (${resp.status})`);
  }
  return payload;
}