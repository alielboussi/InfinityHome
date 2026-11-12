import { API_BASE, getFirebaseIdToken } from './firebase';

function resolveApiBase() {
  return String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
}

/** API errors may be a string or { message, code } — avoid "[object Object]" in the UI. */
/** Staff-friendly message when farm location is missing (legacy API text). */
export function mapFarmWarehouseSetupError(message, locale, tUi) {
  const msg = String(message || '').trim();
  if (/farm warehouse 1 location is not configured/i.test(msg)) {
    return typeof tUi === 'function'
      ? tUi('deliveryFarmLocationMissing', locale)
      : 'Farm warehouse is not set up yet. Contact an administrator.';
  }
  return msg;
}

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

const OFFLINE_RETRY_OPS = new Set([
  'production-job-materials-save',
  'production-floor2-manufacture-push',
  'return-order-accept',
  'return-order-pause',
  'return-order-resume',
  'return-order-complete',
]);

async function dispatchWarehouseMobile(op, body, token) {
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

export async function warehouseMobileRequest(op, body = {}) {
  const token = await getFirebaseIdToken();
  if (!token) {
    const err = new Error('You must be signed in.');
    err.code = 'auth';
    throw err;
  }
  try {
    return await dispatchWarehouseMobile(op, body, token);
  } catch (err) {
    if (OFFLINE_RETRY_OPS.has(String(op || '')) && isLikelyNetworkError(err)) {
      try {
        const { enqueueOfflineOp } = await import('./offlineScanQueue.js');
        await enqueueOfflineOp(op, body);
      } catch {
        /* ignore queue write failure */
      }
      const queued = new Error('Saved offline — will retry when connection returns.');
      queued.code = 'offline_queued';
      queued.queued = true;
      throw queued;
    }
    throw err;
  }
}

export async function flushWarehouseMobileOfflineQueue() {
  const token = await getFirebaseIdToken();
  if (!token) return { flushed: 0, remaining: 0 };
  const { flushOfflineQueue } = await import('./offlineScanQueue.js');
  return flushOfflineQueue(async (item) => {
    if (!item?.op) return false;
    try {
      await dispatchWarehouseMobile(item.op, item.body || {}, token);
      return true;
    } catch (e) {
      return !isLikelyNetworkError(e);
    }
  });
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
