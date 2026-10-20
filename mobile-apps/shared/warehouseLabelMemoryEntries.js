/**
 * Extract product Turkish names from device-local label memory.
 * Keep in sync with src/utils/warehouseLabelMemoryEntries.js
 */

import { normalizeWarehouseSkuKey } from './warehouseScanResolver';

export const LABEL_MEMORY_STORAGE_KEY = 'warehouseLabelNameMemory_v1';

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') return { bySku: {} };
  if (!raw.bySku || typeof raw.bySku !== 'object') return { bySku: {} };
  return raw;
}

export function parseLabelMemoryStore(raw) {
  if (typeof raw === 'string') {
    try {
      return normalizeStore(JSON.parse(raw));
    } catch {
      return { bySku: {} };
    }
  }
  return normalizeStore(raw);
}

export function extractProductTurkishEntriesFromLabelMemory(store) {
  const parsed = normalizeStore(store);
  const out = [];
  const seen = new Set();
  Object.entries(parsed.bySku || {}).forEach(([key, row]) => {
    const turkish = String(row?.productTurkishName || '').trim();
    if (!turkish) return;
    const sku = normalizeWarehouseSkuKey(key) || String(key || '').trim().toLowerCase();
    if (!sku || seen.has(sku)) return;
    seen.add(sku);
    out.push({ sku, turkish_name: turkish });
  });
  return out;
}

/**
 * Bulk catalog sync: product Turkish names plus packet label titles (often Turkish on the floor).
 * @returns {{ entries: { sku: string, turkish_name: string }[], productCount: number, packetCount: number }}
 */
export function buildTurkishSyncPayloadFromLabelMemory(store) {
  const parsed = normalizeStore(store);
  const entries = [];
  const seen = new Set();
  let productCount = 0;
  let packetCount = 0;

  Object.entries(parsed.bySku || {}).forEach(([key, row]) => {
    const sku = normalizeWarehouseSkuKey(key) || String(key || '').trim().toLowerCase();
    if (!sku || seen.has(sku)) return;
    const productTurkish = String(row?.productTurkishName || '').trim();
    const packetTitle = String(row?.packetName || '').trim();
    const turkish = productTurkish || packetTitle;
    if (!turkish) return;
    seen.add(sku);
    if (productTurkish) productCount += 1;
    else packetCount += 1;
    entries.push({ sku, turkish_name: turkish });
  });

  return { entries, productCount, packetCount };
}
