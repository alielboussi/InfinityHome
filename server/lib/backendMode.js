import { getFirebaseAdminApp } from './firebaseAdmin.js';

/** True when Firebase admin is configured for Firestore access. */
export function isFirebaseBackendEnabled() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return Boolean(getFirebaseAdminApp());
  }
  return true;
}
