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

const isForceApi = () => String(process.env.REACT_APP_FORCE_API || '').trim() === '1';

const chunkArray = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

export const postInventoryBulk = async (payload) => {
  const apiBase = getApiBase();
  const url = isLocalHost()
    ? '/api/inventory-bulk'
    : (apiBase ? `${apiBase}/api/inventory-bulk` : '/api/inventory-bulk');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Failed to save inventory.');
  }
  return data || {};
};

export const applySaleInventoryDeductionViaApi = async ({
  items = [],
  locationId,
  saleId,
  receiptNumber,
  userUid = null,
  userId = null,
}) => {
  const data = await postInventoryBulk({
    action: 'sale-deduction',
    items,
    locationId,
    saleId,
    receiptNumber,
    userUid,
    userId,
  });
  return Number(data?.adjustedProducts || 0);
};

export const applyInventoryBulk = async ({ inserts = [], updates = [] }, supabase) => {
  const nowIso = new Date().toISOString();
  let lastApiError = null;
  const cleanInserts = (Array.isArray(inserts) ? inserts : [])
    .filter(row => row?.product_id && row?.location)
    .map(row => ({
      product_id: row.product_id,
      location: row.location,
      quantity: Number(row.quantity ?? 0),
      updated_at: row.updated_at || nowIso,
    }));

  const cleanUpdates = (Array.isArray(updates) ? updates : [])
    .filter(row => row?.id)
    .map(row => ({
      id: row.id,
      quantity: Number(row.quantity ?? 0),
      updated_at: row.updated_at || nowIso,
    }));

  if (cleanInserts.length === 0 && cleanUpdates.length === 0) {
    return { inserted: 0, updated: 0, via: 'none' };
  }

  if (shouldUseApi()) {
    try {
      await postInventoryBulk({ inserts: cleanInserts, updates: cleanUpdates });
      return { inserted: cleanInserts.length, updated: cleanUpdates.length, via: 'api' };
    } catch (err) {
      lastApiError = err;
      if (process.env.NODE_ENV === 'production' || isForceApi()) throw err;
    }
  }

  if (!supabase) {
    throw new Error('Supabase client required for inventory fallback.');
  }

  try {
    if (cleanInserts.length > 0) {
      const { error: insErr } = await supabase
        .from('inventory')
        .upsert(cleanInserts, { onConflict: 'product_id,location' });
      if (insErr) throw insErr;
    }

    if (cleanUpdates.length > 0) {
      const chunks = chunkArray(cleanUpdates, 200);
      for (const chunk of chunks) {
        const results = await Promise.all(
          chunk.map(row => supabase
            .from('inventory')
            .update({ quantity: row.quantity, updated_at: row.updated_at })
            .eq('id', row.id))
        );
        const failed = results.find(res => res.error);
        if (failed?.error) throw failed.error;
      }
    }

    return { inserted: cleanInserts.length, updated: cleanUpdates.length, via: 'direct' };
  } catch (err) {
    if (!shouldUseApi()) {
      try {
        await postInventoryBulk({ inserts: cleanInserts, updates: cleanUpdates });
        return { inserted: cleanInserts.length, updated: cleanUpdates.length, via: 'api-fallback' };
      } catch (apiErr) {
        lastApiError = apiErr;
      }
    }
    if (lastApiError) {
      const combined = new Error(`${err?.message || err} | api: ${lastApiError?.message || lastApiError}`);
      combined.cause = { direct: err, api: lastApiError };
      throw combined;
    }
    throw err;
  }
};
