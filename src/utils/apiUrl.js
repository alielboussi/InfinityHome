/**
 * Resolve /api paths for fetch. On localhost, uses REACT_APP_API_BASE (production Vercel host).
 * On the deployed site, same-origin relative paths are used.
 */

export function getApiBase() {
  return String(process.env.REACT_APP_API_BASE || '').trim().replace(/\/+$/, '');
}

export function isLocalDev() {
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch {
    return false;
  }
}

let warnedMissingBase = false;

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (/^https?:\/\//i.test(path)) return path;
  if (!isLocalDev()) return p;
  const base = getApiBase();
  if (!base) {
    if (!warnedMissingBase && process.env.NODE_ENV === 'development') {
      warnedMissingBase = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[apiUrl] Set REACT_APP_API_BASE in .env.local (e.g. https://www.infinity-home.online) so localhost can call production APIs.',
      );
    }
    return p;
  }
  return `${base}${p}`;
}

export function withApiHeaders(headers = {}) {
  const out = { ...headers };
  const bypass = String(process.env.REACT_APP_VERCEL_BYPASS || '').trim();
  if (bypass) out['x-vercel-protection-bypass'] = bypass;
  return out;
}

/** True when localhost should call remote /api instead of direct Firestore helpers. */
export function shouldUseRemoteApi() {
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  if (forceApi) return true;
  if (isLocalDev()) return Boolean(getApiBase());
  return process.env.NODE_ENV === 'production' || Boolean(getApiBase());
}
