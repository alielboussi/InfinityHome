import {
  buildExpectedQty,
  sumInventoryAdjustmentsByProduct,
} from './inventoryVarianceAdjustments';
import { buildLiveConsolidatedWithSets } from './stocktakeLiveTotals';
import { catalogProductIdsFromRows, positiveInventoryByProductAtLocation } from './stocktakeLocationStock';

export async function sumTransfers(sb, locationId, startISO, endISO, direction) {
  const locCol = direction === 'in' ? 'to_location' : 'from_location';
  const map = new Map();

  const { data: sessionsDt } = await sb
    .from('stock_transfer_sessions')
    .select('id')
    .eq(locCol, locationId)
    .eq('status', 'approved')
    .not('transfer_datetime', 'is', null)
    .gte('transfer_datetime', startISO)
    .lte('transfer_datetime', endISO);

  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);
  const { data: sessionsDate } = await sb
    .from('stock_transfer_sessions')
    .select('id')
    .eq(locCol, locationId)
    .eq('status', 'approved')
    .is('transfer_datetime', null)
    .gte('transfer_date', startDate)
    .lte('transfer_date', endDate);

  const ids = [...new Set([
    ...(sessionsDt || []).map((s) => s.id),
    ...(sessionsDate || []).map((s) => s.id),
  ])];
  if (!ids.length) return map;

  const { data: entries } = await sb
    .from('stock_transfer_entries')
    .select('product_id, quantity')
    .in('session_id', ids);
  (entries || []).forEach((e) => {
    map.set(e.product_id, (map.get(e.product_id) || 0) + Number(e.quantity || 0));
  });
  return map;
}

export async function sumSales(sb, locationId, startISO, endISO) {
  const map = new Map();
  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);

  const { data: byDate } = await sb
    .from('sales')
    .select('id')
    .eq('location_id', locationId)
    .not('sale_date', 'is', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate);

  const { data: byCreated } = await sb
    .from('sales')
    .select('id')
    .eq('location_id', locationId)
    .is('sale_date', null)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const ids = [...new Set([
    ...(byDate || []).map((s) => s.id),
    ...(byCreated || []).map((s) => s.id),
  ])];
  if (!ids.length) return map;

  const { data: items } = await sb
    .from('sales_items')
    .select('product_id, quantity')
    .in('sale_id', ids);
  (items || []).forEach((e) => {
    map.set(e.product_id, (map.get(e.product_id) || 0) + Number(e.quantity || 0));
  });
  return map;
}

/** System stock rows for an open period (before closing counts are entered). */
export async function buildCountSheetRows(sb, period) {
  const locationId = period.location_id;
  const startISO = period.begin_period_date || period.opened_at;
  const endISO = new Date().toISOString();

  const { data: opening } = await sb
    .from('opening_stock_entries')
    .select('product_id, qty')
    .eq('session_id', period.id);

  const openingMap = new Map((opening || []).map((r) => [r.product_id, Number(r.qty || 0)]));
  const transfersIn = await sumTransfers(sb, locationId, startISO, endISO, 'in');
  const transfersOut = await sumTransfers(sb, locationId, startISO, endISO, 'out');
  const salesMap = await sumSales(sb, locationId, startISO, endISO);
  const { inMap: inventoryIn, outMap: inventoryOut } = await sumInventoryAdjustmentsByProduct(sb, {
    locationId,
    startISO,
    endISO,
  });

  const { data: liveInv } = await sb
    .from('inventory')
    .select('product_id, quantity, location')
    .eq('location', locationId);

  const { data: locProducts } = await sb
    .from('product_locations')
    .select('product_id')
    .eq('location_id', locationId);

  const { data: comboLocs } = await sb.from('combo_locations').select('combo_id').eq('location_id', locationId);
  const comboIds = (comboLocs || []).map((r) => r.combo_id);
  let combos = [];
  let comboItems = [];
  if (comboIds.length) {
    const { data: c } = await sb.from('combos').select('id, combo_name, sku').in('id', comboIds);
    const { data: ci } = await sb.from('combo_items').select('combo_id, product_id, quantity').in('combo_id', comboIds);
    combos = c || [];
    comboItems = ci || [];
  }

  const productIds = catalogProductIdsFromRows({
    locationId,
    inventoryRows: liveInv,
    productLocationRows: locProducts,
    comboItemRows: comboItems,
  });
  positiveInventoryByProductAtLocation(liveInv, locationId).forEach((_qty, productId) => {
    productIds.add(productId);
  });
  openingMap.forEach((qty, productId) => {
    if (Number(qty) > 0) productIds.add(productId);
  });
  if (!productIds.size) return [];

  const idList = Array.from(productIds);
  const productMap = new Map();
  const chunkSize = 200;
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize);
    const { data: products, error } = await sb
      .from('products')
      .select('id, name, sku')
      .in('id', chunk);
    if (error) throw error;
    (products || []).forEach((p) => productMap.set(p.id, p));
  }

  const expectedByProduct = new Map();
  productIds.forEach((productId) => {
    expectedByProduct.set(productId, buildExpectedQty({
      opening: openingMap.get(productId) || 0,
      transfersIn: transfersIn.get(productId) || 0,
      transfersOut: transfersOut.get(productId) || 0,
      inventoryIn: inventoryIn.get(productId) || 0,
      inventoryOut: inventoryOut.get(productId) || 0,
      sales: salesMap.get(productId) || 0,
    }));
  });

  const remaining = new Map(expectedByProduct);
  const setRows = [];
  for (const combo of combos) {
    const comps = comboItems.filter((i) => i.combo_id === combo.id);
    if (!comps.length) continue;
    let maxSets = Infinity;
    comps.forEach((comp) => {
      const have = remaining.get(comp.product_id) || 0;
      const need = Number(comp.quantity || 0);
      if (need <= 0) return;
      maxSets = Math.min(maxSets, Math.floor(have / need));
    });
    if (!Number.isFinite(maxSets) || maxSets <= 0) continue;
    comps.forEach((comp) => {
      const need = Number(comp.quantity || 0) * maxSets;
      remaining.set(comp.product_id, (remaining.get(comp.product_id) || 0) - need);
    });
    const openQty = Math.floor(Math.min(...comps.map((comp) => {
      const need = Number(comp.quantity || 0) || 1;
      return (openingMap.get(comp.product_id) || 0) / need;
    })));
    let tin = 0;
    let tout = 0;
    let invIn = 0;
    let invOut = 0;
    let sales = 0;
    comps.forEach((comp) => {
      const need = Number(comp.quantity || 0);
      if (need <= 0) return;
      tin += (transfersIn.get(comp.product_id) || 0) / need;
      tout += (transfersOut.get(comp.product_id) || 0) / need;
      invIn += (inventoryIn.get(comp.product_id) || 0) / need;
      invOut += (inventoryOut.get(comp.product_id) || 0) / need;
      sales += (salesMap.get(comp.product_id) || 0) / need;
    });
    const expected = buildExpectedQty({
      opening: openQty,
      transfersIn: Math.floor(tin),
      transfersOut: Math.floor(tout),
      inventoryIn: Math.floor(invIn),
      inventoryOut: Math.floor(invOut),
      sales: Math.floor(sales),
    });
    setRows.push({
      product_id: `set:${combo.id}`,
      sku: combo.sku || '',
      product_name: combo.combo_name,
      opening_stock_qty: openQty,
      transfers_in: Math.floor(tin),
      transfers_out: Math.floor(tout),
      inventory_in: Math.floor(invIn),
      inventory_out: Math.floor(invOut),
      sales: Math.floor(sales),
      expected_qty: expected,
      closing_stock_qty: maxSets,
      is_set: true,
    });
  }

  const productRows = [];
  remaining.forEach((systemQty, productId) => {
    if (systemQty <= 0) return;
    const p = productMap.get(productId) || {};
    const openingQty = openingMap.get(productId) || 0;
    const tin = transfersIn.get(productId) || 0;
    const tout = transfersOut.get(productId) || 0;
    const invIn = inventoryIn.get(productId) || 0;
    const invOut = inventoryOut.get(productId) || 0;
    const sales = salesMap.get(productId) || 0;
    productRows.push({
      product_id: productId,
      sku: p.sku || '',
      product_name: p.name || productId,
      opening_stock_qty: openingQty,
      transfers_in: tin,
      transfers_out: tout,
      inventory_in: invIn,
      inventory_out: invOut,
      sales,
      expected_qty: systemQty,
      closing_stock_qty: systemQty,
      is_set: false,
    });
  });

  let merged = [...setRows, ...productRows]
    .filter((row) => Number(row.closing_stock_qty) > 0)
    .sort((a, b) => String(a.product_name).localeCompare(String(b.product_name)));

  merged = await mergeActiveSessionCountRows(sb, locationId, combos, comboItems, merged);
  return merged;
}

function countSheetRowKey(row) {
  const sku = String(row?.sku || '').trim().toLowerCase();
  const name = String(row?.product_name || row?.name || '').trim().toLowerCase();
  const kind = row?.is_set || String(row?.product_id || '').startsWith('set:') ? 'set' : 'product';
  return `${kind}:${sku}:${name}`;
}

/** Lines counted in an open session but not yet in system expected stock (e.g. set components). */
async function mergeActiveSessionCountRows(sb, locationId, combos, comboItems, rows) {
  const { data: event } = await sb
    .from('stocktake_events')
    .select('id')
    .eq('location_id', locationId)
    .eq('status', 'counting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!event?.id) return rows;

  const [{ data: counts }, { data: setScans }] = await Promise.all([
    sb.from('stocktake_counts').select('product_id, qty, standalone_qty, user_email').eq('event_id', event.id),
    sb.from('stocktake_set_scans').select('combo_id, user_email, set_qty, updated_at').eq('event_id', event.id),
  ]);
  if (!(counts?.length || setScans?.length)) return rows;

  const liveRows = buildLiveConsolidatedWithSets({
    counts: counts || [],
    combos: combos || [],
    comboItems: comboItems || [],
    setScans: setScans || [],
  });

  const existing = new Set(rows.map((r) => countSheetRowKey(r)));
  const extra = [];
  liveRows.forEach((lr) => {
    const isSet = lr.row_type === 'set';
    const draft = {
      product_id: lr.product_id,
      sku: lr.sku || '',
      product_name: lr.name || '',
      is_set: isSet,
    };
    const key = countSheetRowKey(draft);
    if (existing.has(key)) return;
    const qty = Number(lr.qty || 0);
    if (qty <= 0) return;
    existing.add(key);
    extra.push({
      ...draft,
      opening_stock_qty: 0,
      transfers_in: 0,
      transfers_out: 0,
      inventory_in: 0,
      inventory_out: 0,
      sales: 0,
      expected_qty: qty,
      closing_stock_qty: qty,
    });
  });

  if (!extra.length) return rows;
  return [...rows, ...extra].sort((a, b) =>
    String(a.product_name).localeCompare(String(b.product_name), undefined, { sensitivity: 'base' }),
  );
}
