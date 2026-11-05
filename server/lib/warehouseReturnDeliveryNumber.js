import { getFirestore } from './firestoreDb.js';

const WHR_SEQ = 'warehouse_return_delivery_number_whr';
const CR_SEQ = 'warehouse_return_delivery_number_cr';

function formatWhr(seq) {
  const n = Math.max(1, Number(seq) || 1);
  return `WHR${String(n).padStart(10, '0')}`;
}

function formatCr(seq) {
  const n = Math.max(1, Number(seq) || 1);
  return `CR${String(n).padStart(10, '0')}`;
}

function parseSeq(prefix, deliveryNumber) {
  const re = new RegExp(`^${prefix}(\\d{10})$`, 'i');
  const m = String(deliveryNumber || '').trim().match(re);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

async function bootstrapFromSessions(db, prefix) {
  const snap = await db.collection('warehouse_delivery_sessions')
    .orderBy('created_at', 'desc')
    .limit(300)
    .get();
  let max = 0;
  snap.forEach((doc) => {
    const n = parseSeq(prefix, doc.data()?.delivery_number);
    if (n > max) max = n;
  });
  return max;
}

async function allocateSeq(docId, prefix, formatter) {
  const db = getFirestore();
  if (!db) throw new Error('Firebase admin not configured');

  return db.runTransaction(async (tx) => {
    const seqRef = db.collection('_sequences').doc(docId);
    const seqSnap = await tx.get(seqRef);
    let value = 0;
    if (seqSnap.exists) {
      const data = seqSnap.data() || {};
      value = Number(data.value);
      if (!Number.isFinite(value)) value = 0;
      if (value < 1 && data.skip_bootstrap !== true) {
        value = await bootstrapFromSessions(db, prefix);
      }
    } else {
      value = await bootstrapFromSessions(db, prefix);
    }
    const next = value + 1;
    tx.set(
      seqRef,
      { value: next, skip_bootstrap: false, updated_at: new Date().toISOString() },
      { merge: true },
    );
    return formatter(next);
  });
}

/** Return delivery note without customer on the job (e.g. factory → Kitwe return truck). */
export async function allocateWarehouseReturnDeliveryNumberWhr() {
  return allocateSeq(WHR_SEQ, 'WHR', formatWhr);
}

/** Return delivery note when customer name/phone is on the repair job. */
export async function allocateWarehouseReturnDeliveryNumberCr() {
  return allocateSeq(CR_SEQ, 'CR', formatCr);
}

export async function allocateWarehouseReturnDeliveryNumber({ hasCustomer = false } = {}) {
  return hasCustomer
    ? allocateWarehouseReturnDeliveryNumberCr()
    : allocateWarehouseReturnDeliveryNumberWhr();
}

export { formatWhr, formatCr };
