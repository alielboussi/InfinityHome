import { getFirestore, docIdForRow } from './firestoreDb.js';

export async function probeFirestoreTable(db, table) {
  try {
    const col = db.collection(table);
    let count = 0;
    try {
      const aggregate = await col.count().get();
      count = aggregate.data().count || 0;
    } catch {
      const snap = await col.limit(1).get();
      if (snap.empty) return { table, exists: true, count: 0 };
      const full = await col.get();
      count = full.size;
    }
    return { table, exists: true, count };
  } catch {
    return { table, exists: false, count: 0 };
  }
}

export async function exportFirestoreTablePage(db, table, limit, offset) {
  const snap = await db.collection(table).get();
  const all = snap.docs.map((doc) => {
    const data = doc.data() || {};
    if (data.id == null || data.id === '') {
      return { id: doc.id, ...data };
    }
    return { ...data, id: data.id };
  });
  const rows = all.slice(offset, offset + limit);
  return {
    table,
    exists: true,
    rows,
    offset,
    limit,
    hasMore: offset + limit < all.length,
  };
}

export async function clearFirestoreTable(db, table) {
  const snap = await db.collection(table).limit(500).get();
  if (snap.empty) return { cleared: 0, skipped: false };
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  const hasMore = snap.size === 500;
  return {
    cleared: snap.size,
    skipped: false,
    warning: hasMore ? 'More rows remain; run clear again' : undefined,
  };
}

export async function importFirestoreRows(db, table, rows, mode = 'upsert') {
  if (!rows.length) return { inserted: 0, mode };
  let batch = db.batch();
  let batchCount = 0;
  let inserted = 0;

  const flush = async () => {
    if (!batchCount) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const row of rows) {
    const id = docIdForRow(table, row);
    const ref = db.collection(table).doc(String(id));
    if (mode === 'insert') {
      batch.set(ref, row);
    } else {
      batch.set(ref, row, { merge: true });
    }
    inserted += 1;
    batchCount += 1;
    if (batchCount >= 400) await flush();
  }
  await flush();
  return { inserted, mode };
}

export function getFirestoreBackupMeta() {
  const projectId = process.env.FIREBASE_PROJECT_ID
    || process.env.REACT_APP_FIREBASE_PROJECT_ID
    || null;
  return {
    format: 'infinity-home-db-backup',
    version: 1,
    backend: 'firestore',
    projectId,
    notes: [
      'Exports Firestore collections (business data). Auth users live in Firebase Auth.',
      'Storage files are not included; re-upload product images as needed.',
    ],
  };
}

export async function healthCheckFirestore() {
  const db = getFirestore();
  if (!db) throw new Error('Firestore not configured');
  const snap = await db.collection('laybys').limit(1).get();
  return { ok: true, sampleCount: snap.size };
}
