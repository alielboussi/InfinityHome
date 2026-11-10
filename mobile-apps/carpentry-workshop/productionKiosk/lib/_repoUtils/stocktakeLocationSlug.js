/** URL slug for a stocktake location name (e.g. "Test Stocktake Lab" → "test-stocktake-lab"). */
export function slugifyLocationName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stocktakeCountPathForLocation(location) {
  const slug = slugifyLocationName(location?.slug || location?.name);
  if (!slug) return '';
  return `/stocktake/count/${slug}`;
}

export function stocktakeCountUrlForLocation(location, origin = '') {
  const path = stocktakeCountPathForLocation(location);
  if (!path) return '';
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${path}`;
}

export function resolveLocationBySlug(locations, slug) {
  const target = String(slug || '').trim().toLowerCase();
  if (!target) return null;
  return (locations || []).find((loc) => slugifyLocationName(loc.name) === target) || null;
}

/** Extract location slug from /stocktake/count/:slug (empty string if missing). */
export function parseStocktakeCountSlug(pathname) {
  const raw = String(pathname || '').split('?')[0].split('#')[0];
  let p = raw;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  const prefix = '/stocktake/count/';
  const lower = p.toLowerCase();
  if (!lower.startsWith(prefix)) return '';
  return decodeURIComponent(p.slice(prefix.length)).trim().toLowerCase();
}

export function isStocktakeCountLocationPath(pathname) {
  return Boolean(parseStocktakeCountSlug(pathname));
}
