import {
  buildExpectedQty,
  sumInventoryAdjustmentsByProduct,
} from './inventoryVarianceAdjustments.js';

const OPEN_STATUSES = ['open', 'open_locked'];

export function openingStockDocId(sessionId, productId) {
  return `${String(sessionId)}_${String(productId)}`;
}

/** One opening qty per product — prefer canonical composite doc id. */
export function collapseOpeningStockRows(rows = [], sessionId = null) {
  const byProduct = new Map();
  for (const row of rows || []) {
    if (!row?.product_id) continue;
    const pid = String(row.product_id);
    const qty = Number(row.qty ?? 0);
    const id = String(row.id || '');
    const canonicalId = sessionId ? openingStockDocId(sessionId, pid) : '';
    const existing = byProduct.get(pid);
    if (!existing) {
      byProduct.set(pid, { qty, id, canonical: id === canonicalId });
      continue;
    }
    const incomingCanonical = canonicalId && id === canonicalId;
    if (incomingCanonical && !existing.canonical) {
      byProduct.set(pid, { qty, id, canonical: true });
      continue;
    }
    if (!incomingCanonical && existing.canonical) continue;
    byProduct.set(pid, { qty, id, canonical: incomingCanonical || existing.canonical });
  }
  const map = new Map();
  byProduct.forEach((entry, pid) => map.set(pid, entry.qty));
  return map;
}

export async function fetchActiveStockPeriod(db, locationId) {
  if (!db || !locationId) return null;
  const { data, error } = await db
    .from('stock_periods')
    .select('id, location_id, status, opened_at, begin_period_date, closed_at, end_period_date')
    .eq('location_id', locationId)
    .order('opened_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.find((row) => OPEN_STATUSES.includes(String(row?.status || ''))) || null;
}

async function sumTransfers(db, locationId, startISO, endISO, direction) {
  const locCol = direction === 'in' ? 'to_location' : 'from_location';
  const map = new Map();

  const { data: sessionsDt, error: dtErr } = await db
    .from('stock_transfer_sessions')
    .select('id')
    .eq(locCol, locationId)
    .eq('status', 'approved')
    .not('transfer_datetime', 'is', null)
    .gte('transfer_datetime', startISO)
    .lte('transfer_datetime', endISO);
  if (dtErr) throw dtErr;

  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);
  const { data: sessionsDate, error: dateErr } = await db
    .from('stock_transfer_sessions')
    .select('id')
    .eq(locCol, locationId)
    .eq('status', 'approved')
    .is('transfer_datetime', null)
    .gte('transfer_date', startDate)
    .lte('transfer_date', endDate);
  if (dateErr) throw dateErr;

  const ids = [...new Set([
    ...(sessionsDt || []).map((s) => s.id),
    ...(sessionsDate || []).map((s) => s.id),
  ])];
  if (!ids.length) return map;

  const { data: entries, error: entErr } = await db
    .from('stock_transfer_entries')
    .select('product_id, quantity')
    .in('session_id', ids);
  if (entErr) throw entErr;

  (entries || []).forEach((entry) => {
    if (!entry?.product_id) return;
    const pid = String(entry.product_id);
    map.set(pid, (map.get(pid) || 0) + Number(entry.quantity || 0));
  });
  return map;
}

async function sumSales(db, locationId, startISO, endISO) {
  const map = new Map();
  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);

  const { data: byDate, error: dateErr } = await db
    .from('sales')
    .select('id')
    .eq('location_id', locationId)
    .not('sale_date', 'is', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate);
  if (dateErr) throw dateErr;

  const { data: byCreated, error: createdErr } = await db
    .from('sales')
    .select('id')
    .eq('location_id', locationId)
    .is('sale_date', null)
    .gte('created_at', startISO)
    .lte('created_at', endISO);
  if (createdErr) throw createdErr;

  const ids = [...new Set([
    ...(byDate || []).map((s) => s.id),
    ...(byCreated || []).map((s) => s.id),
  ])];
  if (!ids.length) return map;

  const { data: items, error: itemsErr } = await db
    .from('sales_items')
    .select('product_id, quantity')
    .in('sale_id', ids);
  if (itemsErr) throw itemsErr;

  (items || []).forEach((entry) => {
    if (!entry?.product_id) return;
    const pid = String(entry.product_id);
    map.set(pid, (map.get(pid) || 0) + Number(entry.quantity || 0));
  });
  return map;
}

/**
 * Current stock = opening (stock period) + transfers in + inventory in
 * − transfers out − inventory out − sales, all after period start.
 */
export async function computeExpectedInventoryMap(db, locationId, { endISO = null } = {}) {
  const period = await fetchActiveStockPeriod(db, locationId);
  if (!period?.id) return new Map();

  const startISO = period.begin_period_date || period.opened_at;
  const end = endISO || new Date().toISOString();
  if (!startISO) return new Map();

  const { data: openingRows, error: openingErr } = await db
    .from('opening_stock_entries')
    .select('id, product_id, qty')
    .eq('session_id', period.id);
  if (openingErr) throw openingErr;

  const openingMap = collapseOpeningStockRows(openingRows || [], period.id);

  const [transfersIn, transfersOut, salesMap, { inMap, outMap }] = await Promise.all([
    sumTransfers(db, locationId, startISO, end, 'in'),
    sumTransfers(db, locationId, startISO, end, 'out'),
    sumSales(db, locationId, startISO, end),
    sumInventoryAdjustmentsByProduct(db, { locationId, startISO, endISO: end }),
  ]);

  const productIds = new Set([
    ...openingMap.keys(),
    ...transfersIn.keys(),
    ...transfersOut.keys(),
    ...salesMap.keys(),
    ...inMap.keys(),
    ...outMap.keys(),
  ]);

  const expectedMap = new Map();
  productIds.forEach((pid) => {
    const qty = buildExpectedQty({
      opening: openingMap.get(pid) || 0,
      transfersIn: transfersIn.get(pid) || 0,
      transfersOut: transfersOut.get(pid) || 0,
      inventoryIn: inMap.get(pid) || 0,
      inventoryOut: outMap.get(pid) || 0,
      sales: salesMap.get(pid) || 0,
    });
    expectedMap.set(pid, qty);
  });
  return expectedMap;
}

/** Overlay computed current qty onto inventory rows for one location. */
export function applyExpectedQtyToInventoryRows(inventoryRows = [], locationId, expectedMap) {
  if (!locationId || !expectedMap?.size) return inventoryRows;
  const loc = String(locationId);
  const indexByProduct = new Map();
  const merged = (inventoryRows || []).map((row, idx) => {
    if (String(row?.location) === loc && row?.product_id) {
      indexByProduct.set(String(row.product_id), idx);
    }
    return { ...row };
  });

  expectedMap.forEach((qty, productId) => {
    const idx = indexByProduct.get(String(productId));
    if (idx !== undefined) {
      merged[idx] = { ...merged[idx], quantity: qty };
      return;
    }
    merged.push({
      id: `${productId}_${loc}`,
      product_id: productId,
      location: loc,
      quantity: qty,
      updated_at: new Date().toISOString(),
    });
  });
  return merged;
}
