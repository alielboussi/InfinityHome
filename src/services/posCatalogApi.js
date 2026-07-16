const getApiBase = () => {
  const base = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
  if (!base) return '';
  return base.replace(/\/+$/, '');
};

const isLocalHost = () => {
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch {
    return false;
  }
};

const buildApiUrl = (path) => {
  const apiBase = getApiBase();
  if (isLocalHost()) return path;
  return apiBase ? `${apiBase}${path}` : path;
};

export async function fetchPosLocationsViaApi() {
  const url = buildApiUrl('/api/pos-catalog?action=locations');
  const response = await fetch(url, { method: 'GET' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Failed to load POS locations');
  }
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

export async function fetchPosCatalogViaApi({ locationId, productIds = [] } = {}) {
  const url = buildApiUrl('/api/pos-catalog');
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
