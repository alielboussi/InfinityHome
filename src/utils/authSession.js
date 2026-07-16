import supabase from '../supabase';
import { cacheClearAll } from './staleCache';

const CACHE_GENERATION_KEY = 'app:cacheGeneration';
const CACHE_GENERATION = '2026-06-27-session-v1';

function isLoggedInLocally() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && (parsed.id || parsed.email));
  } catch {
    return false;
  }
}

function hasTabAuth() {
  try {
    return sessionStorage.getItem('bestrest:tabAuthed:v1') === '1';
  } catch {
    return false;
  }
}

export function ensureCacheGeneration() {
  try {
    const stored = localStorage.getItem(CACHE_GENERATION_KEY);
    if (stored === CACHE_GENERATION) return false;
    cacheClearAll();
    localStorage.setItem(CACHE_GENERATION_KEY, CACHE_GENERATION);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSupabaseSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
    const stillValid = Boolean(session?.access_token)
      && (!expiresAtMs || expiresAtMs > Date.now() + 60_000);

    if (stillValid) {
      return { ok: true, session, refreshed: false };
    }

    if (session?.refresh_token) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session?.access_token) {
        return { ok: true, session: refreshed.session, refreshed: true };
      }
    }

    return { ok: false, session: null, refreshed: false };
  } catch {
    return { ok: false, session: null, refreshed: false };
  }
}

/**
 * Restore Supabase auth for users who still have local login state.
 * Clears stale data caches when the session was missing or refreshed.
 */
export function clearStaleAppLogin() {
  try {
    localStorage.removeItem('user');
  } catch {}
  try {
    sessionStorage.removeItem('bestrest:tabAuthed:v1');
  } catch {}
}

export async function bootstrapAppAuth() {
  const genBumped = ensureCacheGeneration();

  if (!isLoggedInLocally() || !hasTabAuth()) {
    return { ok: true, skipped: true };
  }

  const result = await ensureSupabaseSession();
  if (!result.ok) {
    cacheClearAll();
    clearStaleAppLogin();
    return { ok: false, skipped: false };
  }

  if (result.refreshed || genBumped) {
    cacheClearAll();
  }

  return { ok: true, skipped: false, refreshed: result.refreshed };
}
