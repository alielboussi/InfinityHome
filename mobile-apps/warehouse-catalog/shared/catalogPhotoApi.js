import { API_BASE, getFirebaseIdToken } from './firebase';
import { formatWarehouseMobileApiError } from './warehouseMobileApi';

const CLIENT_SOURCE = 'warehouse_catalog_app';

function resolveApiBase() {
  return String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function photoErrorRetryable(err) {
  if (!err) return false;
  const status = Number(err.status) || 0;
  if (status === 504 || status === 503 || status === 502) return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('network');
}

async function postCatalogPhotoOnce({ assemblyId, imageBase64, forceReupload }) {
  const token = await getFirebaseIdToken();
  if (!token) {
    const err = new Error('You must be signed in.');
    err.code = 'auth';
    throw err;
  }

  const url = `${resolveApiBase()}/api/warehouse-catalog-photo`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      adminAction: 'warehouse-catalog-photo',
      assembly_id: assemblyId,
      image_base64: imageBase64,
      force_reupload: forceReupload === true,
      client_source: CLIENT_SOURCE,
      require_ai_retouch: false,
    }),
  });

  const rawBody = await response.text();
  let payload = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      const err = new Error(`Request failed (${response.status})`);
      err.status = response.status;
      throw err;
    }
  }

  if (!response.ok || payload?.ok === false) {
    const err = new Error(formatWarehouseMobileApiError(payload?.error, `Request failed (${response.status})`));
    err.status = response.status;
    throw err;
  }

  return payload;
}

/** Upload imported catalog photo (no server-side AI). */
export async function attachCatalogProductPhoto({
  assemblyId,
  imageBase64,
  forceReupload = false,
  onAttempt,
} = {}) {
  const id = String(assemblyId || '').trim();
  const image = String(imageBase64 || '').trim();
  if (!id) throw new Error('assembly_id is required.');
  if (!image) throw new Error('Product photo is required.');

  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (typeof onAttempt === 'function') onAttempt(attempt, maxAttempts);
    try {
      return await postCatalogPhotoOnce({
        assemblyId: id,
        imageBase64: image,
        forceReupload,
      });
    } catch (err) {
      lastErr = err;
      if (!photoErrorRetryable(err) || attempt === maxAttempts) throw err;
      await sleep(2000 * attempt);
    }
  }
  throw lastErr || new Error('Photo upload failed.');
}

/** @deprecated use attachCatalogProductPhoto */
export const attachCatalogProductPhotoWithAi = attachCatalogProductPhoto;
