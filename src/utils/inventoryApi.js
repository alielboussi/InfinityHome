import { docIdFromOnConflict } from '../db/docIds.js';

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

/** Prefer direct Firestore on localhost so reads and writes hit the same database. */
const shouldUseApi = () => {
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  if (forceApi) return true;
  if (isLocalHost()) return false;
  const apiBase = getApiBase();
  if (apiBase) return true;
  return process.env.NODE_ENV === 'production';
};

const isForceApi = () => String(process.env.REACT_APP_FORCE_API || '').trim() === '1';

const chunkArray = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

const inventoryRowKey = (row) => `${String(row?.product_id || '')}::${String(row?.location || '')}`;

const pickCanonicalInventoryRow = (rows = []) => {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const aTs = Date.parse(a?.updated_at || '') || 0;
    const bTs = Date.parse(b?.updated_at || '') || 0;
    if (bTs !== aTs) return bTs - aTs;
    const aOpening = String(a?.id || '').startsWith('opening-');
    const bOpening = String(b?.id || '').startsWith('opening-');
    if (aOpening !== bOpening) return aOpening ? 1 : -1;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0];
};

/** Collapse duplicate product+location rows (keeps newest real inventory row). */
export function dedupeInventoryRows(rows = []) {
  const byKey = new Map();
  for (const row of rows || []) {
    if (!row?.product_id || row?.location == null || row?.location === '') continue;
    const key = inventoryRowKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    byKey.set(key, pickCanonicalInventoryRow([prev, row]));
  }
  return Array.from(byKey.values());
}

/** Sum quantity for one product+location after collapsing duplicates. */
export function sumInventoryQuantity(rows = [], productId, locationId) {
  const filtered = (rows || []).filter((row) => (
    String(row?.product_id) === String(productId)
    && String(row?.location) === String(locationId)
  ));
  const deduped = dedupeInventoryRows(filtered);
  return deduped.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
}

/** Set absolute quantity for one product at one location (canonical composite doc). */
export async function upsertInventoryQuantity(
  { productId, locationId, quantity, updatedAt },
  db,
) {
  if (!productId || !locationId) {
    throw new Error('productId and locationId are required.');
  }
  if (!db) {
    throw new Error('Data client required for inventory write.');
  }

  const nowIso = updatedAt || new Date().toISOString();
  const targetQty = Number(quantity ?? 0);
  const payload = {
    product_id: productId,
    location: locationId,
    quantity: targetQty,
    updated_at: nowIso,
  };

  const { error: upsertErr } = await db
    .from('inventory')
    .upsert([payload], { onConflict: 'product_id,location' });
  if (upsertErr) throw upsertErr;

  const canonicalId = docIdFromOnConflict(payload, 'product_id,location');
  const { data: rows, error: lookupErr } = await db
    .from('inventory')
    .select('id')
    .eq('product_id', productId)
    .eq('location', locationId);
  if (lookupErr) throw lookupErr;

  for (const row of rows || []) {
    if (row?.id == null || String(row.id) === String(canonicalId)) continue;
    const { error: delErr } = await db.from('inventory').delete().eq('id', row.id);
    if (delErr) console.warn('[inventory] legacy duplicate cleanup failed', delErr);
  }

  return { ok: true, quantity: targetQty, id: canonicalId };
}

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

export const applyInventoryBulk = async ({ inserts = [], updates = [] }, db) => {
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

  if (!db) {
    throw new Error('Data client required for inventory fallback.');
  }

  try {
    if (cleanInserts.length > 0) {
      const { error: insErr } = await db
        .from('inventory')
        .upsert(cleanInserts, { onConflict: 'product_id,location' });
      if (insErr) throw insErr;
    }

    if (cleanUpdates.length > 0) {
      const chunks = chunkArray(cleanUpdates, 200);
      for (const chunk of chunks) {
        const results = await Promise.all(
          chunk.map(row => db
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
