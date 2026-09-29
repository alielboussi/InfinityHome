import { apiUrl, shouldUseRemoteApi, withApiHeaders } from '../utils/apiUrl';

const shouldUseApi = () => shouldUseRemoteApi();

async function postProductLocations(payload) {
  const response = await fetch(apiUrl('/api/product-locations'), {
    method: 'POST',
    headers: withApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Failed to save product locations.');
  }
  return data || {};
}

export async function syncProductLocations({ rows = [], replaceProductId = null }, db) {
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

  if (!db) {
    throw new Error('Data client required for product_locations fallback.');
  }

  if (replaceProductId) {
    const { error: delErr } = await db.from('product_locations').delete().eq('product_id', replaceProductId);
    if (delErr) throw delErr;
  }
  if (cleanRows.length) {
    const { error } = await db.from('product_locations').upsert(cleanRows, { onConflict: 'product_id,location_id' });
    if (error) throw error;
  }
  return { ok: true, count: cleanRows.length };
}

/** Remove specific product↔location links (does not touch other locations). */
export async function removeProductLocations(rows = [], db) {
  const cleanRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.product_id && row?.location_id)
    .map((row) => ({ product_id: row.product_id, location_id: row.location_id }));
  if (!cleanRows.length) return { ok: true, count: 0 };

  if (shouldUseApi()) {
    try {
      return await postProductLocations({ rows: cleanRows, remove: true });
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || String(process.env.REACT_APP_FORCE_API || '').trim() === '1') {
        throw err;
      }
    }
  }

  if (!db) {
    throw new Error('Data client required for product_locations fallback.');
  }

  for (const row of cleanRows) {
    const { error } = await db
      .from('product_locations')
      .delete()
      .eq('product_id', row.product_id)
      .eq('location_id', row.location_id);
    if (error) throw error;
  }
  return { ok: true, count: cleanRows.length };
}
