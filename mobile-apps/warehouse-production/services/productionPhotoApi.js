import { API_BASE, getFirebaseIdToken } from '../shared/firebase';
import { formatWarehouseMobileApiError } from '../shared/warehouseMobileApi';

const CLIENT_SOURCE = 'warehouse_production_app';

function resolveApiBase() {
  return String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function photoErrorRetryable(err) {
  if (!err) return false;
  if (err.gateway) return true;
  const status = Number(err.status) || 0;
  if (status === 504 || status === 503 || status === 502) return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('deployment')
    || msg.includes('function_invocation')
    || msg.includes('network');
}

async function postProductionAiPhotoOnce({ assemblyId, imageBase64 }) {
  const token = await getFirebaseIdToken();
  if (!token) {
    const err = new Error('You must be signed in.');
    err.code = 'auth';
    throw err;
  }

  const url = `${resolveApiBase()}/api/warehouse-production-photo`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      adminAction: 'warehouse-production-photo',
      assembly_id: assemblyId,
      image_base64: imageBase64,
      client_source: CLIENT_SOURCE,
      require_ai_retouch: true,
    }),
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
          ? 'AI photo server timed out. Retrying…'
          : `Request failed (${response.status})`,
      );
      err.gateway = gateway;
      err.status = response.status;
      throw err;
    }
  }

  if (!response.ok || payload?.ok === false) {
    const rawError = formatWarehouseMobileApiError(payload?.error, `Request failed (${response.status})`);
    const timedOut = response.status === 504
      || /deployment|function_invocation_timeout/i.test(rawError)
      || /deployment|function_invocation_timeout/i.test(rawBody);
    const err = new Error(
      timedOut ? 'AI photo server timed out. Retrying…' : rawError,
    );
    err.status = response.status;
    err.gateway = timedOut;
    throw err;
  }

  return payload;
}

/**
 * AI retouch + save (long-running admin route, up to 300s). Retries on gateway timeouts.
 */
export async function attachProductionProductPhotoWithAi({ assemblyId, imageBase64, onAttempt } = {}) {
  const id = String(assemblyId || '').trim();
  const image = String(imageBase64 || '').trim();
  if (!id) throw new Error('assembly_id is required.');
  if (!image) throw new Error('Product photo is required.');

  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (typeof onAttempt === 'function') {
      onAttempt(attempt, maxAttempts);
    }
    try {
      return await postProductionAiPhotoOnce({ assemblyId: id, imageBase64: image });
    } catch (err) {
      lastErr = err;
      if (!photoErrorRetryable(err) || attempt === maxAttempts) {
        throw err;
      }
      await sleep(3000 * attempt);
    }
  }
  throw lastErr || new Error('AI photo failed.');
}
