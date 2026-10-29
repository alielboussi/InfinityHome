import { getFirestore } from './firestoreDb.js';

const SEQ_DOC = 'warehouse_storage_number';
const PREFIX = 'WST';

function formatWarehouseStorageNumber(seq) {
  const n = Math.max(1, Number(seq) || 1);
  return `${PREFIX}${String(n).padStart(10, '0')}`;
}

export async function allocateWarehouseStorageNumber() {
  const db = getFirestore();
  if (!db) throw new Error('Firebase admin not configured');

  return db.runTransaction(async (tx) => {
    const seqRef = db.collection('_sequences').doc(SEQ_DOC);
    const seqSnap = await tx.get(seqRef);
    let value = Number(seqSnap.exists ? seqSnap.data()?.value : 0);
    if (!Number.isFinite(value) || value < 0) value = 0;
    const next = value + 1;
    tx.set(
      seqRef,
      { value: next, updated_at: new Date().toISOString() },
      { merge: true },
    );
    return formatWarehouseStorageNumber(next);
  });
}

export { formatWarehouseStorageNumber };
