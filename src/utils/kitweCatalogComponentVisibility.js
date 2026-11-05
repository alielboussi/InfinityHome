export const KITWE_CATALOG_LOOSE_META = 'kitwe_catalog_loose';

/** Component sold loose from a Kitwe set (POS) — show in catalog despite set recipe. */
export function isKitweCatalogLooseAssembly(assembly) {
  const meta = assembly?.metadata || {};
  return meta[KITWE_CATALOG_LOOSE_META] === true;
}

export function mergeAssemblyMetadataPatch(existingMeta, patch) {
  const next = { ...(existingMeta || {}) };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  });
  return next;
}
