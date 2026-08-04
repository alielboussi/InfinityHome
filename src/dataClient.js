// Firestore data client (table-shaped query API).

import { createFirestoreClient } from './db/firestoreAdapter';
import { firebaseAuth } from './firebase';

let activeClient;

function getClient() {
  if (activeClient) return activeClient;
  activeClient = createFirestoreClient(() => firebaseAuth);
  if (typeof window !== 'undefined') {
    window.__infinityHomeDataClient = activeClient;
  }
  return activeClient;
}

const client = new Proxy({}, {
  get(_target, prop) {
    const backend = getClient();
    const value = backend[prop];
    if (typeof value === 'function') return value.bind(backend);
    return value;
  },
});

export default client;
