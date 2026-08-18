export const INVENTORY_IN = 'Inventory In';
export const INVENTORY_OUT = 'Inventory Out';

const SKIP_VARIANCE_TYPES = new Set([
  'sale_deduction',
]);

export function classifyInventoryAdjustmentDelta(delta) {
  const n = Number(delta || 0);
  if (n > 0) {
    return { type: INVENTORY_IN, quantity: n, delta: n };
  }
  if (n < 0) {
    return { type: INVENTORY_OUT, quantity: Math.abs(n), delta: n };
  }
  return { type: 'Inventory Adjustment', quantity: 0, delta: 0 };
}

/** Signed qty change for one adjustment row (legacy + new types). */
export function resolveAdjustmentDelta(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.delta != null && Number.isFinite(Number(meta.delta))) {
    return Number(meta.delta);
  }

  if (meta.before_qty != null && meta.after_qty != null) {
    return Number(meta.after_qty) - Number(meta.before_qty);
  }

  const type = String(row?.adjustment_type || '').trim().toLowerCase();
  if (SKIP_VARIANCE_TYPES.has(type)) return 0;

  const qty = Number(row?.quantity ?? 0);
  if (!Number.isFinite(qty)) return 0;

  if (type === INVENTORY_IN.toLowerCase() || type.includes('receive')) {
    return Math.abs(qty);
  }
  if (type === INVENTORY_OUT.toLowerCase() || type.includes('assembly') || type.includes('deduction')) {
    return qty < 0 ? qty : -Math.abs(qty);
  }

  if (type.includes('manual') || type.includes('opening period stock') || type.includes('negative reset')) {
    return qty;
  }

  return qty;
}

function inPeriod(iso, startISO, endISO) {
  const ts = Date.parse(iso || '') || 0;
  const start = Date.parse(startISO || '') || 0;
  const end = Date.parse(endISO || '') || Number.MAX_SAFE_INTEGER;
  if (!ts) return false;
  return ts >= start && ts <= end;
}

/**
 * Sum manual / stocktake-period inventory adjustments by product for variance.
 * Returns { inMap, outMap } keyed by product_id string.
 */
export async function sumInventoryAdjustmentsByProduct(db, { locationId, startISO, endISO }) {
  const inMap = new Map();
  const outMap = new Map();
  if (!db || !locationId || !startISO) {
    return { inMap, outMap };
  }

  const { data, error } = await db
    .from('inventory_adjustments')
    .select('product_id, location_id, quantity, adjustment_type, adjusted_at, metadata')
    .eq('location_id', locationId)
    .gte('adjusted_at', startISO)
    .lte('adjusted_at', endISO || new Date().toISOString());
  if (error) throw error;

  for (const row of data || []) {
    if (!row?.product_id) continue;
    if (!inPeriod(row.adjusted_at, startISO, endISO)) continue;

    const sessionId = row.metadata?.session_id;
    if (sessionId && endISO && row.metadata?.session_end) {
      // optional future filter; ignore for now
    }

    const delta = resolveAdjustmentDelta(row);
    if (!delta) continue;

    const pid = String(row.product_id);
    if (delta > 0) {
      inMap.set(pid, (inMap.get(pid) || 0) + delta);
    } else {
      outMap.set(pid, (outMap.get(pid) || 0) + Math.abs(delta));
    }
  }

  return { inMap, outMap };
}

export function buildExpectedQty({
  opening = 0,
  transfersIn = 0,
  transfersOut = 0,
  inventoryIn = 0,
  inventoryOut = 0,
  sales = 0,
} = {}) {
  return Number(opening || 0)
    + Number(transfersIn || 0)
    + Number(inventoryIn || 0)
    - Number(transfersOut || 0)
    - Number(inventoryOut || 0)
    - Number(sales || 0);
}
