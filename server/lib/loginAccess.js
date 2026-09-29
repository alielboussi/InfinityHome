import { getFirestore } from './firestoreDb.js';
import { defaultMobileAccessGrant, normalizeMobileAccessGrant } from './mobileAccessDefaults.js';

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
    if (loginEnabled === false) {
      throw new Error('This administrator account cannot be disabled.');
    }
    const now = new Date().toISOString();
    await ref.set({
      updated_at: now,
      updated_by: normalizeEmail(actorEmail) || null,
    }, { merge: true });
    const updated = await ref.get();
    return { id: updated.id, ...updated.data() };
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

  const displayName = authUser?.user_metadata?.full_name
    || authUser?.user_metadata?.name
    || authUser?.full_name
    || authUser?.displayName
    || null;

  try {
    const ref = db.collection(COLLECTION).doc(uid);
    const snap = await ref.get();
    const now = new Date().toISOString();

    if (!snap.exists) {
      await ref.set({
        uid,
        email,
        display_name: displayName,
        login_enabled: true,
        created_at: now,
        updated_at: now,
        last_seen_at: now,
        mobile_access: defaultMobileAccessGrant(),
      });
      return { uid, email, login_enabled: true };
    }

    const data = snap.data() || {};
    if (data.login_enabled === false) {
      throw disabledError();
    }

    const patch = {
      email,
      display_name: displayName || data.display_name || null,
      last_seen_at: now,
      updated_at: now,
    };
    if (!data.mobile_access) {
      patch.mobile_access = defaultMobileAccessGrant();
    }
    await ref.set(patch, { merge: true });

    return { uid, email, login_enabled: true };
  } catch (err) {
    if (err?.status === 403 || err?.code === 'login_disabled') throw err;
    console.error('[loginAccess] Firestore check failed; allowing login:', err?.message || err);
    return { uid, email, login_enabled: true };
  }
}

export async function isLoginAllowedForUid(uid) {
  const record = await getLoginAccessRecord(uid);
  if (!record) return true;
  return record.login_enabled !== false;
}

export async function updateMobileAccessGrant({
  uid,
  mobileAccess,
  mobileDisplayName,
  actorEmail,
}) {
  const db = getFirestore();
  if (!db || !uid) throw new Error('User id is required.');
  const ref = db.collection(COLLECTION).doc(String(uid));
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error('User has not signed in yet.');
  }
  const now = new Date().toISOString();
  const patch = {
    updated_at: now,
    mobile_access_updated_by: normalizeEmail(actorEmail) || null,
  };
  if (mobileAccess && typeof mobileAccess === 'object') {
    patch.mobile_access = normalizeMobileAccessGrant(mobileAccess);
  }
  if (mobileDisplayName !== undefined) {
    const trimmed = String(mobileDisplayName || '').trim();
    patch.mobile_display_name = trimmed || null;
  }
  if (!patch.mobile_access && mobileDisplayName === undefined) {
    throw new Error('Nothing to update.');
  }
  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}
