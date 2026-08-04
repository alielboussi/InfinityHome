import admin from 'firebase-admin';
import { getFirebaseAdminApp } from './firebaseAdmin.js';

const COMPOSITE_DOC_IDS = {
  product_location_prices: ['product_id', 'location_id'],
  combo_location_prices: ['combo_id', 'location_id'],
  product_locations: ['product_id', 'location_id'],
  combo_locations: ['combo_id', 'location_id'],
  opening_stock_entries: ['session_id', 'product_id'],
  closing_stock_entries: ['session_id', 'product_id'],
  inventory: ['product_id', 'location'],
  stock_transfer_entries: ['session_id', 'product_id'],
};

const FIELD_DOC_IDS = {
  user_acl: 'user_uid',
  stocktake_location_state: 'location_id',
  auth_user_map: 'public_user_id',
  product_images: 'product_id',
};

export function getFirestore() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return admin.firestore();
}

export function docIdForRow(table, row) {
  const composite = COMPOSITE_DOC_IDS[table];
  if (composite) {
    const parts = composite.map((key) => row[key]);
    if (parts.some((part) => part == null || part === '')) {
      throw new Error(`Missing composite key for ${table}`);
    }
    return parts.map((part) => String(part)).join('_');
  }
  const field = FIELD_DOC_IDS[table];
  if (field) {
    const value = row[field];
    if (value == null || value === '') throw new Error(`Missing ${field} for ${table}`);
    return String(value);
  }
  if (row.id != null && row.id !== '') return String(row.id);
  throw new Error(`No document id for ${table}`);
}

export function collectionRef(db, table) {
  return db.collection(table);
}

export function docRef(db, table, rowOrId) {
  const id = typeof rowOrId === 'object' ? docIdForRow(table, rowOrId) : String(rowOrId);
  return db.collection(table).doc(id);
}

async function scanMaxNumericId(db, table) {
  const snap = await db.collection(table).get();
  let max = 0;
  snap.forEach((doc) => {
    const value = Number(doc.data()?.id ?? doc.id);
    if (Number.isFinite(value) && value > max) max = value;
  });
  return max;
}

/** One-time (or lazy) sequence bootstrap from existing collection max id. */
export async function ensureSequenceInitialized(db, table) {
  const seqRef = db.collection('_sequences').doc(table);
  const existing = await seqRef.get();
  if (existing.exists && Number.isFinite(Number(existing.data()?.value))) {
    return Number(existing.data().value);
  }
  const max = await scanMaxNumericId(db, table);
  await seqRef.set({ value: max, initialized_at: new Date().toISOString() }, { merge: true });
  return max;
}

/** Allocate next integer primary key inside a Firestore transaction. */
export async function allocateNumericId(db, table, tx) {
  const seqRef = db.collection('_sequences').doc(table);
  const seqSnap = await tx.get(seqRef);
  if (!seqSnap.exists || !Number.isFinite(Number(seqSnap.data()?.value))) {
    throw new Error(`Sequence for ${table} is not initialized`);
  }
  const next = Number(seqSnap.data().value) + 1;
  tx.set(seqRef, { value: next }, { merge: true });
  return next;
}

export async function queryCollectionWhere(db, table, filters = []) {
  let q = db.collection(table);
  for (const filter of filters) {
    q = q.where(filter.field, filter.op, filter.value);
  }
  const snap = await q.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function queryWhereIn(db, table, field, values = []) {
  const unique = [...new Set((values || []).filter((v) => v != null && v !== ''))];
  if (!unique.length) return [];
  const results = [];
  const chunkSize = 30;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const snap = await db.collection(table).where(field, 'in', chunk).get();
    snap.forEach((doc) => results.push({ id: doc.id, ...doc.data() }));
  }
  return results;
}

export async function insertRows(db, table, rows = []) {
  const batch = db.batch();
  const written = [];
  for (const row of rows) {
    const id = docIdForRow(table, row);
    const ref = db.collection(table).doc(id);
    batch.set(ref, row);
    written.push({ ...row, id: row.id ?? id });
  }
  await batch.commit();
  return written;
}

export async function deleteWhereIn(db, table, field, values = []) {
  const rows = await queryWhereIn(db, table, field, values);
  if (!rows.length) return 0;
  const batch = db.batch();
  rows.forEach((row) => batch.delete(db.collection(table).doc(String(row.id))));
  await batch.commit();
  return rows.length;
}

export async function updateWhereIn(db, table, field, values, patch) {
  const rows = await queryWhereIn(db, table, field, values);
  if (!rows.length) return 0;
  const batch = db.batch();
  rows.forEach((row) => {
    batch.set(db.collection(table).doc(String(row.id)), { ...row, ...patch }, { merge: true });
  });
  await batch.commit();
  return rows.length;
}
