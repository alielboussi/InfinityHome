import { collapseOpeningStockRows } from './computedInventoryQty';
import { resolveAdjustmentDelta } from './inventoryVarianceAdjustments';
import { dedupeInventoryRows } from './inventoryApi';

const OPENING_TYPES = new Set([
  'opening',
  'opening period stock',
  'opening period stock adjustment',
]);

export const ROW_OPENING = 'Opening Stock';
export const ROW_CURRENT = 'Current Stock';
export const ROW_IN = 'Inventory In';
export const ROW_OUT = 'Inventory Out';

function resolveRowDelta(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const type = String(row?.adjustment_type || '').trim().toLowerCase();

  if (meta.before_qty != null && meta.after_qty != null) {
    return Number(meta.after_qty) - Number(meta.before_qty);
  }
  if (meta.delta != null && Number.isFinite(Number(meta.delta))) {
    return Number(meta.delta);
  }
  if (OPENING_TYPES.has(type)) return 0;
  if (type === 'sale_deduction' || type.includes('sale')) return 0;
  return resolveAdjustmentDelta(row);
}

function isMovementRow(row) {
  const type = String(row?.adjustment_type || '').trim().toLowerCase();
  if (OPENING_TYPES.has(type)) return false;
  if (type === 'sale_deduction' || type.includes('sale')) return false;
  const source = String(row?.metadata?.source || '').toLowerCase();
  if (source && !['products-list', 'manual-cleanup'].includes(source)) {
    if (!/inventory in|inventory out|manual|negative reset|set assembly|set receive/i.test(type)) {
      return false;
    }
  }
  return resolveRowDelta(row) !== 0;
}

function movementType(delta) {
  return delta > 0 ? ROW_IN : ROW_OUT;
}

async function resolveStockPeriod(db, locationId) {
  const { data, error } = await db
    .from('stock_periods')
    .select('id, status, begin_period_date, opened_at')
    .eq('location_id', locationId)
    .order('opened_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const open = rows.find((row) => ['open', 'open_locked'].includes(String(row?.status || '')));
  if (open) return open;
  return rows[0] || null;
}

async function fetchOpeningStock(db, period, productId) {
  if (!period?.id) return { qty: 0, at: null };
  const { data: openingRows, error } = await db
    .from('opening_stock_entries')
    .select('id, qty')
    .eq('session_id', period.id)
    .eq('product_id', productId);
  if (error) throw error;
  const openingMap = collapseOpeningStockRows(openingRows || [], period.id);
  return {
    qty: openingMap.get(String(productId)) || 0,
    at: period.begin_period_date || period.opened_at || null,
  };
}

async function fetchLiveInventoryQty(db, productId, locationId) {
  const { data, error } = await db
    .from('inventory')
    .select('id, quantity, updated_at, product_id, location')
    .eq('product_id', productId)
    .eq('location', locationId);
  if (error) throw error;
  const deduped = dedupeInventoryRows(Array.isArray(data) ? data : []);
  return deduped.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
}

/**
 * Read-only stock history.
 * Current Stock = live Locations qty only. Never writes inventory.
 */
export async function fetchInventoryAdjustmentHistory(
  db,
  { productId, locationId, currentQty = null, limit = 100 } = {},
) {
  if (!db) throw new Error('Data client required.');
  if (!productId || !locationId) throw new Error('productId and locationId are required.');

  const period = await resolveStockPeriod(db, locationId);
  const startISO = period ? (period.begin_period_date || period.opened_at) : null;
  const { qty: openingStock, at: openingAt } = await fetchOpeningStock(db, period, productId);

  const liveQty = await fetchLiveInventoryQty(db, productId, locationId);
  const currentStock = Number.isFinite(Number(currentQty)) ? Number(currentQty) : liveQty;

  let query = db
    .from('inventory_adjustments')
    .select('id, quantity, adjustment_type, adjusted_at, metadata')
    .eq('product_id', productId)
    .eq('location_id', locationId);
  if (startISO) query = query.gte('adjusted_at', startISO);

  const { data, error } = await query.order('adjusted_at', { ascending: true }).limit(Math.min(limit, 250));
  if (error) throw error;

  const movements = (Array.isArray(data) ? data : [])
    .filter(isMovementRow)
    .map((row) => {
      const delta = resolveRowDelta(row);
      const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const afterQty = meta.after_qty != null && Number.isFinite(Number(meta.after_qty))
        ? Number(meta.after_qty)
        : null;
      return {
        id: row.id,
        adjustedAt: row.adjusted_at || null,
        delta,
        afterQty,
        type: movementType(delta),
      };
    });

  const totalIn = movements.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
  const totalOut = movements.filter((m) => m.delta < 0).reduce((s, m) => s + Math.abs(m.delta), 0);

  const movementRows = movements.map((row) => ({
    id: row.id,
    adjustedAt: row.adjustedAt,
    delta: row.delta,
    runningQty: row.afterQty,
    type: row.type,
    locked: false,
  }));

  const rows = [
    {
      id: 'opening-stock',
      adjustedAt: openingAt,
      delta: openingStock,
      runningQty: openingStock,
      type: ROW_OPENING,
      locked: true,
    },
    ...movementRows,
    {
      id: 'current-stock',
      adjustedAt: null,
      delta: currentStock,
      runningQty: currentStock,
      type: ROW_CURRENT,
      locked: true,
    },
  ];

  return {
    rows,
    openingStock,
    currentStock,
    totalIn,
    totalOut,
    locationSynced: false,
    hasGap: false,
  };
}

export function formatAdjustmentDelta(delta, { signed = true } = {}) {
  const num = Number(delta || 0);
  if (!Number.isFinite(num)) return '—';
  if (!signed) return num.toLocaleString();
  if (num === 0) return '0';
  return num > 0 ? `+${num.toLocaleString()}` : num.toLocaleString();
}

export function formatQty(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString();
}

/** @deprecated */
export function normalizeAdjustmentHistoryRows(rows = []) {
  return Array.isArray(rows) ? rows : [];
}
