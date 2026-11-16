import { rewriteLegacyStorageUrl } from './storageImageUrl';
import {
  buildFloor1CatalogImageLookupBySku,
  readFloor1CatalogImageUrl,
  resolveKitweFloor1CatalogImageUrl,
} from './warehouseFloor1CatalogImage';

function rewriteCatalogImageUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return rewriteLegacyStorageUrl(trimmed, { bucket: 'productimages' });
}

/** Kitwe / cross-portal cards — Floor 1 catalog image_url only (never Floor 2 WIP). */
export function kitweCatalogRowImageUrl(row) {
  if (!row) return '';
  return readFloor1CatalogImageUrl(row);
}

export function buildKitweCrossPortalImageLookup(carpentryProducts = [], upholsteryProducts = []) {
  const byId = new Map();
  const all = [...(carpentryProducts || []), ...(upholsteryProducts || [])];
  const bySku = buildFloor1CatalogImageLookupBySku(all);
  const register = (row) => {
    const rawUrl = kitweCatalogRowImageUrl(row);
    if (!rawUrl) return;
    const url = rewriteCatalogImageUrl(rawUrl);
    const id = String(row?.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, url);
    const rawId = String(row?.raw_assembly_id || '').trim();
    if (rawId && !byId.has(rawId)) byId.set(rawId, url);
  };
  all.forEach(register);
  return { byId, bySku };
}

export function pickKitweCatalogProductImageUrl(row, lookup = null) {
  const fromRow = kitweCatalogRowImageUrl(row);
  if (fromRow) return rewriteCatalogImageUrl(fromRow);
  if (lookup?.bySku) {
    const bySkuUrl = resolveKitweFloor1CatalogImageUrl(row, lookup.bySku);
    if (bySkuUrl) return bySkuUrl;
  }
  if (!lookup || !row) return '';
  const id = String(row.id || '').trim();
  if (id && lookup.byId?.has(id)) return lookup.byId.get(id);
  const rawId = String(row.raw_assembly_id || '').trim();
  if (rawId && lookup.byId?.has(rawId)) return lookup.byId.get(rawId);
  return '';
}

export function pickKitweCatalogFamilyImageUrl(items, lookup = null) {
  const row = (items || [])[0];
  return pickKitweCatalogProductImageUrl(row, lookup);
}