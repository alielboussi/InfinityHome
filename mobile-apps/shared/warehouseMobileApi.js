import { API_BASE, getFirebaseIdToken } from './firebase';

function resolveApiBase() {
  return String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
}

export async function warehouseMobileRequest(op, body = {}) {
  const token = await getFirebaseIdToken();
  if (!token) {
    const err = new Error('You must be signed in.');
    err.code = 'auth';
    throw err;
  }

  const url = `${resolveApiBase()}/api/warehouse-mobile`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ op, ...body }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const err = new Error(payload?.error || `Request failed (${response.status})`);
    err.details = payload?.details || null;
    err.status = response.status;
    if (response.status >= 500 || !response.ok) err.network = response.status === 0;
    throw err;
  }
  return payload;
}

export function isLikelyNetworkError(err) {
  if (!err) return false;
  if (err.code === 'auth') return false;
  const msg = String(err.message || '').toLowerCase();
  return err.network === true
    || msg.includes('network')
    || msg.includes('failed to fetch')
    || msg.includes('internet');
}
