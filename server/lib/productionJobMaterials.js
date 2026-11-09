import { CARPENTRY_WAREHOUSE_NAMES } from '../../src/constants/carpentryWarehouses.js';
import { normalizeCarpentryUom } from '../../src/constants/carpentryUom.js';
import { parseStoreroomMaterialMeta } from '../../src/utils/productionPortalCatalog.js';
import {
  adjustAssemblyInventory,
  loadAssemblyInventoryQty,
  resolveCarpentryStoreroomLocations,
} from './storeroomBomDeduction.js';
import { normalizeProductionRoute } from './quoteProductionRouting.js';
import { newUuid } from './uuid.js';
import { loadMaterialUomAllowedSet } from '../../src/utils/materialUomMutations.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
} from '../../src/utils/warehouseScanResolver.js';

const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';

const JOB_TABLES = {
  upholstery: 'upholstery_production_jobs',
  carpentry: 'carpentry_production_jobs',
  painting: 'painting_production_jobs',
};

const ACTIVE = new Set(['ready', 'running', 'paused']);
const QUOTE_ROUTING = 'quote_production_routing';
const QUOTE_RUNS = 'carpentry_production_runs';
const QUOTE_USAGE = 'carpentry_production_material_usage';

function lineKey(row) {
  return String(row?.material_assembly_id || row?.assembly_id || '').trim();
}

function normalizeLines(raw) {
  const out = [];
  const uomFallback = 'ea';
  for (const row of raw || []) {
    const aid = lineKey(row);
    const q = Math.max(0, Number(row.quantity) || 0);
    if (!aid || q <= 0) continue;
    out.push({
      material_assembly_id: aid,
      assembly_id: aid,
      quantity: q,
      uom: normalizeCarpentryUom(row.uom || uomFallback),
      name: String(row.name || '').trim(),
      family_sku: String(row.family_sku || '').trim(),
    });
  }
  return out;
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
    throw new Error(`Insufficient storeroom stock (short ${remaining})`);
  }
  return moves;
}

export async function listProductionStoreroomMaterials(sb) {
  const storeroomLocs = await resolveCarpentryStoreroomLocations(sb);
  if (!storeroomLocs.length) {
    return { materials: [], storerooms_missing: true };
  }

  const locIds = storeroomLocs.map((l) => String(l.id));
  const [{ data: assemblies, error: aErr }, { data: invRows, error: invErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata'),
    sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity').in('location_id', locIds),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load materials');
  if (invErr) throw new Error(invErr.message || 'Failed to load storeroom stock');

  const qtyByAidLoc = new Map();
  (invRows || []).forEach((r) => {
    const key = `${String(r.assembly_id)}:${String(r.location_id)}`;
    qtyByAidLoc.set(key, Math.max(0, Number(r.quantity) || 0));
  });

  const byAid = new Map();
  for (const asm of assemblies || []) {
    if (!asm?.id) continue;
    const isMaterial = asm?.metadata?.storeroom?.is_storeroom_material === true;
    const aid = String(asm.id);
    let totalQty = 0;
    const perLoc = [];
    for (const loc of storeroomLocs) {
      const q = qtyByAidLoc.get(`${aid}:${String(loc.id)}`) || 0;
      if (q > 0) perLoc.push({ location_id: String(loc.id), location_name: loc.name, quantity: q });
      totalQty += q;
    }
    if (!isMaterial && totalQty <= 0) continue;
    const meta = parseStoreroomMaterialMeta(asm);
    byAid.set(aid, {
      id: aid,
      assembly_id: aid,
      name: String(asm.name || aid).trim(),
      family_sku: String(asm.family_sku || '').trim(),
      uom: meta.default_uom || 'ea',
      quantity: totalQty,
      locations: perLoc,
    });
  }

  const materials = [...byAid.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    materials,
    storeroom_labels: CARPENTRY_WAREHOUSE_NAMES,
  };
}

export async function resolveStoreroomMaterialFromScan(sb, scan) {
  const cleaned = String(scan || '').trim();
  if (!cleaned) throw new Error('Scan value required');
  const keys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(cleaned));
  const probeLower = cleaned.toLowerCase();
  const { data: assemblies, error } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata');
  if (error) throw new Error(error.message || 'Failed to load catalog');

  for (const row of assemblies || []) {
    if (!row?.id) continue;
    const sku = String(row.family_sku || '');
    if (sku && sku.toLowerCase() === probeLower) return String(row.id);
    const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
    for (const k of keys) {
      if (k && stored.has(k)) return String(row.id);
    }
    const name = String(row.name || '').toLowerCase();
    if (name.includes(probeLower)) return String(row.id);
  }
  throw new Error('No storeroom material matches this scan');
}

async function loadJobRow(sb, kind, jobId) {
  const table = JOB_TABLES[kind];
  if (!table) throw new Error('Invalid job kind');
  const { data, error } = await sb.from(table).select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load job');
  if (!data?.id) throw new Error('Job not found');
  const status = String(data.status || '').toLowerCase();
  if (!ACTIVE.has(status)) throw new Error('Job is not active');
  return data;
}

async function loadQuoteProductionOrder(sb, quoteId, productionRoute) {
  const qid = String(quoteId || '').trim();
  const route = normalizeProductionRoute(productionRoute);
  if (!qid || !route) throw new Error('quote_id and production_route (carpentry|upholstery) required');
  const { data, error } = await sb.from(QUOTE_ROUTING).select('*').eq('quote_id', qid).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load quote order');
  if (!data?.quote_id) throw new Error('Quote order not found');
  if (!data.sent_to_production_at) throw new Error('Quote not sent to production');
  if (data.completed_at) throw new Error('Quote order already completed');
  if (String(data.route || '') !== route) throw new Error('Quote route mismatch');
  return data;
}

async function findActiveQuoteRunId(sb, quoteId) {
  const { data } = await sb
    .from(QUOTE_RUNS)
    .select('id')
    .eq('quote_id', String(quoteId))
    .eq('source', 'quote_order')
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : '';
}

async function loadReturnOrder(sb, returnOrderId) {
  const id = String(returnOrderId || '').trim();
  if (!id) throw new Error('return_order_id required');
  const { data, error } = await sb.from('warehouse_return_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load return order');
  if (!data?.id) throw new Error('Return order not found');
  const meta = data.metadata || {};
  if (meta.repair_status === 'completed' || data.completed_at) {
    throw new Error('Repair is already completed');
  }
  return data;
}

/**
 * Set job material lines (absolute qty totals) and deduct storeroom inventory for the delta.
 */
export async function saveProductionJobMaterials(sb, {
  jobKind,
  jobId,
  returnOrderId = null,
  productionRoute = null,
  materialLines = [],
}) {
  const kind = String(jobKind || '').trim().toLowerCase();
  const storeroomLocs = await resolveCarpentryStoreroomLocations(sb);
  if (!storeroomLocs.length) {
    throw new Error('Storerooms not configured — run seedCarpentryWarehouseLocations.js');
  }
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const desired = normalizeLines(materialLines).map((row) => ({
    ...row,
    uom: normalizeCarpentryUom(row.uom, uomAllowed.size ? uomAllowed : undefined),
  }));

  let table = null;
  let entity = null;
  let meta = {};

  if (kind === 'quote') {
    entity = await loadQuoteProductionOrder(sb, jobId, productionRoute);
    meta = { ...(entity.metadata || {}) };
    table = QUOTE_ROUTING;
  } else if (kind === 'repair') {
    entity = await loadReturnOrder(sb, returnOrderId || jobId);
    meta = { ...(entity.metadata || {}) };
    table = 'warehouse_return_orders';
    jobId = entity.id;
  } else {
    entity = await loadJobRow(sb, kind, jobId);
    meta = { ...(entity.metadata || {}) };
    table = JOB_TABLES[kind];
  }

  const prevLines = normalizeLines(meta.manual_material_lines || meta.material_usage_rows || []);
  const prevMap = new Map(prevLines.map((r) => [lineKey(r), r.quantity]));
  const nextMap = new Map(desired.map((r) => [lineKey(r), r.quantity]));

  const allAids = [...new Set([...prevMap.keys(), ...nextMap.keys()])];
  const usageRows = [];

  for (const aid of allAids) {
    const prev = prevMap.get(aid) || 0;
    const next = nextMap.get(aid) || 0;
    const delta = next - prev;
    if (Math.abs(delta) < 0.000001) continue;
    if (delta > 0) {
      const order = storeroomLocs.map((l) => String(l.id));
      const byLoc = new Map();
      for (const locId of order) {
        byLoc.set(locId, await loadAssemblyInventoryQty(sb, aid, locId));
      }
      const moves = allocateAcrossWarehouses(delta, byLoc, order);
      for (const move of moves) {
        await adjustAssemblyInventory(sb, aid, move.warehouse_location_id, -move.quantity);
        usageRows.push({
          material_assembly_id: aid,
          warehouse_location_id: move.warehouse_location_id,
          quantity: move.quantity,
          uom: desired.find((d) => lineKey(d) === aid)?.uom || 'ea',
        });
      }
    } else {
      const addBack = -delta;
      const primaryLoc = String(storeroomLocs[0]?.id || '');
      if (primaryLoc) {
        await adjustAssemblyInventory(sb, aid, primaryLoc, addBack);
        usageRows.push({
          material_assembly_id: aid,
          warehouse_location_id: primaryLoc,
          quantity: -addBack,
          uom: desired.find((d) => lineKey(d) === aid)?.uom || 'ea',
        });
      }
    }
  }

  const mergedUsage = [...normalizeLines(meta.material_usage_rows || [])];
  for (const row of usageRows) {
    if (row.quantity < 0) continue;
    mergedUsage.push(row);
  }

  const nextMeta = {
    ...meta,
    manual_material_lines: desired,
    material_usage_rows: mergedUsage,
    storeroom_location_ids: storeroomLocs.map((l) => l.id).filter(Boolean),
  };

  const now = new Date().toISOString();
  if (kind === 'quote') {
    const { error: qErr } = await sb.from(table).update({ metadata: nextMeta, updated_at: now }).eq('quote_id', jobId);
    if (qErr) throw new Error(qErr.message || 'Failed to save quote materials');
    const runId = await findActiveQuoteRunId(sb, jobId);
    if (runId) {
      for (const row of usageRows) {
        if (row.quantity <= 0) continue;
        const { error: uErr } = await sb.from(QUOTE_USAGE).insert({
          id: newUuid(),
          run_id: runId,
          material_assembly_id: row.material_assembly_id,
          warehouse_location_id: row.warehouse_location_id,
          quantity: row.quantity,
          uom: row.uom,
          created_at: now,
        });
        if (uErr) throw new Error(uErr.message || 'Failed to record quote material usage');
      }
    }
  } else if (kind === 'repair') {
    await sb.from(table).update({ metadata: nextMeta, updated_at: now }).eq('id', jobId);
  } else {
    await sb.from(table).update({ metadata: nextMeta, updated_at: now }).eq('id', jobId);
  }

  for (const loc of storeroomLocs) {
    await recomputeWarehouseLocationStockServer(sb, loc.id);
  }

  return {
    ok: true,
    material_lines: desired,
    deducted_rows: usageRows.filter((r) => r.quantity > 0),
  };
}
