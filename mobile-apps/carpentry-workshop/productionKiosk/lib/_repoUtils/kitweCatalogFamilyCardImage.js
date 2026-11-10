import {
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

/** Best single-row WIP/catalog image URL (before legacy rewrite). Never uses family WIP. */
export function kitweCatalogRowImageUrl(row) {
  if (!row) return '';
  return imageFromRow(row) || readWarehouseFloor2WipImageUrl(row);
}

function rewriteCatalogImageUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return rewriteLegacyStorageUrl(trimmed, { bucket: 'productimages' });
}

/**
 * Index per-product images from /carpentry and /upholstery (raw ↔ finished id only — no SKU bleed).
 */
export function buildKitweCrossPortalImageLookup(carpentryProducts = [], upholsteryProducts = []) {
  const byId = new Map();
  const register = (row) => {
    const rawUrl = kitweCatalogRowImageUrl(row);
    if (!rawUrl) return;
    const url = rewriteCatalogImageUrl(rawUrl);
    const id = String(row?.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, url);
    const rawId = String(row?.raw_assembly_id || '').trim();
    if (rawId && !byId.has(rawId)) byId.set(rawId, url);
  };
  (carpentryProducts || []).forEach(register);
  (upholsteryProducts || []).forEach(register);
  return { byId };
}

/** Cover for one catalog product card — variant WIP only. */
export function pickKitweCatalogProductImageUrl(row, lookup = null) {
  const fromRow = kitweCatalogRowImageUrl(row);
  if (fromRow) return rewriteCatalogImageUrl(fromRow);
  if (!lookup || !row) return '';
  const id = String(row.id || '').trim();
  if (id && lookup.byId?.has(id)) return lookup.byId.get(id);
  const rawId = String(row.raw_assembly_id || '').trim();
  if (rawId && lookup.byId?.has(rawId)) return lookup.byId.get(rawId);
  return '';
}

/** Grid helper (one product per card). */
export function pickKitweCatalogFamilyImageUrl(items, lookup = null) {
  const row = (items || [])[0];
  return pickKitweCatalogProductImageUrl(row, lookup);
}
