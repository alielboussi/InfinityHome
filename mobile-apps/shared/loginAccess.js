import { API_BASE, getFirebaseIdToken } from './firebase';

export async function verifyMobileLoginAccess() {
  const token = await getFirebaseIdToken();
  if (!token) {
    return { ok: false, reason: 'auth', error: 'You must be signed in.' };
  }

  const apiBase = String(process.env.EXPO_PUBLIC_API_BASE || API_BASE || '').replace(/\/+$/, '');
  const url = `${apiBase}/api/auth-profile`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 403) {
      return {
        ok: false,
        reason: 'disabled',
        error: payload?.error || 'Your account has been disabled. Contact an administrator.',
      };
    }
    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        reason: 'server',
        error: payload?.error || `Login check failed (${response.status})`,
      };
    }
    return { ok: true, user: payload?.user || null };
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      error: err?.message || 'Unable to verify login access.',
    };
  }
}

/** Only disabled accounts should force a sign-out; network issues keep the session. */
export function shouldForceSignOutForAccessCheck(access) {
  return Boolean(access && access.ok === false && access.reason === 'disabled');
}
