import { newUuid } from './uuid.js';

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

async function syncOpeningStockDeduction(db, { locationId, productId, usedQty }) {
  if (!locationId || !productId) return;
  const { data: period, error: periodErr } = await db
    .from('stock_periods')
    .select('id')
    .eq('location_id', locationId)
    .in('status', ['open', 'open_locked'])
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (periodErr || !period?.id) return;

  const { data: opening, error: openingErr } = await db
    .from('opening_stock_entries')
    .select('qty')
    .eq('session_id', period.id)
    .eq('product_id', productId)
    .maybeSingle();
  if (openingErr || !opening) return;

  const nextQty = Number(opening.qty || 0) - Number(usedQty || 0);
  await db
    .from('opening_stock_entries')
    .update({ qty: nextQty })
    .eq('session_id', period.id)
    .eq('product_id', productId);
}

export async function applyInventoryDeduction(db, {
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
    const { data: invRows, error: invFetchErr } = await db
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', productId)
      .eq('location', locationId);
    if (invFetchErr) throw invFetchErr;

    const rows = Array.isArray(invRows) ? invRows : [];
    const beforeQtyTotal = rows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
    const afterQtyTotal = beforeQtyTotal - Number(usedQty || 0);

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
      await syncOpeningStockDeduction(db, { locationId, productId, usedQty });
    } catch (_) { /* opening stock sync is best-effort */ }

    try {
      const { error: auditErr } = await db
        .from('inventory_adjustments')
        .insert({
          id: newUuid(),
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
      if (auditErr) {
        console.warn('[inventoryDeduction] audit insert failed', auditErr.message || auditErr);
      }
    } catch (auditErr) {
      console.warn('[inventoryDeduction] audit insert failed', auditErr);
    }

    adjustedProducts += 1;
  }

  return adjustedProducts;
}
