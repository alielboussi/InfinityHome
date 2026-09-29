import { getFirestore } from './firestoreDb.js';

const SEQ_DOC = 'warehouse_delivery_number';
const PREFIX = 'WH';

function formatWarehouseDeliveryNumber(seq) {
  const n = Math.max(1, Number(seq) || 1);
  return `${PREFIX}${String(n).padStart(10, '0')}`;
}

function parseWarehouseDeliverySequence(deliveryNumber) {
  const m = String(deliveryNumber || '').trim().match(/^WH(\d{10})$/i);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

async function bootstrapSequenceFromExisting(db) {
  const snap = await db.collection('warehouse_delivery_sessions')
    .orderBy('created_at', 'desc')
    .limit(200)
    .get();
  let max = 0;
  snap.forEach((doc) => {
    const n = parseWarehouseDeliverySequence(doc.data()?.delivery_number);
    if (n > max) max = n;
  });
  return max;
}

/** Next delivery note: WH0000000001, WH0000000002, … */
export async function allocateWarehouseDeliveryNumber() {
  const db = getFirestore();
  if (!db) throw new Error('Firebase admin not configured');

  return db.runTransaction(async (tx) => {
    const seqRef = db.collection('_sequences').doc(SEQ_DOC);
    const seqSnap = await tx.get(seqRef);
    let value = Number(seqSnap.data()?.value);
    if (!Number.isFinite(value) || value < 1) {
      value = await bootstrapSequenceFromExisting(db);
    }
    const next = value + 1;
    tx.set(seqRef, { value: next, updated_at: new Date().toISOString() }, { merge: true });
    return formatWarehouseDeliveryNumber(next);
  });
}

export { formatWarehouseDeliveryNumber, parseWarehouseDeliverySequence };
