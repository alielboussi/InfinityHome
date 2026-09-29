import { apiUrl } from '../utils/apiUrl';

export async function fetchPosLocationsViaApi() {
  const url = apiUrl('/api/pos-catalog?action=locations');
  const response = await fetch(url, { method: 'GET' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Failed to load POS locations');
  }
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

export async function fetchPosCatalogViaApi({ locationId, productIds = [] } = {}) {
  const url = apiUrl('/api/pos-catalog');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationId: locationId || null,
      productIds: Array.isArray(productIds) ? productIds : [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Failed to load POS catalog fallback');
  }
  return payload?.rows || {};
}
