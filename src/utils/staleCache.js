// src/utils/staleCache.js
// Lightweight stale-while-revalidate cache backed by memory + localStorage

const mem = new Map();
const PREFIX = 'staleCache:';

function now() { return Date.now(); }

function readRecord(key) {
  try {
    const m = mem.get(key);
    if (m && m.value !== undefined) return m;
  } catch {}
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.value === undefined) return null;
    mem.set(key, parsed);
    return parsed;
  } catch {}
  return null;
}

export function cacheGet(key) {
  const rec = readRecord(key);
  if (!rec) return null;
  if (rec.expiresAt && rec.expiresAt <= now()) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
    try { mem.delete(key); } catch {}
    return null;
  }
  return rec.value;
}

/** Cached value even after TTL — paint immediately, then refresh in the background. */
export function cachePeek(key) {
  const rec = readRecord(key);
  return rec && rec.value !== undefined ? rec.value : null;
}

export const PORTAL_SWR_TTL_MS = 10 * 60 * 1000;

/**
 * Instant revisit: apply snapshot, skip spinner. Returns true when UI can paint now.
 */
export function applyPortalSnapshot(key, apply, setLoading) {
  try {
    const snap = cachePeek(key);
    if (snap == null) {
      if (typeof setLoading === 'function') setLoading(true);
      return false;
    }
    apply(snap);
    if (typeof setLoading === 'function') setLoading(false);
    return true;
  } catch {
    if (typeof setLoading === 'function') setLoading(true);
    return false;
  }
}

export function cacheSet(key, value, ttlMs = 5 * 60 * 1000) {
  const rec = { value, expiresAt: now() + Math.max(10_000, ttlMs) };
  try { mem.set(key, rec); } catch {}
  try { localStorage.setItem(PREFIX + key, JSON.stringify(rec)); } catch {}
}

export function cacheClear(key) {
  try { mem.delete(key); } catch {}
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

export function cacheTouch(key, ttlMs = 5 * 60 * 1000) {
  const v = cacheGet(key);
  if (v !== null && v !== undefined) cacheSet(key, v, ttlMs);
}

export function cacheClearAll() {
  try { mem.clear(); } catch {}
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
  } catch {}
}

const staleCache = {
  cacheGet,
  cachePeek,
  cacheSet,
  cacheClear,
  cacheTouch,
  cacheClearAll,
  applyPortalSnapshot,
  PORTAL_SWR_TTL_MS,
};
export default staleCache;
