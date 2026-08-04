// Firestore table helpers (legacy name: public schema).
import db from './dataClient';

export const DB_SCHEMA = 'public';

export function fromPublic(table) {
  return db.schema(DB_SCHEMA).from(table);
}

export function storageSchema() {
  return db.storage;
}
