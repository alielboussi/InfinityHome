// src/utils/staleCache.js
// Lightweight stale-while-revalidate cache backed by memory + localStorage

const mem = new Map();
const PREFIX = 'staleCache:';

function now() { return Date.now(); }

export function cacheGet(key) {
  try {
    const m = mem.get(key);
    if (m && m.expiresAt > now()) return m.value;
  } catch {}
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.expiresAt && parsed.expiresAt > now()) {
      mem.set(key, parsed);
      return parsed.value;
    }
    // expired; clean it
    localStorage.removeItem(PREFIX + key);
  } catch {}
  return null;
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

const staleCache = { cacheGet, cacheSet, cacheClear, cacheTouch, cacheClearAll };
export default staleCache;
