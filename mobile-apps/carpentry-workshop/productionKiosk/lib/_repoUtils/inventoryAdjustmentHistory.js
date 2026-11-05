import { collapseOpeningStockRows } from './computedInventoryQty';
import { resolveAdjustmentDelta } from './inventoryVarianceAdjustments';
import { dedupeInventoryRows } from './inventoryApi';
import { getMaxSetQty } from './setInventoryUtils';

const OPENING_TYPES = new Set([
  'opening',
  'opening period stock',
  'opening period stock adjustment',
]);

export const ROW_OPENING = 'Opening Stock';
export const ROW_CURRENT = 'Current Stock';
export const ROW_IN = 'Inventory In';
export const ROW_OUT = 'Inventory Out';
export const ROW_SALE = 'Sale';
export const ROW_TRANSFER_IN = 'Transfer In';
export const ROW_TRANSFER_OUT = 'Transfer Out';
export const ROW_SET_ASSEMBLE = 'Set Assembly';
export const ROW_SET_RECEIVE = 'Set Receive';
export const ROW_SET_SALE = 'Set Sale';

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
  return resolveAdjustmentDelta(row);
}

function isMovementRow(row) {
  const type = String(row?.adjustment_type || '').trim().toLowerCase();
  if (OPENING_TYPES.has(type)) return false;
  return resolveRowDelta(row) !== 0;
}

function movementType(row, delta) {
  const type = String(row?.adjustment_type || '').trim().toLowerCase();
  if (type === 'sale_deduction' || (type.includes('sale') && !type.includes('resale'))) {
    return ROW_SALE;
  }
  if (type.includes('transfer')) {
    return delta > 0 ? ROW_TRANSFER_IN : ROW_TRANSFER_OUT;
  }
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

async function fetchOpeningStockMap(db, period, productIds = []) {
  const ids = Array.from(new Set((productIds || []).map((id) => String(id)).filter(Boolean)));
  if (!period?.id || !ids.length) return new Map();
  const { data: openingRows, error } = await db
    .from('opening_stock_entries')
    .select('id, qty, product_id')
    .eq('session_id', period.id)
    .in('product_id', ids);
  if (error) throw error;
  return collapseOpeningStockRows(openingRows || [], period.id);
}

async function fetchLiveInventoryQtyMap(db, productIds, locationId) {
  const ids = Array.from(new Set((productIds || []).map((id) => String(id)).filter(Boolean)));
  const stock = {};
  if (!ids.length || !locationId) return stock;
  const { data, error } = await db
    .from('inventory')
    .select('id, quantity, product_id, location')
    .in('product_id', ids)
    .eq('location', locationId);
  if (error) throw error;
  dedupeInventoryRows(Array.isArray(data) ? data : []).forEach((row) => {
    const pid = String(row.product_id);
    stock[pid] = (stock[pid] || 0) + (Number(row.quantity) || 0);
  });
  return stock;
}

function comboMovementType(row, setDelta) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const mode = String(meta.set_mode || '').trim().toLowerCase();
  if (mode === 'assemble') return ROW_SET_ASSEMBLE;
  if (mode === 'receive') return ROW_SET_RECEIVE;
  const type = String(row?.adjustment_type || '').trim().toLowerCase();
  if (type === 'sale_deduction' || (type.includes('sale') && !type.includes('resale'))) {
    return ROW_SET_SALE;
  }
  if (type.includes('transfer')) {
    return setDelta > 0 ? ROW_TRANSFER_IN : ROW_TRANSFER_OUT;
  }
  return setDelta > 0 ? ROW_IN : ROW_OUT;
}

function rowMetadata(row) {
  return row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
}

function saleIdFromMeta(meta) {
  const raw = meta?.sale_id;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function buildComboItemsByCombo(allComboItems = []) {
  const map = new Map();
  (allComboItems || []).forEach((row) => {
    const key = String(row.combo_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function matchComboByName(name, combos = []) {
  const norm = String(name || '').trim().toLowerCase();
  if (!norm) return null;
  return combos.find((combo) => String(combo.combo_name || '').trim().toLowerCase() === norm) || null;
}

async function fetchRelatedComboCatalog(db, productIds = []) {
  const pidSet = new Set((productIds || []).map((id) => String(id)).filter(Boolean));
  if (!pidSet.size) return { combos: [], comboItems: [] };
  const { data: allItems, error: itemsErr } = await db.from('combo_items').select('combo_id, product_id, quantity');
  if (itemsErr) throw itemsErr;
  const relatedItems = (allItems || []).filter((row) => pidSet.has(String(row.product_id)));
  const comboIds = [...new Set(relatedItems.map((row) => row.combo_id).filter((id) => id != null))];
  if (!comboIds.length) return { combos: [], comboItems: relatedItems };
  const { data: combos, error: combosErr } = await db.from('combos').select('id, combo_name, sku').in('id', comboIds);
  if (combosErr) throw combosErr;
  return { combos: combos || [], comboItems: relatedItems };
}

function expandSaleItemUsage(item, { pidSet, comboItemsByCombo, relatedCombos }) {
  const usage = new Map();
  const add = (productId, qty) => {
    const key = String(productId);
    if (!pidSet.has(key)) return;
    usage.set(key, (usage.get(key) || 0) + Number(qty || 0));
  };

  if (item?.product_id && pidSet.has(String(item.product_id))) {
    add(item.product_id, item.quantity);
    return { usage, label: item.display_name || null };
  }

  let comboKey = item?.combo_id != null ? String(item.combo_id) : null;
  if (!comboKey && item?.display_name) {
    const matched = matchComboByName(item.display_name, relatedCombos);
    if (matched) comboKey = String(matched.id);
  }
  if (!comboKey) return { usage: null, label: null };

  const comboRows = comboItemsByCombo.get(comboKey) || [];
  const lineQty = Number(item?.quantity || 1);
  comboRows.forEach((row) => add(row.product_id, Number(row.quantity || 0) * lineQty));
  const comboName = item.display_name
    || relatedCombos.find((combo) => String(combo.id) === comboKey)?.combo_name
    || null;
  return { usage: usage.size ? usage : null, label: comboName };
}

function expandSaleUsage(saleItems = [], context) {
  const usage = new Map();
  const labels = [];
  (saleItems || []).forEach((item) => {
    const expanded = expandSaleItemUsage(item, context);
    if (!expanded.usage?.size) return;
    if (expanded.label) labels.push(expanded.label);
    expanded.usage.forEach((qty, pid) => {
      usage.set(pid, (usage.get(pid) || 0) + qty);
    });
  });
  return { usage: usage.size ? usage : null, labels: [...new Set(labels)] };
}

function collectLoggedSaleIds(adjustmentRows = []) {
  const ids = new Set();
  (adjustmentRows || []).forEach((row) => {
    const saleId = saleIdFromMeta(rowMetadata(row));
    if (saleId) ids.add(saleId);
  });
  return ids;
}

function isOnOrAfter(iso, startISO) {
  if (!startISO) return true;
  if (!iso) return false;
  return new Date(iso).getTime() >= new Date(startISO).getTime();
}

async function fetchSaleItemsBySaleIds(db, saleIds = []) {
  const map = new Map();
  const ids = [...new Set((saleIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data, error } = await db
      .from('sales_items')
      .select('sale_id, product_id, combo_id, quantity, display_name')
      .in('sale_id', chunk);
    if (error) throw error;
    (data || []).forEach((item) => {
      const saleId = Number(item.sale_id);
      if (!map.has(saleId)) map.set(saleId, []);
      map.get(saleId).push(item);
    });
  }
  return map;
}

async function fetchUnloggedComboSaleEvents(
  db,
  {
    locationId,
    startISO,
    productIds = [],
    loggedSaleIds = new Set(),
    relatedCombos = [],
    comboItemsByCombo = new Map(),
  } = {},
) {
  const pidSet = new Set((productIds || []).map((id) => String(id)).filter(Boolean));
  if (!pidSet.size || !locationId) return [];

  const { data: sales, error } = await db
    .from('sales')
    .select('id, customer_id, receipt_number, sale_date, created_at')
    .eq('location_id', locationId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const periodSales = (sales || []).filter((sale) => {
    const at = sale.created_at || sale.sale_date;
    return isOnOrAfter(at, startISO);
  });
  if (!periodSales.length) return [];

  const saleItemsMap = await fetchSaleItemsBySaleIds(db, periodSales.map((sale) => sale.id));
  const context = { pidSet, comboItemsByCombo, relatedCombos };
  const events = [];

  periodSales.forEach((sale) => {
    const saleId = Number(sale.id);
    if (loggedSaleIds.has(saleId)) return;
    const expanded = expandSaleUsage(saleItemsMap.get(saleId) || [], context);
    if (!expanded.usage?.size) return;
    events.push({
      id: `sale-${saleId}`,
      saleId,
      at: sale.created_at || sale.sale_date || null,
      usage: expanded.usage,
      label: expanded.labels.join(', ') || null,
      receiptNumber: sale.receipt_number || null,
      customerId: sale.customer_id || null,
    });
  });

  return events;
}

async function fetchSalesMetaByIds(db, saleIds = []) {
  const ids = [...new Set((saleIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const map = new Map();
  if (!ids.length) return map;

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data: sales, error } = await db
      .from('sales')
      .select('id, customer_id, receipt_number, sale_date, created_at')
      .in('id', chunk);
    if (error) throw error;

    const customerIds = [...new Set((sales || []).map((sale) => sale.customer_id).filter(Boolean))];
    const customerMap = new Map();
    for (let j = 0; j < customerIds.length; j += 50) {
      const customerChunk = customerIds.slice(j, j + 50);
      const { data: customers, error: customerErr } = await db
        .from('customers')
        .select('id, name')
        .in('id', customerChunk);
      if (customerErr) throw customerErr;
      (customers || []).forEach((customer) => {
        customerMap.set(String(customer.id), customer.name || null);
      });
    }

    (sales || []).forEach((sale) => {
      const saleId = Number(sale.id);
      const customerName = sale.customer_id
        ? customerMap.get(String(sale.customer_id)) || null
        : null;
      map.set(saleId, {
        customerName,
        receiptNumber: sale.receipt_number || null,
        saleDate: sale.created_at || sale.sale_date || null,
      });
    });
  }

  return map;
}

function buildSaleDetail(row, salesMeta) {
  const saleId = row?.saleId != null ? Number(row.saleId) : null;
  const meta = saleId ? salesMeta.get(saleId) : null;
  const customerName = row.customerName || meta?.customerName || null;
  const receiptNumber = row.receiptNumber || meta?.receiptNumber || null;
  const soldLabel = row.soldLabel || null;
  const parts = [customerName, receiptNumber, soldLabel].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function enrichMovementRowsWithSaleMeta(movementRows = [], salesMeta = new Map()) {
  return movementRows.map((row) => {
    const saleId = row?.saleId != null ? Number(row.saleId) : null;
    const meta = saleId ? salesMeta.get(saleId) : null;
    const enriched = {
      ...row,
      customerName: row.customerName || meta?.customerName || null,
      receiptNumber: row.receiptNumber || meta?.receiptNumber || null,
    };
  return {
      ...enriched,
      detail: buildSaleDetail(enriched, salesMeta),
    };
  });
}

function applyUsageDeduction(componentStock, usage) {
  usage.forEach((qty, pid) => {
    componentStock[pid] = (componentStock[pid] || 0) - Number(qty || 0);
  });
}

function buildHistoryResult({
  openingStock,
  openingAt,
  movementRows,
  currentStock,
}) {
  const totalIn = movementRows
    .filter((m) => m.delta > 0 && m.type !== ROW_SALE && m.type !== ROW_SET_SALE)
    .reduce((s, m) => s + m.delta, 0);
  const totalOut = movementRows
    .filter((m) => m.delta < 0 && m.type !== ROW_SALE && m.type !== ROW_SET_SALE)
    .reduce((s, m) => s + Math.abs(m.delta), 0);
  const totalSales = movementRows
    .filter((m) => m.type === ROW_SALE || m.type === ROW_SET_SALE)
    .reduce((s, m) => s + Math.abs(m.delta), 0);

  const calculatedCurrent = movementRows.length
    ? movementRows[movementRows.length - 1].runningQty
    : Number(openingStock || 0);
  const hasGap = Math.abs(calculatedCurrent - currentStock) > 0.0001;

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
      delta: null,
      runningQty: currentStock,
      type: ROW_CURRENT,
      locked: true,
    },
  ];

  return {
    rows,
    openingStock,
    currentStock,
    calculatedCurrent,
    totalIn,
    totalOut,
    totalSales,
    locationSynced: false,
    hasGap,
  };
}

async function fetchOpeningStock(db, period, productId) {
  if (!period?.id) return { qty: 0, at: null };
  const openingMap = await fetchOpeningStockMap(db, period, [productId]);
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
 * Read-only stock history from adjustment audit rows.
 * Current Stock = live inventory table qty (same as Products Locations column).
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
      const meta = rowMetadata(row);
      const delta = resolveRowDelta(row);
      return {
        id: row.id,
        adjustedAt: row.adjusted_at || null,
        delta,
        type: movementType(row, delta),
        adjustmentType: row.adjustment_type,
        saleId: saleIdFromMeta(meta),
        receiptNumber: meta.receipt_number || null,
      };
    });

  let running = Number(openingStock || 0);
  const movementRows = movements.map((row) => {
    running += row.delta;
    return {
      id: row.id,
      adjustedAt: row.adjustedAt,
      delta: row.delta,
      runningQty: running,
      type: row.type,
      saleId: row.saleId,
      receiptNumber: row.receiptNumber,
      locked: false,
    };
  });

  const salesMeta = await fetchSalesMetaByIds(
    db,
    movementRows.map((row) => row.saleId).filter(Boolean),
  );
  const enrichedRows = enrichMovementRowsWithSaleMeta(movementRows, salesMeta);

  return buildHistoryResult({
    openingStock,
    openingAt,
    movementRows: enrichedRows,
    currentStock,
  });
}

/**
 * Set stock history: replays component adjustments and records when buildable set qty changes.
 * Current Stock = live buildable set count (same as Products list / POS).
 */
export async function fetchComboAdjustmentHistory(
  db,
  { comboId, locationId, comboItems = [], currentQty = null, limit = 200 } = {},
) {
  if (!db) throw new Error('Data client required.');
  if (!comboId || !locationId) throw new Error('comboId and locationId are required.');
  const items = (comboItems || []).filter((row) => row?.product_id && Number(row.quantity) > 0);
  if (!items.length) {
    throw new Error('This set has no components configured.');
  }

  const productIds = items.map((row) => row.product_id);
  const period = await resolveStockPeriod(db, locationId);
  const startISO = period ? (period.begin_period_date || period.opened_at) : null;
  const openingAt = period ? (period.begin_period_date || period.opened_at || null) : null;
  const openingMap = await fetchOpeningStockMap(db, period, productIds);

  const componentStock = {};
  productIds.forEach((productId) => {
    componentStock[String(productId)] = openingMap.get(String(productId)) || 0;
  });
  const openingStock = getMaxSetQty(items, componentStock);

  const liveStock = await fetchLiveInventoryQtyMap(db, productIds, locationId);
  const liveSetQty = getMaxSetQty(items, liveStock);
  const currentStock = Number.isFinite(Number(currentQty)) ? Number(currentQty) : liveSetQty;

  let query = db
    .from('inventory_adjustments')
    .select('id, product_id, quantity, adjustment_type, adjusted_at, metadata')
    .in('product_id', productIds)
    .eq('location_id', locationId);
  if (startISO) query = query.gte('adjusted_at', startISO);

  const { data, error } = await query.order('adjusted_at', { ascending: true }).limit(Math.min(limit, 500));
  if (error) throw error;

  const adjustmentRows = (Array.isArray(data) ? data : []).filter(isMovementRow);
  const loggedSaleIds = collectLoggedSaleIds(adjustmentRows);
  const { combos: relatedCombos, comboItems: relatedComboItems } = await fetchRelatedComboCatalog(db, productIds);
  const comboItemsByCombo = buildComboItemsByCombo(relatedComboItems);
  const saleEvents = await fetchUnloggedComboSaleEvents(db, {
    locationId,
    startISO,
    productIds,
    loggedSaleIds,
    relatedCombos,
    comboItemsByCombo,
  });

  const timeline = [
    ...adjustmentRows.map((row) => ({
      sortAt: row.adjusted_at || '',
      kind: 'adjustment',
      row,
    })),
    ...saleEvents.map((event) => ({
      sortAt: event.at || '',
      kind: 'sale',
      event,
    })),
  ].sort((a, b) => String(a.sortAt).localeCompare(String(b.sortAt)));

  let prevSetQty = openingStock;
  const movementRows = [];
  timeline.forEach((entry) => {
    if (entry.kind === 'adjustment') {
      const row = entry.row;
      const pid = String(row.product_id);
      const delta = resolveRowDelta(row);
      componentStock[pid] = (componentStock[pid] || 0) + delta;
      const meta = rowMetadata(row);
      const newSetQty = getMaxSetQty(items, componentStock);
      if (newSetQty === prevSetQty) return;
      const setDelta = newSetQty - prevSetQty;
      movementRows.push({
        id: row.id,
        adjustedAt: row.adjusted_at || null,
        delta: setDelta,
        runningQty: newSetQty,
        type: comboMovementType(row, setDelta),
        saleId: saleIdFromMeta(meta),
        receiptNumber: meta.receipt_number || null,
        locked: false,
      });
      prevSetQty = newSetQty;
      return;
    }

    const { event } = entry;
    applyUsageDeduction(componentStock, event.usage);
    const newSetQty = getMaxSetQty(items, componentStock);
    if (newSetQty === prevSetQty) return;
    const setDelta = newSetQty - prevSetQty;
    movementRows.push({
      id: event.id,
      adjustedAt: event.at,
      delta: setDelta,
      runningQty: newSetQty,
      type: ROW_SET_SALE,
      saleId: event.saleId,
      receiptNumber: event.receiptNumber || null,
      soldLabel: event.label || null,
      locked: false,
    });
    prevSetQty = newSetQty;
  });

  const salesMeta = await fetchSalesMetaByIds(
    db,
    movementRows.map((row) => row.saleId).filter(Boolean),
  );
  const enrichedRows = enrichMovementRowsWithSaleMeta(movementRows, salesMeta);

  return buildHistoryResult({
    openingStock,
    openingAt,
    movementRows: enrichedRows,
    currentStock,
  });
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
