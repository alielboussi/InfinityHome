import supabase from '../supabase';
import { resolveSessionUserFromAuth } from '../accessControl';

function formatAuthError(message) {
  const msg = String(message || 'Invalid email or password.').trim() || 'Invalid email or password.';
  if (/failed to fetch|network|name.?not.?resolved|load failed|networkerror/i.test(msg)) {
    return 'Cannot reach Supabase Auth (network/DNS). Check your internet connection, then try again. If you use a VPN, try turning it off.';
  }
  const looksInvalid = /invalid|credentials|password|email/i.test(msg);
  if (!looksInvalid) return msg;
  return `${msg} If you signed up with Google, use Continue with Google — those accounts usually have no password.`;
}

/**
 * Email/password login against Supabase Auth (works on localhost and production).
 * Does not depend on the Vercel /api/stocktake-login proxy.
 */
export async function signInWithEmailPassword(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanPassword) {
    return { ok: false, error: 'Email and password are required.' };
  }

  let data = null;
  let error = null;
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    }));
  } catch (err) {
    return { ok: false, error: formatAuthError(err?.message || String(err)) };
  }

  const session = data?.session || null;
  const authUser = data?.user || session?.user || null;
  if (error || !session?.access_token || !authUser?.id) {
    return { ok: false, error: formatAuthError(error?.message) };
  }

  const metadata = authUser.user_metadata || {};
  const user = resolveSessionUserFromAuth({
    id: authUser.id,
    email: authUser.email,
    full_name: metadata.full_name || metadata.name || metadata.display_name || null,
    user_metadata: metadata,
  });

  return { ok: true, user, session };
}
