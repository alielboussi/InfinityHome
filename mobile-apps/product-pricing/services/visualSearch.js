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

export async function searchProductsByPhoto(imageBase64) {
  const payload = await postVisualSearch('search', { imageBase64 });
  return payload.matches || [];
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
