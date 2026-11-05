import { API_BASE, getFirebaseIdToken } from './firebase';

function resolveApiBase() {
  return String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
}

/** API errors may be a string or { message, code } — avoid "[object Object]" in the UI. */
export function formatWarehouseMobileApiError(value, fallback = 'Request failed') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '[object Object]') return fallback;
    return trimmed || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const msg = value.message;
    if (typeof msg === 'string' && msg.trim() && msg !== '[object Object]') return msg.trim();
    if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg);
    if (msg && typeof msg === 'object' && typeof msg.message === 'string' && msg.message.trim()) {
      return msg.message.trim();
    }
    const code = value.code;
    if (typeof code === 'string' && code.trim()) return code.trim();
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') return json;
    } catch {
      // ignore
    }
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
      const gateway = /deployment|function_invocation_timeout|DOCTYPE|<html/i.test(rawBody);
      const err = new Error(
        gateway
          ? 'Server timed out. Your change may have saved — refresh and check qty before trying again.'
          : `Request failed (${response.status})`,
      );
      err.gateway = gateway;
      err.status = response.status;
      throw err;
    }
  }
  if (!response.ok || payload?.ok === false) {
    const rawError = formatWarehouseMobileApiError(payload?.error, `Request failed (${response.status})`);
    const tooLarge = response.status === 413
      || /entity too large/i.test(rawError)
      || /entity too large/i.test(rawBody);
    const timedOut = response.status === 504
      || /deployment|function_invocation_timeout/i.test(rawError)
      || /deployment|function_invocation_timeout/i.test(rawBody);
    const err = new Error(
      tooLarge
        ? 'Photo upload is too large. Retake the photo (move closer) or reload the app after updating.'
        : timedOut
          ? 'Server timed out. Your change may have saved — refresh and check qty before trying again.'
          : rawError,
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
