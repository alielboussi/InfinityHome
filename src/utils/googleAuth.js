import supabase from '../supabase';
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

export async function startGoogleSignIn(nextTargetOrOptions = '', maybeOptions = {}) {
  const redirectTo = getGoogleAuthRedirectTo(nextTargetOrOptions, maybeOptions);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });
  if (error) throw error;
  return data;
}

function userFromAuthSession(session) {
  const authUser = session?.user || null;
  if (!authUser?.email) return null;
  const metadata = authUser.user_metadata || {};
  return resolveSessionUserFromAuth({
    id: authUser.id,
    email: authUser.email,
    full_name: metadata.full_name || metadata.name || metadata.display_name || null,
    user_metadata: metadata,
  });
}

/**
 * Resolve app user from the current Supabase session.
 * Uses hardcoded UUID/email maps client-side. Optionally consults /api/auth-profile
 * with a short timeout; never blocks login on localhost/API outages.
 */
export async function resolveAppUserFromSession() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session || null;
  const accessToken = session?.access_token;
  if (!accessToken) {
    return { ok: false, error: 'No Google session found.' };
  }

  const localUser = userFromAuthSession(session);
  if (!localUser) {
    return {
      ok: false,
      error: 'Authenticated account has no usable email.',
      email: session?.user?.email || null,
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
  try {
    const response = await fetch('/api/auth-profile', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: controller?.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok && payload?.user) {
      return { ok: true, user: resolveSessionUserFromAuth(payload.user), session };
    }
  } catch (_) {
    // Fall through to client-side resolution.
  } finally {
    if (timer) clearTimeout(timer);
  }

  return { ok: true, user: localUser, session };
}

export function hasOAuthReturnParams() {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search || '');
  if (search.get('oauth') === 'google' || search.get('code') || search.get('error_description') || search.get('error')) {
    return true;
  }
  const hash = String(window.location.hash || '').replace(/^#/, '');
  if (!hash) return false;
  const hashParams = new URLSearchParams(hash);
  return Boolean(
    hashParams.get('access_token')
    || hashParams.get('refresh_token')
    || hashParams.get('error_description')
    || hashParams.get('error')
  );
}
