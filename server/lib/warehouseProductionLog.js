import { getFirestore } from './firestoreDb.js';
import { newUuid } from './uuid.js';

const COLLECTION = 'warehouse_production_log';

function getDb() {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');
  return db;
}

function actorFields(user) {
  return {
    user_uid: String(user?.id || user?.uid || '').trim() || null,
    user_email: String(user?.email || '').trim().toLowerCase() || null,
    user_display_name: String(
      user?.full_name || user?.display_name || user?.name || user?.email || '',
    ).trim() || null,
  };
}

export async function logWarehouseProductionCreate({
  user,
  packet,
  initialQuantity,
  warehouseLocationId,
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    event_type: 'create',
    packet_id: packet?.id || null,
    sku: packet?.sku || null,
    name: packet?.name || null,
    qty_added: Math.max(0, Number(initialQuantity) || 0),
    qty_before: 0,
    qty_after: Math.max(0, Number(initialQuantity) || 0),
    warehouse_location_id: warehouseLocationId || null,
    source: 'warehouse_production_kiosk',
    created_at: now,
    ...actorFields(user),
  };
  await db.collection(COLLECTION).doc(id).set(row);
  return row;
}

export async function logWarehouseProductionStockIncrease({
  user,
  packet,
  delta,
  qtyBefore,
  qtyAfter,
  warehouseLocationId,
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    event_type: 'stock_increase',
    packet_id: packet?.id || null,
    sku: packet?.sku || null,
    name: packet?.name || null,
    qty_added: Math.max(0, Number(delta) || 0),
    qty_before: Math.max(0, Number(qtyBefore) || 0),
    qty_after: Math.max(0, Number(qtyAfter) || 0),
    warehouse_location_id: warehouseLocationId || null,
    source: 'warehouse_production_kiosk',
    created_at: now,
    ...actorFields(user),
  };
  await db.collection(COLLECTION).doc(id).set(row);
  return row;
}

export async function listWarehouseProductionLog({ limit = 500, eventType } = {}) {
  const db = getDb();
  const snap = await db.collection(COLLECTION)
    .orderBy('created_at', 'desc')
    .limit(Math.min(1000, limit))
    .get();
  let rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (eventType) {
    rows = rows.filter((row) => row.event_type === eventType);
  }
  return rows;
}
