import { API_BASE, getFirebaseIdToken } from './firebase';

function resolveApiBase() {
  return String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
}

/** API errors may be a string or { message, code } — avoid "[object Object]" in the UI. */
export function formatWarehouseMobileApiError(value, fallback = 'Request failed') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const msg = value.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg);
  }
  return fallback;
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

  const rawBody = await response.text();
  let payload = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      const gateway = /deployment|DOCTYPE|<html/i.test(rawBody);
      const err = new Error(
        gateway
          ? 'Server busy or temporarily unavailable. Check the catalog — your change may already be saved.'
          : `Request failed (${response.status})`,
      );
      err.gateway = gateway;
      err.status = response.status;
      throw err;
    }
  }
  if (!response.ok || payload?.ok === false) {
    const err = new Error(
      formatWarehouseMobileApiError(payload?.error, `Request failed (${response.status})`),
    );
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
