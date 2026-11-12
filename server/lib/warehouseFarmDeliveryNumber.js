import { getFirestore } from './firestoreDb.js';

const SEQ_DOC = 'warehouse_farm_delivery_number';
const PREFIX = 'FRM';

function formatFarmDeliveryNumber(seq) {
  const n = Math.max(1, Number(seq) || 1);
  return `${PREFIX}${String(n).padStart(10, '0')}`;
}

function parseFarmSequence(deliveryNumber) {
  const m = String(deliveryNumber || '').trim().match(/^FRM(\d{10})$/i);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

async function bootstrapFromSessions(db) {
  const snap = await db.collection('warehouse_delivery_sessions')
    .orderBy('created_at', 'desc')
    .limit(200)
    .get();
  let max = 0;
  snap.forEach((doc) => {
    const n = parseFarmSequence(doc.data()?.delivery_number);
    if (n > max) max = n;
  });
  return max;
}

/** Farm truck notes: FRM0000000001, FRM0000000002, … */
export async function allocateFarmDeliveryNumber() {
  const db = getFirestore();
  if (!db) throw new Error('Firebase admin not configured');

  return db.runTransaction(async (tx) => {
    const seqRef = db.collection('_sequences').doc(SEQ_DOC);
    const seqSnap = await tx.get(seqRef);
    let value = 0;
    if (seqSnap.exists) {
      value = Number(seqSnap.data()?.value);
      if (!Number.isFinite(value)) value = 0;
      if (value < 1 && seqSnap.data()?.skip_bootstrap !== true) {
        value = await bootstrapFromSessions(db);
      }
    } else {
      value = await bootstrapFromSessions(db);
    }
    const next = value + 1;
    tx.set(seqRef, { value: next, skip_bootstrap: false, updated_at: new Date().toISOString() }, { merge: true });
    return formatFarmDeliveryNumber(next);
  });
}

export { formatFarmDeliveryNumber, parseFarmSequence };
