const DEFAULT_PUBLIC_ORIGIN = 'https://www.infinity-home.online';

export function resolvePublicAppOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }
  return String(
    process.env.PUBLIC_APP_ORIGIN
    || process.env.REACT_APP_CANONICAL_ORIGIN
    || process.env.REACT_APP_API_BASE
    || DEFAULT_PUBLIC_ORIGIN,
  ).replace(/\/$/, '');
}

/** Short stable link — redirects to a fresh signed layby PDF on click. */
export function buildLaybyPdfShortLink(customerId, { origin } = {}) {
  const id = String(customerId || '').trim();
  if (!id) return '';
  const base = String(origin || resolvePublicAppOrigin()).replace(/\/$/, '');
  return `${base}/l/${encodeURIComponent(id)}`;
}
