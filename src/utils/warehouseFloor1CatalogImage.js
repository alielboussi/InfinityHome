import { rewriteLegacyStorageUrl } from './storageImageUrl.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
} from './warehouseScanResolver.js';
import { readWarehouseFloor2WipImageUrl } from './warehouseFloor2WipImage.js';
import { parseCarpentryMeta } from './carpentryCatalogView.js';

/** Floor 1 catalog photo only (assembly.image_url). Never Floor 2 WIP metadata or shared URLs. */
export function readFloor1CatalogImageUrl(assembly) {
  const url = String(assembly?.image_url || '').trim();
  if (!url) return '';
  const wip = readWarehouseFloor2WipImageUrl(assembly);
  if (wip && String(wip).trim() === url && !parseCarpentryMeta(assembly)?.selected) {
    return '';
  }
  return rewriteLegacyStorageUrl(url, { bucket: 'productimages' }) || url;
}

export function buildFloor1CatalogImageLookupBySku(assemblies = []) {
  const bySku = new Map();
  (assemblies || []).forEach((row) => {
    const url = readFloor1CatalogImageUrl(row);
    if (!url) return;
    const keys = expandWarehouseSkuMatchKeys(row?.family_sku || '');
    if (!keys.length) {
      const sku = normalizeWarehouseProductSku(row?.family_sku || '');
      if (sku) keys.push(sku);
    }
    keys.forEach((key) => {
      const k = String(key || '').trim();
      if (k && !bySku.has(k)) bySku.set(k, url);
    });
  });
  return bySku;
}

/** Kitwe / retail display — same SKU uses Floor 1 catalog image when the row has no image_url. */
export function resolveKitweFloor1CatalogImageUrl(row, floor1BySku = null) {
  const direct = readFloor1CatalogImageUrl(row);
  if (direct) return direct;
  const sku = normalizeWarehouseProductSku(row?.family_sku || '');
  if (!sku || !floor1BySku) return '';
  for (const key of expandWarehouseSkuMatchKeys(sku)) {
    const hit = floor1BySku.get(String(key).trim());
    if (hit) return hit;
  }
  return floor1BySku.get(sku) || '';
}