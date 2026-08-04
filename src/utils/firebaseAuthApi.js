import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseAuth } from '../firebase';
import { resolveSessionUserFromAuth } from '../accessControl';

function formatAuthError(message) {
  const msg = String(message || 'Invalid email or password.').trim() || 'Invalid email or password.';
  if (/failed to fetch|network|networkerror/i.test(msg)) {
    return 'Cannot reach Firebase Auth. Check your internet connection.';
  }
  return msg;
}

export function userFromFirebaseAuth(firebaseUser) {
  if (!firebaseUser?.email) return null;
  return resolveSessionUserFromAuth({
    id: firebaseUser.uid,
    email: firebaseUser.email,
    full_name: firebaseUser.displayName || null,
    user_metadata: {
      full_name: firebaseUser.displayName || null,
      name: firebaseUser.displayName || null,
    },
  });
}

export async function firebaseSignInWithEmailPassword(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanPassword) {
    return { ok: false, error: 'Email and password are required.' };
  }
  try {
    const credential = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, cleanPassword);
    const user = userFromFirebaseAuth(credential.user);
    const token = await credential.user.getIdToken();
    return {
      ok: true,
      user,
      session: {
        access_token: token,
        user: {
          id: credential.user.uid,
          email: credential.user.email,
          user_metadata: credential.user.displayName ? { full_name: credential.user.displayName } : {},
        },
      },
    };
  } catch (err) {
    return { ok: false, error: formatAuthError(err?.message || String(err)) };
  }
}

export async function firebaseSignInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(firebaseAuth, provider);
  const user = userFromFirebaseAuth(credential.user);
  const token = await credential.user.getIdToken();
  return {
    ok: true,
    user,
    session: {
      access_token: token,
      user: {
        id: credential.user.uid,
        email: credential.user.email,
        user_metadata: credential.user.displayName ? { full_name: credential.user.displayName } : {},
      },
    },
  };
}

export async function firebaseSignOut() {
  await signOut(firebaseAuth);
}

export async function firebaseGetAccessToken(forceRefresh = false) {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function waitForFirebaseAuthReady(timeoutMs = 8000) {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(firebaseAuth.currentUser || null);
    }, timeoutMs);
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

export async function firebaseEnsureSession() {
  const user = await waitForFirebaseAuthReady();
  if (!user) return { ok: false, session: null, refreshed: false };
  try {
    const token = await user.getIdToken(false);
    return {
      ok: Boolean(token),
      session: {
        access_token: token,
        user: {
          id: user.uid,
          email: user.email,
        },
      },
      refreshed: false,
    };
  } catch {
    return { ok: false, session: null, refreshed: false };
  }
}

export async function firebaseResolveAppUserFromSession() {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { ok: false, error: 'No Google session found.' };
  }
  const appUser = userFromFirebaseAuth(user);
  if (!appUser) {
    return { ok: false, error: 'Authenticated account has no usable email.' };
  }
  const token = await user.getIdToken();
  return {
    ok: true,
    user: appUser,
    session: { access_token: token },
  };
}
