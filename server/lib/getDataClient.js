import { createFirestoreServerClient } from './firestoreServerClient.js';

/** Shared DB accessor: Firestore server client. */
export function getDataClient() {
  const client = createFirestoreServerClient();
  if (!client) {
    const error = new Error('Firebase admin not configured (FIREBASE_SERVICE_ACCOUNT)');
    error.status = 500;
    throw error;
  }
  return client;
}

export function isUsingFirebaseData() {
  return Boolean(createFirestoreServerClient());
}
