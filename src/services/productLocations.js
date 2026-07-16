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

const shouldUseApi = () => {
  const apiBase = getApiBase();
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  if (forceApi) return true;
  if (isLocalHost()) return true;
  return Boolean(apiBase) || process.env.NODE_ENV === 'production';
};

async function postProductLocations(payload) {
  const apiBase = getApiBase();
  const url = isLocalHost()
    ? '/api/product-locations'
    : (apiBase ? `${apiBase}/api/product-locations` : '/api/product-locations');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Failed to save product locations.');
  }
  return data || {};
}

export async function syncProductLocations({ rows = [], replaceProductId = null }, supabase) {
  const cleanRows = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.product_id && row?.location_id)
    .map(row => ({ product_id: row.product_id, location_id: row.location_id }));

  if (shouldUseApi()) {
    try {
      return await postProductLocations({ rows: cleanRows, replaceProductId });
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || String(process.env.REACT_APP_FORCE_API || '').trim() === '1') {
        throw err;
      }
    }
  }

  if (!supabase) {
    throw new Error('Supabase client required for product_locations fallback.');
  }

  if (replaceProductId) {
    const { error: delErr } = await supabase.from('product_locations').delete().eq('product_id', replaceProductId);
    if (delErr) throw delErr;
  }
  if (cleanRows.length) {
    const { error } = await supabase.from('product_locations').upsert(cleanRows, { onConflict: 'product_id,location_id' });
    if (error) throw error;
  }
  return { ok: true, count: cleanRows.length };
}
