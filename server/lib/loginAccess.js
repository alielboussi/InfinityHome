import { getFirestore } from './firestoreDb.js';

const COLLECTION = 'app_login_access';
const ADMIN_EMAIL = 'alielboussi00@gmail.com';
const PROTECTED_EMAILS = new Set([ADMIN_EMAIL]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function disabledError() {
  const error = new Error('Your account has been disabled. Contact an administrator.');
  error.status = 403;
  error.code = 'login_disabled';
  return error;
}

export function isLoginAccessAdmin(email) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

export async function getLoginAccessRecord(uid) {
  const db = getFirestore();
  if (!db || !uid) return null;
  const snap = await db.collection(COLLECTION).doc(String(uid)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listLoginAccessRecords() {
  const db = getFirestore();
  if (!db) return [];
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), undefined, { sensitivity: 'base' }));
}

export async function setLoginAccessEnabled({
  uid,
  loginEnabled,
  actorEmail,
}) {
  const db = getFirestore();
  if (!db || !uid) throw new Error('User id is required.');

  const ref = db.collection(COLLECTION).doc(String(uid));
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error('User has not signed in yet. They must log in once before access can be managed.');
  }

  const email = normalizeEmail(existing.data()?.email);
  if (PROTECTED_EMAILS.has(email)) {
    throw new Error('This administrator account cannot be disabled.');
  }

  const now = new Date().toISOString();
  await ref.set({
    login_enabled: Boolean(loginEnabled),
    updated_at: now,
    updated_by: normalizeEmail(actorEmail) || null,
  }, { merge: true });

  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}

/**
 * Register user on first auth and block disabled accounts.
 * Called after Firebase token verification.
 */
export async function assertLoginAllowed(authUser) {
  const uid = String(authUser?.id || authUser?.uid || '').trim();
  const email = normalizeEmail(authUser?.email);
  if (!uid || !email) {
    const error = new Error('Authenticated account has no usable identity.');
    error.status = 401;
    throw error;
  }

  const db = getFirestore();
  if (!db) return { uid, email, login_enabled: true };

  const ref = db.collection(COLLECTION).doc(uid);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const displayName = authUser?.user_metadata?.full_name
    || authUser?.user_metadata?.name
    || authUser?.full_name
    || authUser?.displayName
    || null;

  if (!snap.exists) {
    await ref.set({
      uid,
      email,
      display_name: displayName,
      login_enabled: true,
      created_at: now,
      updated_at: now,
      last_seen_at: now,
    });
    return { uid, email, login_enabled: true };
  }

  const data = snap.data() || {};
  if (data.login_enabled === false) {
    throw disabledError();
  }

  await ref.set({
    email,
    display_name: displayName || data.display_name || null,
    last_seen_at: now,
    updated_at: now,
  }, { merge: true });

  return { uid, email, login_enabled: true };
}

export async function isLoginAllowedForUid(uid) {
  const record = await getLoginAccessRecord(uid);
  if (!record) return true;
  return record.login_enabled !== false;
}
