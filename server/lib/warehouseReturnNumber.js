import { getFirestore } from './firestoreDb.js';

const SEQ_DOC = 'warehouse_return_number';
const PREFIX = 'RO';

function formatWarehouseReturnNumber(seq) {
  const n = Math.max(1, Number(seq) || 1);
  return `${PREFIX}${String(n).padStart(10, '0')}`;
}

function parseReturnSequence(returnNumber) {
  const m = String(returnNumber || '').trim().match(/^RO(\d{10})$/i);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

async function bootstrapFromExisting(db) {
  const snap = await db.collection('warehouse_return_orders')
    .orderBy('created_at', 'desc')
    .limit(200)
    .get();
  let max = 0;
  snap.forEach((doc) => {
    const n = parseReturnSequence(doc.data()?.return_number);
    if (n > max) max = n;
  });
  return max;
}

export async function allocateWarehouseReturnNumber() {
  const db = getFirestore();
  if (!db) throw new Error('Firebase admin not configured');

  return db.runTransaction(async (tx) => {
    const seqRef = db.collection('_sequences').doc(SEQ_DOC);
    const seqSnap = await tx.get(seqRef);
    let value = 0;
    if (seqSnap.exists) {
      const data = seqSnap.data() || {};
      value = Number(data.value);
      if (!Number.isFinite(value)) value = 0;
      if (value < 1 && data.skip_bootstrap !== true) {
        value = await bootstrapFromExisting(db);
      }
    } else {
      value = await bootstrapFromExisting(db);
    }
    const next = value + 1;
    tx.set(
      seqRef,
      { value: next, skip_bootstrap: false, updated_at: new Date().toISOString() },
      { merge: true },
    );
    return formatWarehouseReturnNumber(next);
  });
}

export { formatWarehouseReturnNumber, parseReturnSequence };
