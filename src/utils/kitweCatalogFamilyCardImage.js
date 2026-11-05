import {
  floor2FamilyCoverSeaterRank,
  readWarehouseFloor2WipFamilyImageUrl,
  readWarehouseFloor2WipImageUrl,
} from './warehouseFloor2WipImage';
import { rewriteLegacyStorageUrl } from './storageImageUrl';

function imageFromRow(row) {
  const direct = String(row?.image_url || row?.floor2_image_url || '').trim();
  if (direct) return direct;
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return String(
    meta.catalog_image_url || meta.image_url || meta.floor2_wip_image_url || '',
  ).trim();
}

export function normalizeKitweFamilySku(familySku) {
  const sku = String(familySku || '').trim();
  return sku ? sku.toLowerCase() : '';
}

/** Best single-row WIP/catalog image URL (before legacy rewrite). */
export function kitweCatalogRowImageUrl(row) {
  if (!row) return '';
  const direct = imageFromRow(row) || readWarehouseFloor2WipImageUrl(row);
  if (direct) return direct;
  return String(row?.family_image_url || '').trim() || readWarehouseFloor2WipFamilyImageUrl(row);
}

function rewriteCatalogImageUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return rewriteLegacyStorageUrl(trimmed, { bucket: 'productimages' });
}

function pickFromRowsOnly(items) {
  const list = items || [];
  const ranked = [...list].sort(
    (a, b) => floor2FamilyCoverSeaterRank(a?.name) - floor2FamilyCoverSeaterRank(b?.name),
  );
  for (const row of ranked) {
    const url = kitweCatalogRowImageUrl(row);
    if (url) return rewriteCatalogImageUrl(url);
  }
  for (const row of list) {
    const family = String(row?.family_image_url || '').trim()
      || readWarehouseFloor2WipFamilyImageUrl(row);
    if (family) return rewriteCatalogImageUrl(family);
  }
  return '';
}

function lookupUrlForRow(row, lookup) {
  if (!lookup || !row) return '';
  const sku = normalizeKitweFamilySku(row.family_sku);
  if (sku && lookup.bySku?.has(sku)) return lookup.bySku.get(sku);
  const id = String(row.id || '').trim();
  if (id && lookup.byId?.has(id)) return lookup.byId.get(id);
  const rawId = String(row.raw_assembly_id || '').trim();
  if (rawId && lookup.byId?.has(rawId)) return lookup.byId.get(rawId);
  return '';
}

function pickFromCrossPortalLookup(items, lookup) {
  const list = items || [];
  const ranked = [...list].sort(
    (a, b) => floor2FamilyCoverSeaterRank(a?.name) - floor2FamilyCoverSeaterRank(b?.name),
  );
  for (const row of ranked) {
    const url = lookupUrlForRow(row, lookup);
    if (url) return url;
  }
  for (const row of list) {
    const url = lookupUrlForRow(row, lookup);
    if (url) return url;
  }
  return '';
}

/**
 * Index images from /carpentry and /upholstery rows so both portals show the same cover
 * when family_sku or raw/finished assembly ids match.
 */
export function buildKitweCrossPortalImageLookup(carpentryProducts = [], upholsteryProducts = []) {
  const byId = new Map();
  const bySku = new Map();
  const register = (row) => {
    const rawUrl = kitweCatalogRowImageUrl(row);
    if (!rawUrl) return;
    const url = rewriteCatalogImageUrl(rawUrl);
    const id = String(row?.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, url);
    const rawId = String(row?.raw_assembly_id || '').trim();
    if (rawId && !byId.has(rawId)) byId.set(rawId, url);
    const sku = normalizeKitweFamilySku(row?.family_sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, url);
  };
  (carpentryProducts || []).forEach(register);
  (upholsteryProducts || []).forEach(register);
  return { byId, bySku };
}

/** Cover image for a family card on /carpentry and /upholstery (matches mobile manufacture ranking). */
export function pickKitweCatalogFamilyImageUrl(items, lookup = null) {
  const fromGroup = pickFromRowsOnly(items);
  if (fromGroup) return fromGroup;
  if (!lookup) return '';
  return pickFromCrossPortalLookup(items, lookup);
}
