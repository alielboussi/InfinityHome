import { newUuid } from './uuid.js';
import { buildInventoryUsage } from './inventoryDeduction.js';

export async function applyInventoryRestore(db, {
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
    const { data: invRows, error: invFetchErr } = await db
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', productId)
      .eq('location', locationId);
    if (invFetchErr) throw invFetchErr;

    const rows = Array.isArray(invRows) ? invRows : [];
    const beforeQtyTotal = rows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
    const afterQtyTotal = beforeQtyTotal + qty;

    if (rows.length === 0) {
      const { error: insertErr } = await db
        .from('inventory')
        .insert([{ product_id: productId, location: locationId, quantity: afterQtyTotal, updated_at: nowIso }]);
      if (insertErr) throw insertErr;
    } else if (rows.length === 1) {
      const { error: updateErr } = await db
        .from('inventory')
        .update({ quantity: afterQtyTotal, updated_at: nowIso })
        .eq('id', rows[0].id);
      if (updateErr) throw updateErr;
    } else {
      const [firstRow, ...duplicateRows] = rows;
      const { error: updateErr } = await db
        .from('inventory')
        .update({ quantity: afterQtyTotal, updated_at: nowIso })
        .eq('id', firstRow.id);
      if (updateErr) throw updateErr;
      if (duplicateRows.length > 0) {
        const duplicateIds = duplicateRows.map((row) => row.id);
        const { error: zeroErr } = await db
          .from('inventory')
          .update({ quantity: 0, updated_at: nowIso })
          .in('id', duplicateIds);
        if (zeroErr) throw zeroErr;
      }
    }

    try {
      await db.from('inventory_adjustments').insert({
        id: newUuid(),
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
      console.warn('[inventoryRestore] audit insert failed', auditErr);
    }

    adjustedProducts += 1;
  }

  return adjustedProducts;
}
