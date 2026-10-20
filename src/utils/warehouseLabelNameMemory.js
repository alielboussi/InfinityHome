/**
 * Per-SKU label name corrections (device-local). Applied on the next label scan for the same SKU.
 */

import { normalizeWarehouseSkuKey } from './warehouseAssemblyMath.js';
import { LABEL_NAME_MEMORY_KIND } from './warehouseLabelOcrName.js';
import {
  extractProductTurkishEntriesFromLabelMemory,
  LABEL_MEMORY_STORAGE_KEY,
} from './warehouseLabelMemoryEntries.js';

const STORAGE_KEY = LABEL_MEMORY_STORAGE_KEY;

function emptyStore() {
  return { bySku: {} };
}

function normalizeKind(kind) {
  return kind === LABEL_NAME_MEMORY_KIND.PRODUCT_TURKISH
    ? LABEL_NAME_MEMORY_KIND.PRODUCT_TURKISH
    : LABEL_NAME_MEMORY_KIND.PACKET;
}

function skuKey(sku) {
  return normalizeWarehouseSkuKey(sku) || String(sku || '').trim().toLowerCase();
}

function readStoreWeb() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.bySku) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStoreWeb(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

/** @returns {string} */
export function getRememberedLabelNameSync(sku, kind) {
  if (typeof window === 'undefined') return '';
  const key = skuKey(sku);
  if (!key) return '';
  const k = normalizeKind(kind);
  const row = readStoreWeb().bySku[key];
  if (!row) return '';
  if (k === LABEL_NAME_MEMORY_KIND.PACKET) return String(row.packetName || '').trim();
  return String(row.productTurkishName || '').trim();
}

/** @returns {Promise<string>} */
export async function getRememberedLabelName(sku, kind) {
  const sync = getRememberedLabelNameSync(sku, kind);
  if (sync) return sync;
  return '';
}

/**
 * @param {{ sku: string, kind: string, name: string }} payload
 */
export function rememberLabelNameSync({ sku, kind, name }) {
  if (typeof window === 'undefined') return;
  const key = skuKey(sku);
  const trimmed = String(name || '').trim();
  if (!key || !trimmed) return;
  const store = readStoreWeb();
  const row = store.bySku[key] || {};
  const k = normalizeKind(kind);
  if (k === LABEL_NAME_MEMORY_KIND.PACKET) {
    row.packetName = trimmed;
  } else {
    row.productTurkishName = trimmed;
  }
  row.updatedAt = new Date().toISOString();
  store.bySku[key] = row;
  writeStoreWeb(store);
}

export async function rememberLabelName(payload) {
  rememberLabelNameSync(payload);
}

export function exportProductTurkishEntriesFromBrowser() {
  const store = readStoreWeb();
  return extractProductTurkishEntriesFromLabelMemory(store);
}

export function pickLabelNameForSku({
  sku,
  kind,
  suggestedName,
  getRemembered = getRememberedLabelNameSync,
}) {
  const remembered = getRemembered(sku, kind);
  if (remembered) {
    return { name: remembered, nameSource: 'remembered' };
  }
  const suggested = String(suggestedName || '').trim();
  if (suggested) {
    return { name: suggested, nameSource: 'ocr' };
  }
  return { name: '', nameSource: 'none' };
}
