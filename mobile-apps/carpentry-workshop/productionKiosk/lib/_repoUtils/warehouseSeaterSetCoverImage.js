import { isReclinerCatalogProduct } from './isReclinerCatalogProduct.js';
import { resolveWarehouseCategoryName } from './warehouseCategoryLookup.js';

const SEATER_PRODUCT_PRESETS = ['3 Seater', '2 Seater', 'Single Seater', 'Lounge Chair'];

function inferSeaterPresetFromProductName(productName) {
  const n = String(productName || '').trim();
  if (!n) return '';
  const sorted = [...SEATER_PRODUCT_PRESETS].sort((a, b) => b.length - a.length);
  for (const preset of sorted) {
    const suffix = ` ${preset}`;
    if (n.endsWith(suffix) || n.toLowerCase() === preset.toLowerCase()) return preset;
  }
  return '';
}

const SEATER_SET_CATEGORY_NAMES = new Set([
  '3 seaters',
  '2 seaters',
  'single seaters',
  'lounge chairs',
]);

const SEATER_PRESET_SUFFIXES = new Set([
  '3 Seater',
  '2 Seater',
  'Single Seater',
  'Lounge Chair',
]);

export function assemblyImageUrlFromRow(assembly) {
  const candidates = [
    assembly?.image_url,
    assembly?.thumbnail_url,
    assembly?.cover_image_url,
    assembly?.photo_url,
  ];
  const hit = candidates.find((v) => v && String(v).trim());
  return hit ? String(hit).trim() : '';
}

function categoryNameForAssembly(assembly, categoryIndex) {
  return resolveWarehouseCategoryName(assembly?.category_id, categoryIndex) || '';
}

/** True for seater / recliner warehouse products (set line or single SKU). */
export function isSeaterOrReclinerCatalogComponentByName({ productName, categoryName } = {}) {
  const name = String(productName || '');
  const cat = String(categoryName || '').trim().toLowerCase();
  if (SEATER_SET_CATEGORY_NAMES.has(cat)) return true;
  if (isReclinerCatalogProduct({ productName: name, categoryName })) return true;
  const preset = inferSeaterPresetFromProductName(name);
  if (SEATER_PRESET_SUFFIXES.has(preset)) return true;
  return false;
}

export function isSeaterOrReclinerCatalogComponent(assembly, categoryIndex) {
  if (!assembly) return false;
  return isSeaterOrReclinerCatalogComponentByName({
    productName: assembly.name,
    categoryName: categoryNameForAssembly(assembly, categoryIndex),
  });
}

/** True when every set component is a seater or recliner line (3+2+1 style sets). */
export function isSeaterOrReclinerComponentSet(assemblies, categoryIndex) {
  const list = (assemblies || []).filter(Boolean);
  if (!list.length) return false;
  return list.every((row) => isSeaterOrReclinerCatalogComponent(row, categoryIndex));
}

export function isThreeSeaterCatalogComponent(assembly, categoryIndex) {
  if (!assembly) return false;
  const name = String(assembly.name || '');
  const categoryName = categoryNameForAssembly(assembly, categoryIndex);
  if (inferSeaterPresetFromProductName(name) === '3 Seater') return true;
  if (String(categoryName).trim().toLowerCase() === '3 seaters') return true;
  if (/\b3\s*[- ]?\s*seater\b/i.test(name)) return true;
  return false;
}

/** Pick the 3-seater component row to supply the set thumbnail. */
export function pickThreeSeaterCoverAssembly(assemblies, categoryIndex) {
  const threeSeaters = (assemblies || []).filter((row) => isThreeSeaterCatalogComponent(row, categoryIndex));
  if (!threeSeaters.length) return null;
  return threeSeaters.find((row) => assemblyImageUrlFromRow(row)) || threeSeaters[0];
}

/**
 * @returns {string|null|undefined} cover URL, null when seater set but no 3-seater image, undefined when not a seater set
 */
export function resolveSeaterSetCoverImageUrl(componentAssemblies, categoryIndex) {
  if (!isSeaterOrReclinerComponentSet(componentAssemblies, categoryIndex)) return undefined;
  const pick = pickThreeSeaterCoverAssembly(componentAssemblies, categoryIndex);
  if (!pick) return null;
  return assemblyImageUrlFromRow(pick) || null;
}

/**
 * Catalog list/detail image: seater/recliner sets always show the 3-seater component photo.
 */
export function resolveWarehouseCatalogAssemblyImageUri(assembly, { setComponentAssemblies, categoryIndex } = {}) {
  if (setComponentAssemblies?.length && categoryIndex) {
    const cover = resolveSeaterSetCoverImageUrl(setComponentAssemblies, categoryIndex);
    if (cover !== undefined) return cover;
  }
  return assemblyImageUrlFromRow(assembly) || null;
}
