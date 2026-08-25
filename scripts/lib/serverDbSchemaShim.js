import db from './serverDataClientShim.js';

export const DB_SCHEMA = 'public';

export function fromPublic(table) {
  return db.schema(DB_SCHEMA).from(table);
}

export function storageSchema() {
  return db.storage;
}
