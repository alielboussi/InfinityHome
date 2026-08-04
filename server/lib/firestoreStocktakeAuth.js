import { verifyFirebaseIdToken } from './firebaseAdmin.js';

function getFirebaseApiKey() {
  return String(
    process.env.REACT_APP_FIREBASE_API_KEY
    || process.env.FIREBASE_API_KEY
    || '',
  ).trim();
}

async function signInWithFirebasePassword(email, password) {
  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    return { data: null, error: { message: 'Firebase API key not configured' } };
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Invalid email or password.';
    return { data: null, error: { message } };
  }

  const authUser = {
    id: payload.localId,
    email: payload.email,
    user_metadata: payload.displayName ? { full_name: payload.displayName } : {},
  };

  return {
    data: {
      user: authUser,
      session: {
        access_token: payload.idToken,
        refresh_token: payload.refreshToken,
        expires_at: Number(payload.expiresIn)
          ? Math.floor(Date.now() / 1000) + Number(payload.expiresIn)
          : null,
        token_type: 'bearer',
      },
    },
    error: null,
  };
}

export function createFirestoreAnonClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }) {
        const result = await signInWithFirebasePassword(email, password);
        if (result.error) return { data: { session: null, user: null }, error: result.error };
        return {
          data: {
            session: result.data.session,
            user: result.data.user,
          },
          error: null,
        };
      },
      async getUser(token) {
        const decoded = await verifyFirebaseIdToken(token);
        if (!decoded?.uid) {
          return { data: { user: null }, error: { message: 'Invalid session' } };
        }
        return {
          data: {
            user: {
              id: decoded.uid,
              email: decoded.email,
              user_metadata: decoded.name ? { full_name: decoded.name } : {},
            },
          },
          error: null,
        };
      },
    },
  };
}
