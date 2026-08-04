import { newUuid } from './uuid.js';
import { allocateNumericId, ensureSequenceInitialized, queryCollectionWhere } from './firestoreDb.js';

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

async function findInventoryRows(db, productId, locationId) {
  const byProduct = await queryCollectionWhere(db, 'inventory', [
    { field: 'product_id', op: '==', value: productId },
  ]);
  return byProduct.filter((row) => String(row.location) === String(locationId));
}

async function syncOpeningStockDeduction(db, { locationId, productId, usedQty }) {
  const periods = await queryCollectionWhere(db, 'stock_periods', [
    { field: 'location_id', op: '==', value: locationId },
  ]);
  const open = periods
    .filter((row) => ['open', 'open_locked'].includes(String(row.status || '')))
    .sort((a, b) => String(b.opened_at || '').localeCompare(String(a.opened_at || '')))[0];
  if (!open?.id) return;

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

  let adjustedProducts = 0;
  for (const [productId, usedQty] of usageMap.entries()) {
    const nowIso = new Date().toISOString();
    const rows = await findInventoryRows(db, productId, locationId);
    const beforeQtyTotal = rows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
    const afterQtyTotal = beforeQtyTotal - Number(usedQty || 0);

    if (rows.length === 0) {
      await ensureSequenceInitialized(db, 'inventory');
      let newId;
      await db.runTransaction(async (tx) => {
        newId = await allocateNumericId(db, 'inventory', tx);
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
      for (const dup of duplicateRows) {
        await db.collection('inventory').doc(String(dup.id)).set(
          { ...dup, quantity: 0, updated_at: nowIso },
          { merge: true },
        );
      }
    }

    try {
      await syncOpeningStockDeduction(db, { locationId, productId, usedQty });
    } catch (_) { /* best-effort */ }

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

    adjustedProducts += 1;
  }

  return adjustedProducts;
}
