/** STOCKTAKE_PIPELINE_LOCKED — POS sales + transfers feed variance; see docs/stocktake-pdf-pipeline.md */
import { isSetProductId } from './stocktakeSubmitTotals.js';
import {
  applyComboLocationPrices,
  buildComboMembershipIndex,
  indexComboItems,
  resolveSetComponentPricing,
} from './stocktakeSetComponentPricing.js';
import { sumTransfers } from './stocktakeTransferSessions.js';
import {
  computeVarianceLedgerQtys,
  resolveOpeningQtyForVariance,
} from './stocktakeVarianceLedger.js';

export { computeVarianceLedgerQtys, resolveOpeningQtyForVariance } from './stocktakeVarianceLedger.js';

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

async function fetchAllPaged(buildQuery, pageSize = 1000) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return { data: all, error: null };
}

/** One logical qty per product: canonical composite doc wins; else sum legacy rows. */
function collapseStockEntryRowsByProduct(rows) {
  const groups = new Map();
  (rows || []).forEach((r) => {
    if (!r?.product_id) return;
    const pid = String(r.product_id);
    if (!groups.has(pid)) groups.set(pid, []);
    groups.get(pid).push(r);
  });
  const out = [];
  groups.forEach((list) => {
    if (list.length === 1) {
      out.push(list[0]);
      return;
    }
    const compositeRows = list.filter((r) => String(r.id || '').includes('_'));
    if (compositeRows.length >= 1) {
      out.push(compositeRows[0]);
      return;
    }
    const totalQty = list.reduce((sum, r) => sum + Number(r.qty || 0), 0);
    out.push({ ...list[0], qty: totalQty });
  });
  return out;
}

function sumStockEntriesByProduct(rows) {
  const byProduct = new Map();
  collapseStockEntryRowsByProduct(rows).forEach((r) => {
    const pid = String(r.product_id);
    byProduct.set(pid, Number(r.qty || 0));
  });
  return byProduct;
}

function sumCountRowsByProduct(rows) {
  const byProduct = new Map();
  (rows || []).forEach((r) => {
    if (!r?.product_id || isSetProductId(r.product_id)) return;
    const pid = String(r.product_id);
    byProduct.set(pid, (byProduct.get(pid) || 0) + Number(r.qty || 0));
  });
  return byProduct;
}

function countPositiveLines(qtyMap) {
  let n = 0;
  qtyMap.forEach((qty) => {
    if (Number(qty || 0) > 0) n += 1;
  });
  return n;
}

/** Period bounds + which session holds the authoritative closing count after rollover quirks. */
export async function resolveVariancePeriodContext(sb, period) {
  const startISO = period.begin_period_date || period.opened_at;
  const endISO = period.end_period_date || period.closed_at || new Date().toISOString();
  let closingSessionId = String(period.id);
  let rolloverEventId = null;

  if (period.source_event_id) {
    const { data: ev } = await sb
      .from('stocktake_events')
      .select('id, submitted_at, closed_period_id')
      .eq('id', period.source_event_id)
      .maybeSingle();
    if (ev?.id) {
      rolloverEventId = ev.id;
      if (ev.closed_period_id != null && String(ev.closed_period_id) !== String(period.id)) {
        closingSessionId = String(ev.closed_period_id);
      }
    }
  }

  return { startISO, endISO, closingSessionId, rolloverEventId };
}

async function fetchOpeningQtyMap(sb, period) {
  const sessionId = String(period.id);
  const { data: openingRaw, error } = await fetchAllPaged((from, to) =>
    sb.from('opening_stock_entries')
      .select('product_id, qty')
      .eq('session_id', sessionId)
      .order('product_id', { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  const hadOpeningRow = new Set();
  (openingRaw || []).forEach((r) => {
    if (r?.product_id) hadOpeningRow.add(normalizeProductId(r.product_id));
  });
  const openingMap = sumStockEntriesByProduct(openingRaw);

  const { data: initEvent } = await sb
    .from('stocktake_events')
    .select('id')
    .eq('opened_period_id', period.id)
    .eq('is_initial', true)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (initEvent?.id) {
    const { data: countRows, error: cErr } = await fetchAllPaged((from, to) =>
      sb.from('stocktake_counts')
        .select('product_id, qty')
        .eq('event_id', initEvent.id)
        .order('product_id', { ascending: true })
        .range(from, to),
    );
    if (cErr) throw cErr;
    sumCountRowsByProduct(countRows).forEach((qty, pid) => {
      const key = normalizeProductId(pid);
      if (hadOpeningRow.has(key)) return;
      if (Number(qty || 0) > 0) {
        openingMap.set(key, qty);
      }
    });
  }

  return openingMap;
}

async function fetchClosingQtyMap(sb, closingSessionId, rolloverEventId) {
  const { data: closingRaw, error } = await fetchAllPaged((from, to) =>
    sb.from('closing_stock_entries')
      .select('product_id, qty')
      .eq('session_id', closingSessionId)
      .order('product_id', { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  let closingMap = sumStockEntriesByProduct(closingRaw);

  if (countPositiveLines(closingMap) < 5 && rolloverEventId) {
    const { data: countRows, error: cErr } = await fetchAllPaged((from, to) =>
      sb.from('stocktake_counts')
        .select('product_id, qty')
        .eq('event_id', rolloverEventId)
        .order('product_id', { ascending: true })
        .range(from, to),
    );
    if (cErr) throw cErr;
    const fromCounts = sumCountRowsByProduct(countRows);
    if (countPositiveLines(fromCounts) > countPositiveLines(closingMap)) {
      closingMap = fromCounts;
    }
  }

  return closingMap;
}

function saleEffectiveMs(sale) {
  if (sale?.created_at) {
    const t = new Date(sale.created_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (sale?.sale_date) {
    const t = new Date(`${String(sale.sale_date).slice(0, 10)}T12:00:00`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

function saleWithinPeriod(sale, startISO, endISO) {
  const t = saleEffectiveMs(sale);
  if (!Number.isFinite(t)) return false;
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  return t >= startMs && t <= endMs;
}

async function sumSales(sb, locationId, startISO, endISO) {
  const map = new Map();
  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);

  const { data: byDate } = await sb
    .from('sales')
    .select('id, created_at, sale_date')
    .eq('location_id', locationId)
    .not('sale_date', 'is', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate);

  const { data: byCreated } = await sb
    .from('sales')
    .select('id, created_at, sale_date')
    .eq('location_id', locationId)
    .is('sale_date', null)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const saleRows = [...(byDate || []), ...(byCreated || [])];
  const seen = new Set();
  const ids = [];
  saleRows.forEach((s) => {
    if (!s?.id || seen.has(s.id)) return;
    if (!saleWithinPeriod(s, startISO, endISO)) return;
    seen.add(s.id);
    ids.push(s.id);
  });
  if (!ids.length) return map;

  const { data: items } = await sb
    .from('sales_items')
    .select('product_id, quantity')
    .in('sale_id', ids);
  (items || []).forEach((e) => {
    const pid = normalizeProductId(e.product_id);
    if (!pid) return;
    map.set(pid, (map.get(pid) || 0) + Number(e.quantity || 0));
  });
  return map;
}

function activeUnitPrice(product, atDate = new Date()) {
  const promo = Number(product?.promotional_price);
  const standard = Number(product?.price || 0);
  if (!Number.isFinite(promo) || promo <= 0) return standard;
  const start = product.promo_start_date ? new Date(product.promo_start_date) : null;
  const end = product.promo_end_date ? new Date(product.promo_end_date) : null;
  const t = atDate.getTime();
  if (start && t < start.getTime()) return standard;
  if (end && t > end.getTime()) return standard;
  return promo;
}

function normalizeProductId(id) {
  if (id == null || id === '') return '';
  return String(id);
}

function mapGetQty(map, productId) {
  if (!map || productId == null) return 0;
  const key = normalizeProductId(productId);
  if (map.has(key)) return Number(map.get(key) || 0);
  if (map.has(productId)) return Number(map.get(productId) || 0);
  return 0;
}

function includeInVarianceReport({
  recordedOpening,
  sales,
  closingQty,
  transfersIn,
  transfersOut,
}) {
  const openingQty = resolveOpeningQtyForVariance({
    recordedOpening,
    sales,
    transfersIn,
    transfersOut,
    closingQty,
  });
  if (Number(openingQty || 0) > 0) return true;
  if (Number(sales || 0) > 0) return true;
  if (Number(closingQty || 0) > 0) return true;
  if (Number(transfersIn || 0) > 0 || Number(transfersOut || 0) > 0) return true;
  return false;
}

function buildVarianceLedgerRow({
  sku,
  product_name,
  product_id,
  recordedOpening,
  transfersIn,
  transfersOut,
  sales,
  closingQty,
  unitPrice,
  is_set = false,
}) {
  const ledger = computeVarianceLedgerQtys({
    recordedOpening,
    sales,
    transfersIn,
    transfersOut,
    closingQty,
  });
  const unit = Number(unitPrice || 0);
  const variance = ledger.variance;
  return {
    sku: sku || '',
    product_name: product_name || '',
    product_id: product_id || null,
    opening_stock_qty: ledger.opening_stock_qty,
    transfers_in: ledger.transfers_in,
    transfers_out: ledger.transfers_out,
    sales: ledger.sales,
    current_stock_qty: ledger.current_stock_qty,
    closing_stock_qty: ledger.closing_stock_qty,
    variance,
    variance_amount: variance * unit,
    unit_price: unit,
    display_unit_price: unit,
    is_set,
  };
}

export async function buildVarianceRows(sb, period) {
  const locationId = period.location_id;
  const { startISO, endISO, closingSessionId, rolloverEventId } = await resolveVariancePeriodContext(sb, period);
  const priceAt = new Date(endISO);

  const [openingMap, closingMap] = await Promise.all([
    fetchOpeningQtyMap(sb, period),
    fetchClosingQtyMap(sb, closingSessionId, rolloverEventId),
  ]);
  const [transfersIn, transfersOut] = await Promise.all([
    sumTransfers(sb, locationId, startISO, endISO, 'in'),
    sumTransfers(sb, locationId, startISO, endISO, 'out'),
  ]);
  const salesMap = await sumSales(sb, locationId, startISO, endISO);

  const candidateProductIds = new Set();
  openingMap.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });
  salesMap.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });
  closingMap.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });
  transfersIn.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });
  transfersOut.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });

  const includedProductIds = new Set();
  candidateProductIds.forEach((id) => {
    const pid = normalizeProductId(id);
    if (!pid) return;
    const recordedOpening = mapGetQty(openingMap, pid);
    const closingQty = mapGetQty(closingMap, pid);
    const tin = mapGetQty(transfersIn, pid);
    const tout = mapGetQty(transfersOut, pid);
    const sales = mapGetQty(salesMap, pid);
    if (includeInVarianceReport({
      recordedOpening,
      sales,
      closingQty,
      transfersIn: tin,
      transfersOut: tout,
    })) {
      includedProductIds.add(pid);
    }
  });

  let comboMap = new Map();
  let itemsByCombo = new Map();
  let memberships = new Map();
  const locationIdForCombos = period.location_id;
  if (locationIdForCombos) {
    const { data: comboLocs } = await sb
      .from('combo_locations')
      .select('combo_id')
      .eq('location_id', locationIdForCombos);
    const comboIds = [...new Set((comboLocs || []).map((r) => r.combo_id).filter(Boolean))];
    if (comboIds.length) {
      const [{ data: combos }, { data: comboItems }, { data: comboLocPrices }] = await Promise.all([
        sb.from('combos').select(
          'id, combo_name, sku, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date',
        ).in('id', comboIds),
        sb.from('combo_items').select('combo_id, product_id, quantity').in('combo_id', comboIds),
        sb.from('combo_location_prices').select('*').eq('location_id', locationIdForCombos).in('combo_id', comboIds),
      ]);
      comboMap = applyComboLocationPrices(combos || [], locationIdForCombos, comboLocPrices || []);
      itemsByCombo = indexComboItems(comboItems || []);
      memberships = buildComboMembershipIndex(comboItems || []);
      (comboItems || []).forEach((row) => {
        if (row?.product_id) includedProductIds.add(normalizeProductId(row.product_id));
      });
    }
  }

  const productIdsForFetch = [...includedProductIds];
  const productMap = new Map();
  for (const chunk of chunkArray(productIdsForFetch, 150)) {
    if (!chunk.length) continue;
    const { data: products, error } = await sb
      .from('products')
      .select('id, name, sku, price, promotional_price, promo_start_date, promo_end_date')
      .in('id', chunk);
    if (error) throw error;
    (products || []).forEach((p) => productMap.set(normalizeProductId(p.id), p));
  }

  const productRows = [];
  includedProductIds.forEach((productId) => {
    const pid = normalizeProductId(productId);
    if (!pid) return;

    const recordedOpening = mapGetQty(openingMap, pid);
    const closingQty = mapGetQty(closingMap, pid);
    const tin = mapGetQty(transfersIn, pid);
    const tout = mapGetQty(transfersOut, pid);
    const sales = mapGetQty(salesMap, pid);
    if (!includeInVarianceReport({
      recordedOpening,
      sales,
      closingQty,
      transfersIn: tin,
      transfersOut: tout,
    })) {
      return;
    }

    const p = productMap.get(pid) || {};
    const { unitPrice, displayPrice, setComboId } = resolveSetComponentPricing({
      productId: pid,
      productMap,
      comboMap,
      itemsByCombo,
      memberships,
      includedProductIds,
      priceAt,
    });
    const row = buildVarianceLedgerRow({
      sku: p.sku || '',
      product_name: p.name || pid,
      product_id: pid,
      recordedOpening,
      transfersIn: tin,
      transfersOut: tout,
      sales,
      closingQty,
      unitPrice,
      is_set: false,
    });
    row.display_unit_price = displayPrice;
    if (setComboId != null) row.set_combo_id = setComboId;
    productRows.push({
      ...row,
      row_type: 'product',
    });
  });

  return productRows.sort((a, b) =>
    String(a.product_name || '').localeCompare(String(b.product_name || ''), undefined, { sensitivity: 'base' }),
  );
}
