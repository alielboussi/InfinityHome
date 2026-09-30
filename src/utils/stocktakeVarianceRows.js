import { isSetProductId } from './stocktakeSubmitTotals.js';

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

function sumStockEntriesByProduct(rows) {
  const byProduct = new Map();
  (rows || []).forEach((r) => {
    if (!r?.product_id) return;
    const pid = String(r.product_id);
    byProduct.set(pid, (byProduct.get(pid) || 0) + Number(r.qty || 0));
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
      if (Number(qty || 0) > 0) {
        openingMap.set(normalizeProductId(pid), qty);
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

async function sumTransfers(sb, locationId, startISO, endISO, direction) {
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
    map.set(e.product_id, (map.get(e.product_id) || 0) + Number(e.quantity || 0));
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

function includeInVarianceReport({ openingQty, closingQty, transfersIn, sales }) {
  const o = Number(openingQty || 0);
  const c = Number(closingQty || 0);
  const t = Number(transfersIn || 0);
  const s = Number(sales || 0);
  if (o > 0) return true;
  if (c > 0 || t > 0 || s > 0) return true;
  return false;
}

function buildVarianceLedgerRow({
  sku,
  product_name,
  product_id,
  openingQty,
  transfersIn,
  sales,
  closingQty,
  unitPrice,
  is_set = false,
}) {
  const o = Number(openingQty || 0);
  const tin = Number(transfersIn || 0);
  const s = Number(sales || 0);
  const closing = Number(closingQty || 0);
  const currentStock = o + tin - s;
  const variance = closing - currentStock;
  const unit = Number(unitPrice || 0);
  return {
    sku: sku || '',
    product_name: product_name || '',
    product_id: product_id || null,
    opening_stock_qty: o,
    transfers_in: tin,
    sales: s,
    current_stock_qty: currentStock,
    closing_stock_qty: closing,
    variance,
    variance_amount: variance * unit,
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
  const transfersIn = await sumTransfers(sb, locationId, startISO, endISO, 'in');
  const salesMap = await sumSales(sb, locationId, startISO, endISO);

  const candidateProductIds = new Set();
  openingMap.forEach((_, id) => candidateProductIds.add(id));
  closingMap.forEach((_, id) => candidateProductIds.add(id));
  transfersIn.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });
  salesMap.forEach((qty, id) => {
    if (Number(qty || 0) > 0) candidateProductIds.add(normalizeProductId(id));
  });

  const includedProductIds = new Set();
  candidateProductIds.forEach((id) => {
    const pid = normalizeProductId(id);
    if (!pid) return;
    const openingQty = mapGetQty(openingMap, pid);
    const closingQty = mapGetQty(closingMap, pid);
    const tin = mapGetQty(transfersIn, pid);
    const sales = mapGetQty(salesMap, pid);
    if (includeInVarianceReport({ openingQty, closingQty, transfersIn: tin, sales })) {
      includedProductIds.add(pid);
    }
  });

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

  const { data: comboLocs } = await sb.from('combo_locations').select('combo_id').eq('location_id', locationId);
  const comboIds = (comboLocs || []).map((r) => r.combo_id);
  let combos = [];
  let comboItems = [];
  if (comboIds.length) {
    const { data: c } = await sb.from('combos').select('id, combo_name, sku, standard_price, combo_price').in('id', comboIds);
    const { data: ci } = await sb.from('combo_items').select('combo_id, product_id, quantity').in('combo_id', comboIds);
    combos = c || [];
    comboItems = ci || [];
  }

  const productToCombo = new Map();
  combos.forEach((combo) => {
    comboItems
      .filter((i) => i.combo_id === combo.id)
      .forEach((ci) => {
        const pid = normalizeProductId(ci.product_id);
        if (pid) productToCombo.set(pid, combo);
      });
  });

  const productRows = [];
  includedProductIds.forEach((productId) => {
    const pid = normalizeProductId(productId);
    if (!pid) return;

    const openingQty = mapGetQty(openingMap, pid);
    const closingQty = mapGetQty(closingMap, pid);
    const tin = mapGetQty(transfersIn, pid);
    const sales = mapGetQty(salesMap, pid);
    if (!includeInVarianceReport({ openingQty, closingQty, transfersIn: tin, sales })) {
      return;
    }

    const p = productMap.get(pid) || {};
    const unit = activeUnitPrice(p, priceAt);
    productRows.push({
      ...buildVarianceLedgerRow({
        sku: p.sku || '',
        product_name: p.name || pid,
        product_id: pid,
        openingQty,
        transfersIn: tin,
        sales,
        closingQty,
        unitPrice: unit,
        is_set: false,
      }),
      row_type: 'product',
    });
  });

  return orderVarianceRowsWithSetHeaders(productRows, productToCombo, combos);
}

/** Liva opening stock uses #00298 wardrobe; group all Liva BOM lines under the 6-door set title. */
function resolveComboGroupForProduct(pid, productToCombo, combos) {
  const combo = productToCombo.get(pid);
  if (!combo) return null;
  const liva6 = (combos || []).find((c) => /6\s*door/i.test(String(c.combo_name || '')));
  const livaSliding = (combos || []).find((c) =>
    c.id === 44 || /wardrobe sliding door/i.test(String(c.combo_name || '')),
  );
  if (liva6 && livaSliding && (combo.id === livaSliding.id || combo.id === liva6.id)) {
    return liva6;
  }
  return combo;
}

/** Component-level lines grouped under set title rows (no separate set SKU line). */
function orderVarianceRowsWithSetHeaders(productRows, productToCombo, combos) {
  const byCombo = new Map();
  const standalone = [];

  (productRows || []).forEach((row) => {
    const pid = normalizeProductId(row.product_id);
    const combo = resolveComboGroupForProduct(pid, productToCombo, combos);
    if (combo) {
      const key = String(combo.id);
      if (!byCombo.has(key)) byCombo.set(key, { combo, rows: [] });
      byCombo.get(key).rows.push(row);
    } else {
      standalone.push(row);
    }
  });

  const out = [];
  standalone
    .sort((a, b) => String(a.product_name).localeCompare(String(b.product_name), undefined, { sensitivity: 'base' }))
    .forEach((r) => out.push(r));

  const comboGroups = [...byCombo.values()].sort((a, b) =>
    String(a.combo.combo_name || '').localeCompare(String(b.combo.combo_name || ''), undefined, { sensitivity: 'base' }),
  );

  comboGroups.forEach(({ combo, rows }) => {
    if (!rows.length) return;
    out.push({
      row_type: 'set_header',
      product_name: combo.combo_name || combo.name || 'Set',
      sku: combo.sku || '',
    });
    rows
      .sort((a, b) => String(a.product_name).localeCompare(String(b.product_name), undefined, { sensitivity: 'base' }))
      .forEach((r) => out.push(r));
  });

  return out;
}
