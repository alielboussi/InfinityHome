import { verifyFirebaseIdToken } from './firebaseAdmin.js';

/**
 * Verify Authorization: Bearer token from Firebase Auth.
 * Returns { id, email, user_metadata } or null.
 */
export async function verifyBearerUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const decoded = await verifyFirebaseIdToken(token);
  if (decoded?.uid && decoded?.email) {
    return {
      id: decoded.uid,
      email: decoded.email,
      user_metadata: decoded.name ? { full_name: decoded.name } : {},
    };
  }

  return null;
}

/**
 * Like verifyBearerUser but throws 401-style errors for handlers.
 */
export async function requireBearerUser(req) {
  try {
    const user = await verifyBearerUser(req);
    if (!user?.id || !user?.email) {
      const error = new Error('Authentication required');
      error.status = 401;
      throw error;
    }
    return user;
  } catch (err) {
    if (err.status) throw err;
    const error = new Error(err?.message || 'Invalid session');
    error.status = 401;
    throw error;
  }
}
