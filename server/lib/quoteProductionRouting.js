import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { CARPENTRY_WAREHOUSE_NAMES } from '../../src/constants/carpentryWarehouses.js';
import { normalizeCarpentryUom } from '../../src/constants/carpentryUom.js';
import { listCarpentryCatalogProducts } from './carpentryCatalog.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { newUuid } from './uuid.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
  resolvePacketFromScan,
} from '../../src/utils/warehouseScanResolver.js';
import { productionScanResolveCandidates } from '../../src/utils/productionLabelQrScan.js';
import { buildProductionLineSummaryRow } from '../../src/utils/quoteProductionItemFields.js';

const ROUTING = 'quote_production_routing';
const RUNS = 'carpentry_production_runs';
const USAGE = 'carpentry_production_material_usage';
const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const LOCATIONS = 'locations';

export function normalizeProductionRoute(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'carpentry' || v === 'upholstery') return v;
  return null;
}

async function loadAssemblyInventoryQty(sb, assemblyId, locationId) {
  const { data } = await sb
    .from(ASSEMBLY_INVENTORY)
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Number(data?.quantity) || 0;
}

async function adjustAssemblyInventory(sb, assemblyId, locationId, delta) {
  const aid = String(assemblyId || '').trim();
  const loc = String(locationId || '').trim();
  const d = Number(delta) || 0;
  if (!aid || !loc || !d) return;
  const current = await loadAssemblyInventoryQty(sb, aid, loc);
  const next = Math.max(0, current + d);
  const now = new Date().toISOString();
  await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: aid,
    location_id: loc,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
}

async function resolveCarpentryWarehouseLocations(sb) {
  const { data, error } = await sb.from(LOCATIONS).select('id, name').order('name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const byName = new Map((data || []).map((r) => [String(r.name || '').trim(), r]));
  return CARPENTRY_WAREHOUSE_NAMES.map((name) => byName.get(name)).filter(Boolean);
}

function allocateAcrossWarehouses(needQty, qtyByLocationId, locationOrder) {
  const moves = [];
  let remaining = needQty;
  for (const locId of locationOrder) {
    if (remaining <= 0) break;
    const have = Number(qtyByLocationId.get(locId) ?? 0);
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    moves.push({ warehouse_location_id: locId, quantity: take });
    remaining -= take;
  }
  if (remaining > 0.000001) {
    throw new Error(`Insufficient stock (short ${remaining})`);
  }
  return moves;
}

export async function upsertQuoteProductionRoute(sb, quoteId, route, { metadata = {} } = {}) {
  const qid = String(quoteId || '').trim();
  const normalized = normalizeProductionRoute(route);
  if (!qid || !normalized) throw new Error('quote_id and production route (carpentry|upholstery) required');

  const { data: existing } = await sb.from(ROUTING).select('*').eq('quote_id', qid).maybeSingle();
  if (existing?.sent_to_production_at) {
    throw new Error('Production route is locked after send to warehouse');
  }

  const row = {
    quote_id: qid,
    route: normalized,
    metadata: { ...(existing?.metadata || {}), ...(metadata || {}) },
  };
  if (!existing) {
    row.sent_to_production_at = null;
    row.sent_by = null;
    row.accepted_at = null;
    row.completed_at = null;
  }

  const { error } = await sb.from(ROUTING).upsert(row, { onConflict: 'quote_id' });
  if (error) throw new Error(error.message || 'Failed to save production route');
  return row;
}

export async function getQuoteProductionRouting(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  if (!qid) return null;
  const { data, error } = await sb.from(ROUTING).select('*').eq('quote_id', qid).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load routing');
  return data || null;
}

async function loadQuoteBundle(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  const [{ data: quote, error: qErr }, { data: items, error: iErr }, routing] = await Promise.all([
    sb.from('quotations').select('*').eq('id', qid).maybeSingle(),
    sb.from('quotation_items').select('*').eq('quotation_id', qid).order('sort_order'),
    getQuoteProductionRouting(sb, qid),
  ]);
  if (qErr) throw new Error(qErr.message || 'Quote load failed');
  if (iErr) throw new Error(iErr.message || 'Quote items load failed');
  if (!quote) throw new Error('Quote not found');
  return { quote, items: items || [], routing };
}

async function resolveCustomerContact(sb, customerId) {
  const cid = String(customerId || '').trim();
  if (!cid) return { name: '', phone: '' };
  const { data: cust } = await sb.from('customers').select('name, phone').eq('id', cid).maybeSingle();
  if (cust?.name) return { name: cust.name, phone: cust.phone || '' };
  const { data: qc } = await sb.from('quote_customers').select('name, phone').eq('id', cid).maybeSingle();
  return { name: qc?.name || '', phone: qc?.phone || '' };
}

async function resolvePrimaryAssemblyId(sb, items) {
  const { data: assemblies, error } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata, item_kind');
  if (error) throw new Error(error.message || 'Failed to load assemblies');
  const catalog = listCarpentryCatalogProducts(assemblies || []);
  const catalogByName = new Map(catalog.map((p) => [String(p.name || '').trim().toLowerCase(), p.id]));
  for (const line of items || []) {
    const name = String(line.name_override || line.name || '').trim().toLowerCase();
    if (name && catalogByName.has(name)) return catalogByName.get(name);
  }
  if (catalog[0]?.id) return catalog[0].id;
  const firstProduct = (assemblies || []).find((a) => String(a.item_kind || '') !== 'set');
  if (firstProduct?.id) return firstProduct.id;
  throw new Error('Could not resolve a warehouse product for this quote order');
}

export async function sendQuoteToProduction(sb, quoteId, userId) {
  const { quote, items, routing } = await loadQuoteBundle(sb, quoteId);
  if (!routing?.route) throw new Error('Choose Carpentry or Upholstery before sending to production');
  if (routing.sent_to_production_at) throw new Error('Already sent to production');

  const primary_assembly_id = await resolvePrimaryAssemblyId(sb, items);
  const customer = await resolveCustomerContact(sb, quote.customer_id);
  const now = new Date().toISOString();
  const lineSummary = (items || []).map((it) => buildProductionLineSummaryRow(it));

  const { error } = await sb.from(ROUTING).update({
    sent_to_production_at: now,
    sent_by: userId || null,
    metadata: {
      ...(routing.metadata || {}),
      primary_assembly_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      quote_number: quote.quote_number || null,
      lines: lineSummary,
    },
  }).eq('quote_id', String(quoteId));
  if (error) throw new Error(error.message || 'Failed to send to production');

  try {
    const { notifyProductionQuoteOrderSent } = await import('./productionExpoPush.js');
    await notifyProductionQuoteOrderSent({
      route: routing.route,
      quoteNumber: quote.quote_number || routing.metadata?.quote_number,
      customerName: customer.name,
      quoteId,
    });
  } catch (pushErr) {
    console.warn('[sendQuoteToProduction] push notify failed:', pushErr?.message || pushErr);
  }

  return { quote_id: quoteId, route: routing.route, sent_to_production_at: now };
}

async function pushProductionQuoteNotification(sb, quoteId, quote, routing) {
  const customer = await resolveCustomerContact(sb, quote.customer_id);
  const { notifyProductionQuoteOrderSent } = await import('./productionExpoPush.js');
  await notifyProductionQuoteOrderSent({
    route: routing.route,
    quoteNumber: quote.quote_number || routing.metadata?.quote_number,
    customerName: customer.name,
    quoteId,
  });
}

export async function resendQuoteToProduction(sb, quoteId, userId) {
  void userId;
  const { quote, routing } = await loadQuoteBundle(sb, quoteId);
  if (!routing?.route) throw new Error('Choose Carpentry or Upholstery before sending to production');
  if (!routing.sent_to_production_at) {
    return sendQuoteToProduction(sb, quoteId, userId);
  }
  try {
    await pushProductionQuoteNotification(sb, quoteId, quote, routing);
  } catch (pushErr) {
    throw new Error(pushErr?.message || 'Failed to resend order notification');
  }
  return {
    quote_id: quoteId,
    route: routing.route,
    sent_to_production_at: routing.sent_to_production_at,
    resent: true,
  };
}

export async function sendOrResendQuoteToProduction(sb, quoteId, userId) {
  const routing = await getQuoteProductionRouting(sb, quoteId);
  if (routing?.sent_to_production_at) {
    return resendQuoteToProduction(sb, quoteId, userId);
  }
  return sendQuoteToProduction(sb, quoteId, userId);
}

export async function listProductionQuotesForRoute(sb, route, { limit = 100 } = {}) {
  const normalized = normalizeProductionRoute(route);
  if (!normalized) throw new Error('route required');

  const { data: routes, error } = await sb
    .from(ROUTING)
    .select('*')
    .eq('route', normalized)
    .order('sent_to_production_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
  if (error) throw new Error(error.message || 'Failed to list production quotes');

  const sent = (routes || []).filter((r) => r.sent_to_production_at);
  const quoteIds = sent.map((r) => r.quote_id).filter(Boolean);
  let quotes = [];
  if (quoteIds.length) {
    const { data, error: qErr } = await sb.from('quotations').select('id, quote_number, customer_id, total, currency, created_at').in('id', quoteIds);
    if (qErr) throw new Error(qErr.message || 'Failed to load quotes');
    quotes = data || [];
  }
  const quoteById = new Map(quotes.map((q) => [String(q.id), q]));

  const itemsByQuoteId = new Map();
  if (quoteIds.length) {
    const { data: allItems, error: itemsErr } = await sb
      .from('quotation_items')
      .select('*')
      .in('quotation_id', quoteIds)
      .order('sort_order');
    if (itemsErr) throw new Error(itemsErr.message || 'Failed to load quote items');
    for (const it of allItems || []) {
      const qid = String(it.quotation_id);
      if (!itemsByQuoteId.has(qid)) itemsByQuoteId.set(qid, []);
      itemsByQuoteId.get(qid).push(buildProductionLineSummaryRow(it));
    }
  }

  const { data: runs } = quoteIds.length
    ? await sb.from(RUNS).select('*').in('quote_id', quoteIds).eq('source', 'quote_order')
    : { data: [] };
  const runByQuote = new Map((runs || []).map((r) => [String(r.quote_id), r]));

  const rows = [];
  for (const r of sent) {
    const qid = String(r.quote_id);
    const q = quoteById.get(qid);
    const run = runByQuote.get(qid) || null;
    const timerFields = quoteRunListFields(run);
    const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    rows.push({
      quote_id: r.quote_id,
      route: r.route,
      quote_number: q?.quote_number || meta.quote_number || qid,
      customer_name: meta.customer_name || '',
      customer_phone: meta.customer_phone || '',
      total: q?.total ?? null,
      currency: q?.currency ?? null,
      sent_to_production_at: r.sent_to_production_at,
      sent_to_production: Boolean(r.sent_to_production_at),
      accepted_at: r.accepted_at,
      completed_at: r.completed_at,
      run_id: run?.id || null,
      run_started_at: run?.started_at || null,
      run_completed_at: run?.completed_at || null,
      ...timerFields,
      lines: itemsByQuoteId.get(qid) || meta.lines || [],
      drawing_url: meta.drawing_url || null,
      manual_material_lines: Array.isArray(meta.manual_material_lines)
        ? meta.manual_material_lines
        : [],
      quotation_missing: !q,
    });
  }
  return { rows };
}

async function findActiveQuoteRun(sb, quoteId) {
  const { data, error } = await sb
    .from(RUNS)
    .select('*')
    .eq('quote_id', String(quoteId))
    .eq('source', 'quote_order')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load production run');
  return data || null;
}

function quoteRunMeta(run) {
  return run?.metadata && typeof run.metadata === 'object' ? run.metadata : {};
}

function computeQuoteRunElapsedMs(run, nowMs = Date.now()) {
  if (!run || run.completed_at) return 0;
  const meta = quoteRunMeta(run);
  let ms = Math.max(0, Number(meta.accumulated_ms) || 0);
  const paused = String(meta.timer_status || '').toLowerCase() === 'paused' || Boolean(meta.paused_at);
  if (!paused && run.started_at) {
    const started = new Date(run.started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

function quoteRunListFields(run) {
  if (!run) {
    return {
      timer_status: null,
      run_paused_at: null,
      accumulated_ms: 0,
    };
  }
  const meta = quoteRunMeta(run);
  const paused = String(meta.timer_status || '').toLowerCase() === 'paused' || Boolean(meta.paused_at);
  return {
    timer_status: paused ? 'paused' : (run.completed_at ? 'completed' : 'running'),
    run_paused_at: meta.paused_at || null,
    accumulated_ms: Math.max(0, Number(meta.accumulated_ms) || 0),
  };
}

export async function acceptQuoteProductionOrder(sb, { quoteId, route, userId }) {
  const normalized = normalizeProductionRoute(route);
  const qid = String(quoteId || '').trim();
  if (!qid || !normalized) throw new Error('quote_id and route required');

  const { routing } = await loadQuoteBundle(sb, qid);
  if (!routing?.sent_to_production_at) throw new Error('Quote has not been sent to production yet');
  if (routing.route !== normalized) throw new Error('Quote route mismatch');
  if (routing.completed_at) throw new Error('Quote production already completed');

  const existingRun = await findActiveQuoteRun(sb, qid);
  if (existingRun && !existingRun.completed_at) {
    if (!routing.accepted_at) {
      await sb.from(ROUTING).update({ accepted_at: existingRun.started_at || new Date().toISOString() }).eq('quote_id', qid);
    }
    return { run_id: existingRun.id, already_active: true };
  }

  const primaryAssemblyId = routing.metadata?.primary_assembly_id
    || await resolvePrimaryAssemblyId(sb, (await loadQuoteBundle(sb, qid)).items);
  const now = new Date().toISOString();
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'quote_order',
    quote_id: qid,
    assembly_id: primaryAssemblyId,
    product_qty: 1,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: { route: normalized, channel: normalized === 'carpentry' ? 'carpentry_workshop_app' : 'warehouse_production_app' },
    created_at: now,
  });
  if (runErr) throw new Error(runErr.message || 'Failed to start production run');

  const { error: routeErr } = await sb.from(ROUTING).update({ accepted_at: now }).eq('quote_id', qid);
  if (routeErr) throw new Error(routeErr.message || 'Failed to update routing');

  return { run_id: runId, started_at: now };
}

export async function pauseQuoteProductionOrder(sb, { quoteId, route, userId }) {
  void userId;
  void route;
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id required');
  const run = await findActiveQuoteRun(sb, qid);
  if (!run || run.completed_at) throw new Error('No active production run for this quote');
  const meta = { ...quoteRunMeta(run) };
  if (String(meta.timer_status || '').toLowerCase() === 'paused') {
    return { run_id: run.id, already_paused: true, accumulated_ms: computeQuoteRunElapsedMs(run) };
  }
  const accumulated = computeQuoteRunElapsedMs(run);
  const pausedAt = new Date().toISOString();
  const { error } = await sb.from(RUNS).update({
    metadata: {
      ...meta,
      timer_status: 'paused',
      paused_at: pausedAt,
      accumulated_ms: accumulated,
    },
  }).eq('id', run.id);
  if (error) throw new Error(error.message || 'Failed to pause order');
  return { run_id: run.id, paused_at: pausedAt, accumulated_ms: accumulated };
}

export async function resumeQuoteProductionOrder(sb, { quoteId, route, userId }) {
  void userId;
  void route;
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id required');
  const run = await findActiveQuoteRun(sb, qid);
  if (!run || run.completed_at) throw new Error('No active production run for this quote');
  const meta = { ...quoteRunMeta(run) };
  if (String(meta.timer_status || '').toLowerCase() !== 'paused') {
    return { run_id: run.id, already_running: true };
  }
  const accumulated = Math.max(0, Number(meta.accumulated_ms) || 0);
  const resumedAt = new Date().toISOString();
  const { error } = await sb.from(RUNS).update({
    started_at: resumedAt,
    metadata: {
      ...meta,
      timer_status: 'running',
      paused_at: null,
      accumulated_ms: accumulated,
    },
  }).eq('id', run.id);
  if (error) throw new Error(error.message || 'Failed to resume order');
  return { run_id: run.id, resumed_at: resumedAt, accumulated_ms: accumulated };
}

export async function completeQuoteProductionOrder(sb, {
  quoteId,
  userId,
  deferDeliveryQueue = false,
}) {
  void userId;
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id required');
  const run = await findActiveQuoteRun(sb, qid);
  if (!run) throw new Error('No active production run for this quote');
  if (run.completed_at) {
    if (!deferDeliveryQueue) {
      const { data: quoteRow } = await sb.from('quotations').select('id, quote_number').eq('id', qid).maybeSingle();
      const { data: routingRow } = await sb.from(ROUTING).select('route, metadata').eq('quote_id', qid).maybeSingle();
      const alreadyQueued = routingRow?.metadata?.delivery_admin?.stage;
      if (!alreadyQueued) {
        const { registerQuoteOrderAwaitingDriver } = await import('./warehouseDeliveryAdminQueue.js');
        await registerQuoteOrderAwaitingDriver(sb, {
          quoteId: qid,
          assemblyId: run.assembly_id,
          qty: Math.max(1, Number(run.product_qty) || 1),
          route: routingRow?.route || run.metadata?.route || 'upholstery',
          quoteNumber: quoteRow?.quote_number || null,
        });
      }
    }
    return { run_id: run.id, already_completed: true };
  }

  const now = new Date().toISOString();
  const { error: runErr } = await sb.from(RUNS).update({ completed_at: now }).eq('id', run.id);
  if (runErr) throw new Error(runErr.message || 'Failed to complete run');

  await sb.from(ROUTING).update({ completed_at: now }).eq('quote_id', qid);

  const { data: quoteRow } = await sb.from('quotations').select('id, quote_number').eq('id', qid).maybeSingle();
  const { data: routingRow } = await sb.from(ROUTING).select('route').eq('quote_id', qid).maybeSingle();
  if (!deferDeliveryQueue) {
    const { registerQuoteOrderAwaitingDriver } = await import('./warehouseDeliveryAdminQueue.js');
    await registerQuoteOrderAwaitingDriver(sb, {
      quoteId: qid,
      assemblyId: run.assembly_id,
      qty: Math.max(1, Number(run.product_qty) || 1),
      route: routingRow?.route || run.metadata?.route || 'upholstery',
      quoteNumber: quoteRow?.quote_number || null,
      now,
    });
  }

  return { run_id: run.id, completed_at: now, deferred_delivery_queue: Boolean(deferDeliveryQueue) };
}

async function resolveMaterialAssemblyFromScan(sb, scan) {
  const raw = String(scan || '').trim();
  if (!raw) throw new Error('Scan value required');
  const [{ data: packets }, { data: assemblies }] = await Promise.all([
    sb.from('warehouse_packets').select('id, sku, name, assembly_id'),
    sb.from('warehouse_assemblies').select('id, name, family_sku'),
  ]);
  let assemblyId = null;
  for (const candidate of productionScanResolveCandidates(raw)) {
    const packet = resolvePacketFromScan(candidate, packets || []);
    if (packet?.assembly_id) {
      assemblyId = packet.assembly_id;
      break;
    }
  }
  if (!assemblyId) {
    const productKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    const assembly = (assemblies || []).find((a) => {
      const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(a.family_sku));
      for (const k of productKeys) {
        if (k && stored.has(k)) return true;
      }
      return false;
    });
    assemblyId = assembly?.id || null;
  }
  if (!assemblyId) throw new Error('No warehouse product matches this scan');
  return assemblyId;
}

export async function scanQuoteProductionMaterial(sb, {
  quoteId,
  route,
  scan,
  quantity = 1,
  userId = null,
}) {
  const qid = String(quoteId || '').trim();
  const normalized = normalizeProductionRoute(route);
  const qty = Math.max(0.0001, Number(quantity) || 1);
  if (!qid || !normalized) throw new Error('quote_id and route required');

  const { routing } = await loadQuoteBundle(sb, qid);
  if (!routing?.sent_to_production_at) throw new Error('Quote not sent to production');
  if (routing.route !== normalized) throw new Error('Route mismatch');
  if (routing.completed_at) throw new Error('Quote already completed');

  let run = await findActiveQuoteRun(sb, qid);
  if (!run || run.completed_at) {
    const started = await acceptQuoteProductionOrder(sb, { quoteId: qid, route: normalized, userId });
    run = await findActiveQuoteRun(sb, qid);
    if (!run) throw new Error(started?.run_id ? 'Run created but not found' : 'Could not start run');
  }

  const materialAssemblyId = await resolveMaterialAssemblyFromScan(sb, scan);
  const usageRows = [];
  const now = new Date().toISOString();

  if (normalized === 'carpentry') {
    const carpentryLocs = await resolveCarpentryWarehouseLocations(sb);
    if (!carpentryLocs.length) throw new Error('Carpentry warehouses not configured');
    const order = carpentryLocs.map((l) => String(l.id));
    const byLoc = new Map();
    for (const locId of order) {
      byLoc.set(locId, await loadAssemblyInventoryQty(sb, materialAssemblyId, locId));
    }
    const moves = allocateAcrossWarehouses(qty, byLoc, order);
    for (const move of moves) {
      await adjustAssemblyInventory(sb, materialAssemblyId, move.warehouse_location_id, -move.quantity);
      usageRows.push({
        material_assembly_id: materialAssemblyId,
        warehouse_location_id: move.warehouse_location_id,
        quantity: move.quantity,
        uom: normalizeCarpentryUom('ea'),
      });
    }
    for (const loc of carpentryLocs) {
      await recomputeWarehouseLocationStockServer(sb, loc.id);
    }
  } else if (normalized === 'upholstery') {
    const { resolveCarpentryStoreroomLocations } = await import('./storeroomBomDeduction.js');
    const storeroomLocs = await resolveCarpentryStoreroomLocations(sb);
    if (!storeroomLocs.length) throw new Error('Storerooms not configured — run seedCarpentryWarehouseLocations.js');
    const order = storeroomLocs.map((l) => String(l.id));
    const byLoc = new Map();
    for (const locId of order) {
      byLoc.set(locId, await loadAssemblyInventoryQty(sb, materialAssemblyId, locId));
    }
    const moves = allocateAcrossWarehouses(qty, byLoc, order);
    if (!moves.length) throw new Error('Insufficient storeroom stock for this material');
    for (const move of moves) {
      await adjustAssemblyInventory(sb, materialAssemblyId, move.warehouse_location_id, -move.quantity);
      usageRows.push({
        material_assembly_id: materialAssemblyId,
        warehouse_location_id: move.warehouse_location_id,
        quantity: move.quantity,
        uom: normalizeCarpentryUom('ea'),
      });
    }
    for (const loc of storeroomLocs) {
      await recomputeWarehouseLocationStockServer(sb, loc.id);
    }
  } else {
    const have = await loadAssemblyInventoryQty(sb, materialAssemblyId, WAREHOUSE_FACTORY_LOCATION_ID);
    if (have + 0.000001 < qty) throw new Error('Insufficient factory stock for this material');
    await adjustAssemblyInventory(sb, materialAssemblyId, WAREHOUSE_FACTORY_LOCATION_ID, -qty);
    usageRows.push({
      material_assembly_id: materialAssemblyId,
      warehouse_location_id: WAREHOUSE_FACTORY_LOCATION_ID,
      quantity: qty,
      uom: normalizeCarpentryUom('ea'),
    });
    await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_FACTORY_LOCATION_ID);
  }

  for (const row of usageRows) {
    const { error: uErr } = await sb.from(USAGE).insert({
      id: newUuid(),
      run_id: run.id,
      material_assembly_id: row.material_assembly_id,
      warehouse_location_id: row.warehouse_location_id,
      quantity: row.quantity,
      uom: row.uom,
      created_at: now,
    });
    if (uErr) throw new Error(uErr.message || 'Failed to record material usage');
  }

  return {
    run_id: run.id,
    material_assembly_id: materialAssemblyId,
    lines: usageRows.length,
  };
}
