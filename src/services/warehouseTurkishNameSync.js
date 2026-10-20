import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';

const CHUNK_SIZE = 150;

async function postTurkishSyncChunk(entries, mode) {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('You must be signed in.');

  const response = await fetch(apiUrl('/api/warehouse-mobile'), {
    method: 'POST',
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({
      op: 'product-turkish-names-sync',
      entries,
      mode,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || payload?.message || 'Turkish name sync failed');
  }
  return payload;
}

/** @param {{ sku: string, turkish_name: string }[]} entries */
export async function syncProductTurkishNamesToCatalog(entries, options = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e?.turkish_name) : [];
  const mode = options.mode === 'fill_empty' ? 'fill_empty' : 'overwrite';
  const totals = {
    received: 0,
    updated: 0,
    skipped: 0,
    unmatched: 0,
    batches: 0,
  };

  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    const chunk = list.slice(i, i + CHUNK_SIZE);
    const result = await postTurkishSyncChunk(chunk, mode);
    totals.received += Number(result.received) || chunk.length;
    totals.updated += Number(result.updated) || 0;
    totals.skipped += Number(result.skipped) || 0;
    totals.unmatched += Number(result.unmatched) || 0;
    totals.batches += 1;
  }

  return totals;
}
