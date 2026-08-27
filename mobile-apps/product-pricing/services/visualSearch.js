import { API_BASE, ensureFirebaseAuthToken } from '../../shared/firebase';

async function postVisualSearch(action, body = {}) {
  const token = await ensureFirebaseAuthToken(true);
  if (!token) throw new Error('Sign in required.');

  const response = await fetch(`${API_BASE}/api/product-image-search?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Visual search failed (${response.status}).`);
  }
  return payload;
}

export async function searchProductsByPhoto(imageBase64, { textHint } = {}) {
  const payload = await postVisualSearch('search', { imageBase64, textHint });
  return {
    matches: payload.matches || [],
    searchableCount: payload.searchableCount || 0,
    indexingIncomplete: Boolean(payload.indexingIncomplete),
    searchMethod: payload.searchMethod || '',
  };
}

export async function fetchEmbeddingStatus() {
  return postVisualSearch('status');
}

export async function runEmbeddingBackfillLoop({ limit = 50, onProgress } = {}) {
  let remaining = 1;
  let totalEmbedded = 0;
  let loops = 0;
  const maxLoops = 40;

  while (remaining > 0 && loops < maxLoops) {
    loops += 1;
    const result = await requestEmbeddingBackfill({ limit });
    totalEmbedded += Number(result.embedded || 0);
    remaining = Number(result.remaining || 0);
    onProgress?.(result);
    if ((result.processed || 0) === 0) break;
    if ((result.embedded || 0) === 0 && (result.failed || 0) > 0) {
      await new Promise((resolve) => { setTimeout(resolve, 2500); });
    } else {
      await new Promise((resolve) => { setTimeout(resolve, 400); });
    }
  }

  return { totalEmbedded, remaining, loops };
}

export async function requestImageEmbedding({
  entityType,
  entityId,
  imageUrl,
  name,
  sku,
}) {
  return postVisualSearch('embed', {
    entityType,
    entityId,
    imageUrl,
    name,
    sku,
  });
}

export async function requestEmbeddingBackfill({ limit = 25, force = false } = {}) {
  return postVisualSearch('backfill', { limit, force });
}
