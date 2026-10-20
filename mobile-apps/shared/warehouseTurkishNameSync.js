import { warehouseMobileRequest } from './warehouseMobileApi';

const CHUNK_SIZE = 150;

/**
 * Upload local Turkish name entries to warehouse_assemblies (batched).
 * @param {{ sku: string, turkish_name: string }[]} entries
 * @param {{ mode?: 'overwrite' | 'fill_empty' }} [options]
 */
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
    const result = await warehouseMobileRequest('product-turkish-names-sync', {
      entries: chunk,
      mode,
    });
    totals.received += Number(result.received) || chunk.length;
    totals.updated += Number(result.updated) || 0;
    totals.skipped += Number(result.skipped) || 0;
    totals.unmatched += Number(result.unmatched) || 0;
    totals.batches += 1;
  }

  return totals;
}
