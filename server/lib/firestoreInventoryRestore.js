import { newUuid } from './uuid.js';
import { allocateNumericId, ensureSequenceInitialized, queryCollectionWhere } from './firestoreDb.js';
import { buildInventoryUsage } from './firestoreInventoryDeduction.js';

async function findInventoryRows(db, productId, locationId) {
  const byProduct = await queryCollectionWhere(db, 'inventory', [
    { field: 'product_id', op: '==', value: productId },
  ]);
  return byProduct.filter((row) => String(row.location) === String(locationId));
}

export async function applyFirestoreInventoryRestore(db, {
  items = [],
  locationId,
  saleId,
  receiptNumber,
  reason = 'sale_adjustment_restore',
  userUid = null,
  userId = null,
}) {
  if (!locationId) return 0;

  const usageMap = buildInventoryUsage(items);
  if (usageMap.size === 0) return 0;

  let adjustedProducts = 0;
  for (const [productId, restoreQty] of usageMap.entries()) {
    const qty = Number(restoreQty || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const nowIso = new Date().toISOString();
    const rows = await findInventoryRows(db, productId, locationId);
    const beforeQtyTotal = rows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
    const afterQtyTotal = beforeQtyTotal + qty;

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
      const auditId = newUuid();
      await db.collection('inventory_adjustments').doc(auditId).set({
        id: auditId,
        product_id: productId,
        location_id: locationId,
        quantity: qty,
        adjustment_type: reason,
        adjusted_at: nowIso,
        metadata: {
          sale_id: saleId,
          receipt_number: receiptNumber || null,
          before_qty: beforeQtyTotal,
          after_qty: afterQtyTotal,
          restored: qty,
          user_uid: userUid,
          user_id: userId,
        },
      });
    } catch (auditErr) {
      console.warn('[firestoreInventoryRestore] audit insert failed', auditErr);
    }

    adjustedProducts += 1;
  }

  return adjustedProducts;
}
