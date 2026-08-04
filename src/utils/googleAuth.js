import { firebaseSignInWithGoogle, firebaseResolveAppUserFromSession, firebaseGetAccessToken } from './firebaseAuthApi';
import { resolveSessionUserFromAuth } from '../accessControl';

function normalizeReturnPath(returnPath = '/login') {
  const path = String(returnPath || '/login').trim() || '/login';
  return path.startsWith('/') ? path : `/${path}`;
}

export function getGoogleAuthRedirectTo(nextTargetOrOptions = '', maybeOptions = {}) {
  const options = typeof nextTargetOrOptions === 'object' && nextTargetOrOptions !== null
    ? nextTargetOrOptions
    : { nextTarget: nextTargetOrOptions, ...maybeOptions };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams();
  params.set('oauth', 'google');
  if (options.nextTarget) params.set('next', String(options.nextTarget));
  const returnPath = normalizeReturnPath(options.returnPath || '/login');
  return `${origin}${returnPath}?${params.toString()}`;
}

export async function startGoogleSignIn() {
  return firebaseSignInWithGoogle();
}

export async function resolveAppUserFromSession() {
  const local = await firebaseResolveAppUserFromSession();
  if (!local.ok) return local;

  const accessToken = await firebaseGetAccessToken();
  if (!accessToken) {
    return { ok: false, error: 'No Google session found.' };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
  try {
    const response = await fetch('/api/auth-profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: controller?.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok && payload?.user) {
      return { ok: true, user: resolveSessionUserFromAuth(payload.user), session: local.session };
    }
  } catch {
    // Fall through to client-side resolution.
  } finally {
    if (timer) clearTimeout(timer);
  }

  return local;
}

export function hasOAuthReturnParams() {
  return false;
}

export function isFirebaseGooglePopupMode() {
  return true;
}
