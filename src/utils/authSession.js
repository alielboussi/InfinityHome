import { firebaseEnsureSession } from './firebaseAuthApi';
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
export async function ensureAuthSession() {
  return firebaseEnsureSession();
}

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

  const { waitForFirebaseAuthReady } = await import('./firebaseAuthApi');
  const fbUser = await waitForFirebaseAuthReady();
  if (!fbUser) {
    cacheClearAll();
    clearStaleAppLogin();
    return { ok: false, skipped: false };
  }

  const result = await ensureAuthSession();
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
