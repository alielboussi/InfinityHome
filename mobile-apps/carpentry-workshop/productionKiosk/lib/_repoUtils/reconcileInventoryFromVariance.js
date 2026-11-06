/** STOCKTAKE_PIPELINE_LOCKED — see docs/stocktake-pdf-pipeline.md */
import { buildVarianceRows } from './stocktakeVarianceRows.js';
import { dedupeInventoryRows, upsertInventoryQuantity } from './inventoryApi.js';

export async function buildVarianceClosingQtyMap(db, period) {
  const rows = await buildVarianceRows(db, period);
  const totals = new Map();
  rows
    .filter((r) => r.row_type !== 'set_header' && r.product_id)
    .forEach((r) => {
      totals.set(String(r.product_id), Math.max(0, Number(r.closing_stock_qty || 0)));
    });
  return totals;
}

async function fetchAllInventoryAtLocation(db, locationId) {
  const { data, error } = await db
    .from('inventory')
    .select('id, product_id, quantity, location, updated_at')
    .eq('location', locationId);
  if (error) throw error;
  return dedupeInventoryRows(data || []);
}

/**
 * After period close: location inventory = variance report closing qty only; all other SKUs at 0.
 */
export async function reconcileInventoryFromVariance(db, period, { updatedAt } = {}) {
  if (!period?.id || !period?.location_id) {
    return { updated: 0, targetSkus: 0 };
  }
  if (String(period.status || '').toLowerCase() !== 'closed') {
    return { updated: 0, targetSkus: 0 };
  }

  const locationId = period.location_id;
  const targetTotals = await buildVarianceClosingQtyMap(db, period);
  const existing = await fetchAllInventoryAtLocation(db, locationId);
  const existingByProduct = new Map(existing.map((r) => [String(r.product_id), r]));
  const now = updatedAt || new Date().toISOString();
  const updatesByProduct = new Map();

  targetTotals.forEach((qty, product_id) => {
    const pid = String(product_id);
    const row = existingByProduct.get(pid);
    const current = Number(row?.quantity ?? 0);
    const target = Math.max(0, Number(qty) || 0);
    if (current !== target) {
      updatesByProduct.set(pid, { product_id: pid, quantity: target });
    }
  });

  for (const row of existing) {
    const pid = String(row.product_id);
    if (targetTotals.has(pid)) continue;
    if (Number(row.quantity ?? 0) !== 0) {
      updatesByProduct.set(pid, { product_id: pid, quantity: 0 });
    }
  }

  const updates = Array.from(updatesByProduct.values());
  for (const { product_id, quantity } of updates) {
    await upsertInventoryQuantity(
      { productId: product_id, locationId, quantity, updatedAt: now },
      db,
    );
  }

  const linkPayload = [...targetTotals.keys()]
    .filter((id) => Number(targetTotals.get(id)) > 0)
    .map((product_id) => ({ product_id, location_id: locationId }));

  if (linkPayload.length) {
    const chunkSize = 400;
    for (let i = 0; i < linkPayload.length; i += chunkSize) {
      const chunk = linkPayload.slice(i, i + chunkSize);
      const { error: plErr } = await db.from('product_locations').upsert(chunk, { onConflict: 'product_id,location_id' });
      if (plErr) throw plErr;
    }
  }

  return { updated: updates.length, targetSkus: targetTotals.size };
}
