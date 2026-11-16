import { rewriteLegacyStorageUrl } from './storageImageUrl';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
} from './warehouseScanResolver';
import { readWarehouseFloor2WipImageUrl } from './warehouseFloor2WipImage';

export function readFloor1CatalogImageUrl(assembly) {
  const url = String(assembly?.image_url || '').trim();
  if (!url) return '';
  const wip = readWarehouseFloor2WipImageUrl(assembly);
  if (wip && String(wip).trim() === url) return '';
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