/** WIP photo for Warehouse Floor 2 — used by Upholstery/Carpentry production apps only (not Floor 1 catalog). */
export const FLOOR2_WIP_IMAGE_META_KEY = 'floor2_wip_image_url';
export const FLOOR2_WIP_FAMILY_IMAGE_META_KEY = 'floor2_wip_family_image_url';

export function readWarehouseFloor2WipImageUrl(assembly) {
  const meta = assembly?.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  return String(meta[FLOOR2_WIP_IMAGE_META_KEY] || '').trim();
}

export function readWarehouseFloor2WipFamilyImageUrl(assembly) {
  const meta = assembly?.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  return String(meta[FLOOR2_WIP_FAMILY_IMAGE_META_KEY] || '').trim();
}

/**
 * Rank product name for family base card cover fallback:
 * 3 Seater (0) → 2 Seater (1) → Single / 1 Seater (2) → other variants (3).
 */
export function floor2FamilyCoverSeaterRank(name) {
  const n = String(name || '').trim().toLowerCase();
  if (/\b3\s*seater\b/.test(n)) return 0;
  if (/\b2\s*seater\b/.test(n)) return 1;
  if (/\b(single|1)\s*seater\b/.test(n)) return 2;
  return 3;
}

export function mergeWarehouseFloor2WipImageMetadata(existingMeta, imageUrl) {
  const base = existingMeta && typeof existingMeta === 'object' ? { ...existingMeta } : {};
  const url = String(imageUrl || '').trim();
  if (url) {
    base[FLOOR2_WIP_IMAGE_META_KEY] = url;
  } else {
    delete base[FLOOR2_WIP_IMAGE_META_KEY];
  }
  return base;
}

export function mergeWarehouseFloor2WipFamilyImageMetadata(existingMeta, imageUrl) {
  const base = existingMeta && typeof existingMeta === 'object' ? { ...existingMeta } : {};
  const url = String(imageUrl || '').trim();
  if (url) {
    base[FLOOR2_WIP_FAMILY_IMAGE_META_KEY] = url;
  } else {
    delete base[FLOOR2_WIP_FAMILY_IMAGE_META_KEY];
  }
  return base;
}
