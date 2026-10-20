/**
 * Per-SKU label name corrections (device-local). Applied on the next label scan for the same SKU.
 * Keep in sync with src/utils/warehouseLabelNameMemory.js (AsyncStorage instead of localStorage).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeWarehouseSkuKey } from './warehouseScanResolver';
import { LABEL_NAME_MEMORY_KIND } from './warehouseLabelOcrName';
import {
  extractProductTurkishEntriesFromLabelMemory,
  LABEL_MEMORY_STORAGE_KEY,
} from './warehouseLabelMemoryEntries';

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

async function readStore() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.bySku) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

async function writeStore(store) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export async function getRememberedLabelName(sku, kind) {
  const key = skuKey(sku);
  if (!key) return '';
  const k = normalizeKind(kind);
  const row = (await readStore()).bySku[key];
  if (!row) return '';
  if (k === LABEL_NAME_MEMORY_KIND.PACKET) return String(row.packetName || '').trim();
  return String(row.productTurkishName || '').trim();
}

export async function rememberLabelName({ sku, kind, name }) {
  const key = skuKey(sku);
  const trimmed = String(name || '').trim();
  if (!key || !trimmed) return;
  const store = await readStore();
  const row = store.bySku[key] || {};
  const k = normalizeKind(kind);
  if (k === LABEL_NAME_MEMORY_KIND.PACKET) {
    row.packetName = trimmed;
  } else {
    row.productTurkishName = trimmed;
  }
  row.updatedAt = new Date().toISOString();
  store.bySku[key] = row;
  await writeStore(store);
}

/** All product Turkish names saved on this device (for bulk catalog sync). */
export async function exportProductTurkishEntriesFromDevice() {
  const store = await readStore();
  return extractProductTurkishEntriesFromLabelMemory(store);
}

export async function pickLabelNameForSku({ sku, kind, suggestedName }) {
  const remembered = await getRememberedLabelName(sku, kind);
  if (remembered) {
    return { name: remembered, nameSource: 'remembered' };
  }
  const suggested = String(suggestedName || '').trim();
  if (suggested) {
    return { name: suggested, nameSource: 'ocr' };
  }
  return { name: '', nameSource: 'none' };
}
