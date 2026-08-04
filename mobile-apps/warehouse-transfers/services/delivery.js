import { collection, doc, writeBatch } from 'firebase/firestore';
import { getDb } from '../../shared/firebase';
import { uuid } from '../../shared/uuid';
import { FROM_LOCATION_ID, TO_LOCATION_ID } from '../config';

export async function submitDelivery({ items, userEmail, userName, idempotencyKey }) {
  if (!items.length) {
    throw new Error('Cart is empty. Add at least one product.');
  }

  const db = getDb();
  const sessionId = uuid();
  const now = new Date().toISOString();
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const batch = writeBatch(db);

  const sessionRef = doc(collection(db, 'warehouse_delivery_sessions'), sessionId);
  batch.set(sessionRef, {
    id: sessionId,
    from_location: FROM_LOCATION_ID,
    to_location: TO_LOCATION_ID,
    status: 'submitted',
    created_at: now,
    transfer_datetime: now,
    total_qty: totalQty,
    created_by_email: userEmail || null,
    created_by_name: userName || null,
    metadata: {
      idempotency_key: idempotencyKey,
      created_by_name: userName || null,
      source: 'warehouse_transfers_mobile',
    },
  });

  items.forEach((item) => {
    const entryId = uuid();
    const entryRef = doc(collection(db, 'warehouse_delivery_entries'), entryId);
    batch.set(entryRef, {
      id: entryId,
      session_id: sessionId,
      product_id: item.productId,
      kind: 'product',
      name: item.name,
      sku: item.sku || null,
      quantity: Number(item.quantity),
      created_at: now,
    });
  });

  await batch.commit();
  return { sessionId };
}
