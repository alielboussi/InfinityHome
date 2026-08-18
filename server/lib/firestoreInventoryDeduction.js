import { newUuid } from './uuid.js';
import {
  allocateNumericId,
  ensureSequenceInitialized,
  queryCollectionWhere,
  queryWhereIn,
} from './firestoreDb.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

export function buildInventoryUsage(items = []) {
  const usageMap = new Map();
  for (const item of items) {
    const productId = item?.product_id ?? null;
    if (!productId || !isUuid(productId)) continue;
    const quantity = Number(item?.quantity || 0);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    usageMap.set(productId, (usageMap.get(productId) || 0) + quantity);
  }
  return usageMap;
}

function inventoryCompositeDocId(productId, locationId) {
  return `${productId}_${locationId}`;
}

function openingEntryDocId(sessionId, productId) {
  return `${sessionId}_${productId}`;
}

async function batchLoadInventoryRows(db, productIds, locationId) {
  const rowsByProduct = new Map();
  if (!productIds.length) return rowsByProduct;

  const compositeRefs = productIds.map((productId) => (
    db.collection('inventory').doc(inventoryCompositeDocId(productId, locationId))
  ));
  const compositeSnaps = await db.getAll(...compositeRefs);
  compositeSnaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const productId = productIds[index];
    rowsByProduct.set(productId, [{ id: snap.id, ...snap.data() }]);
  });

  const missingProductIds = productIds.filter((productId) => !rowsByProduct.has(productId));
  if (!missingProductIds.length) return rowsByProduct;

  const legacyRows = await queryWhereIn(db, 'inventory', 'product_id', missingProductIds);
  for (const row of legacyRows) {
    if (String(row.location) !== String(locationId)) continue;
    const productId = row.product_id;
    if (!rowsByProduct.has(productId)) rowsByProduct.set(productId, []);
    rowsByProduct.get(productId).push(row);
  }

  return rowsByProduct;
}

async function resolveOpenPeriodForLocation(db, locationId, cache) {
  if (cache.has(locationId)) return cache.get(locationId);
  const periods = await queryCollectionWhere(db, 'stock_periods', [
    { field: 'location_id', op: '==', value: locationId },
  ]);
  const open = periods
    .filter((row) => ['open', 'open_locked'].includes(String(row.status || '')))
    .sort((a, b) => String(b.opened_at || '').localeCompare(String(a.opened_at || '')))[0] || null;
  cache.set(locationId, open);
  return open;
}

async function syncOpeningStockDeduction(db, { locationId, productId, usedQty, openPeriodCache }) {
  const open = await resolveOpenPeriodForLocation(db, locationId, openPeriodCache);
  if (!open?.id) return;

  const entryRef = db.collection('opening_stock_entries').doc(openingEntryDocId(open.id, productId));
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    const entries = await queryCollectionWhere(db, 'opening_stock_entries', [
      { field: 'session_id', op: '==', value: open.id },
      { field: 'product_id', op: '==', value: productId },
    ]);
    const opening = entries[0];
    if (!opening) return;
    const nextQty = Number(opening.qty || 0) - Number(usedQty || 0);
    await db.collection('opening_stock_entries').doc(String(opening.id)).set(
      { ...opening, qty: nextQty },
      { merge: true },
    );
    return;
  }

  const opening = { id: entrySnap.id, ...entrySnap.data() };
  const nextQty = Number(opening.qty || 0) - Number(usedQty || 0);
  await entryRef.set({ ...opening, qty: nextQty }, { merge: true });
}

async function applyInventoryDelta(db, { productId, locationId, usedQty, rows, nowIso }) {
  const beforeQtyTotal = rows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
  const afterQtyTotal = beforeQtyTotal - Number(usedQty || 0);

  if (rows.length === 0) {
    await db.runTransaction(async (tx) => {
      const newId = await allocateNumericId(db, 'inventory', tx);
      tx.set(db.collection('inventory').doc(String(newId)), {
        id: newId,
        product_id: productId,
        location: locationId,
        quantity: afterQtyTotal,
        updated_at: nowIso,
      });
    });
  } else if (rows.length === 1) {
    const row = rows[0];
    await db.collection('inventory').doc(String(row.id)).set(
      { ...row, quantity: afterQtyTotal, updated_at: nowIso },
      { merge: true },
    );
  } else {
    const [firstRow, ...duplicateRows] = rows;
    await db.collection('inventory').doc(String(firstRow.id)).set(
      { ...firstRow, quantity: afterQtyTotal, updated_at: nowIso },
      { merge: true },
    );
    await Promise.all(duplicateRows.map((dup) => (
      db.collection('inventory').doc(String(dup.id)).set(
        { ...dup, quantity: 0, updated_at: nowIso },
        { merge: true },
      )
    )));
  }

  return { beforeQtyTotal, afterQtyTotal };
}

export async function applyFirestoreInventoryDeduction(db, {
  items = [],
  locationId,
  saleId,
  receiptNumber,
  userUid = null,
  userId = null,
}) {
  if (!locationId || !isUuid(locationId)) {
    throw new Error('locationId must be a UUID for inventory deduction');
  }

  const usageMap = buildInventoryUsage(items);
  if (usageMap.size === 0) return 0;

  const productIds = [...usageMap.keys()];
  const [_, rowsByProduct] = await Promise.all([
    ensureSequenceInitialized(db, 'inventory'),
    batchLoadInventoryRows(db, productIds, locationId),
  ]);

  const openPeriodCache = new Map();
  const nowIso = new Date().toISOString();

  const results = await Promise.all(
    [...usageMap.entries()].map(async ([productId, usedQty]) => {
      const rows = rowsByProduct.get(productId) || [];
      const { beforeQtyTotal, afterQtyTotal } = await applyInventoryDelta(db, {
        productId,
        locationId,
        usedQty,
        rows,
        nowIso,
      });

      await Promise.all([
        syncOpeningStockDeduction(db, {
          locationId,
          productId,
          usedQty,
          openPeriodCache,
        }).catch(() => {}),
        (async () => {
          try {
            const auditId = newUuid();
            await db.collection('inventory_adjustments').doc(auditId).set({
              id: auditId,
              product_id: productId,
              location_id: locationId,
              quantity: -Number(usedQty || 0),
              adjustment_type: 'sale_deduction',
              adjusted_at: nowIso,
              metadata: {
                sale_id: saleId,
                receipt_number: receiptNumber || null,
                before_qty: beforeQtyTotal,
                after_qty: afterQtyTotal,
                deducted: Number(usedQty || 0),
                allow_negative: true,
                user_uid: userUid,
                user_id: userId,
              },
            });
          } catch (auditErr) {
            console.warn('[firestoreInventoryDeduction] audit insert failed', auditErr);
          }
        })(),
      ]);

      return 1;
    }),
  );

  return results.reduce((sum, n) => sum + Number(n || 0), 0);
}
