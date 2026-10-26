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

function normalizeProductionLogSource(source) {
  const raw = String(source || '').trim();
  if (raw === 'warehouse_production_app') return 'warehouse_production_app';
  if (raw === 'warehouse_production_kiosk') return 'warehouse_production_kiosk';
  return 'warehouse_production_app';
}

export async function logWarehouseProductionCreate({
  user,
  packet,
  assembly,
  initialQuantity,
  warehouseLocationId,
  source,
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = newUuid();
  const sku = packet?.sku || assembly?.family_sku || assembly?.sku || null;
  const name = packet?.name || assembly?.name || null;
  const row = {
    id,
    event_type: 'create',
    packet_id: packet?.id || null,
    assembly_id: assembly?.id || null,
    sku,
    name,
    qty_added: Math.max(0, Number(initialQuantity) || 0),
    qty_before: 0,
    qty_after: Math.max(0, Number(initialQuantity) || 0),
    warehouse_location_id: warehouseLocationId || null,
    source: normalizeProductionLogSource(source),
    created_at: now,
    ...actorFields(user),
  };
  await db.collection(COLLECTION).doc(id).set(row);
  return row;
}

export async function logWarehouseProductionStockIncrease({
  user,
  packet,
  assembly,
  delta,
  qtyBefore,
  qtyAfter,
  warehouseLocationId,
  source,
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = newUuid();
  const sku = packet?.sku || assembly?.family_sku || assembly?.sku || null;
  const name = packet?.name || assembly?.name || null;
  const row = {
    id,
    event_type: 'stock_increase',
    packet_id: packet?.id || null,
    assembly_id: assembly?.id || null,
    sku,
    name,
    qty_added: Math.max(0, Number(delta) || 0),
    qty_before: Math.max(0, Number(qtyBefore) || 0),
    qty_after: Math.max(0, Number(qtyAfter) || 0),
    warehouse_location_id: warehouseLocationId || null,
    source: normalizeProductionLogSource(source),
    created_at: now,
    ...actorFields(user),
  };
  await db.collection(COLLECTION).doc(id).set(row);
  return row;
}

export async function listWarehouseProductionLog({
  limit = 500,
  eventType,
  startAt,
  endAt,
} = {}) {
  const db = getDb();
  const cap = Math.min(5000, Math.max(1, Number(limit) || 500));
  let query = db.collection(COLLECTION);
  const start = String(startAt || '').trim();
  const end = String(endAt || '').trim();
  if (start && end) {
    query = query.where('created_at', '>=', start).where('created_at', '<=', end);
  }
  const snap = await query.orderBy('created_at', 'desc').limit(cap).get();
  let rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (eventType) {
    rows = rows.filter((row) => row.event_type === eventType);
  }
  return rows;
}

export async function getWarehouseProductionLogEntry(logId) {
  const id = String(logId || '').trim();
  if (!id) return null;
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updateWarehouseProductionLogEntry(logId, patch) {
  const id = String(logId || '').trim();
  if (!id) throw new Error('log_id is required.');
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Production log entry not found.');
  const next = { ...patch, updated_at: new Date().toISOString() };
  await ref.set(next, { merge: true });
  const after = await ref.get();
  return { id: after.id, ...after.data() };
}

/** Keep kiosk/admin history in sync when a production packet is renamed. */
export async function syncWarehouseProductionLogPacketName(packetId, name) {
  const pid = String(packetId || '').trim();
  if (!pid) return 0;
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('packet_id', '==', pid).get();
  if (!snap.size) return 0;
  const now = new Date().toISOString();
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    batch.set(doc.ref, { name, updated_at: now }, { merge: true });
  });
  await batch.commit();
  return snap.size;
}
