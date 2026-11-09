import { CARPENTRY_WAREHOUSE_NAMES } from '../../src/constants/carpentryWarehouses.js';
import { labelFromMaterialUomCode, normalizeCarpentryUom } from '../../src/constants/carpentryUom.js';
import { parseStoreroomMaterialMeta } from '../../src/utils/productionPortalCatalog.js';
import {
  adjustAssemblyInventory,
  loadAssemblyInventoryQty,
  resolveCarpentryStoreroomLocations,
  warehousePickOrder,
} from './storeroomBomDeduction.js';
import { normalizeProductionRoute } from './quoteProductionRouting.js';
import { newUuid } from './uuid.js';
import {
  loadMaterialUomAllowedSet,
  listMaterialUoms,
  materialUomSelectOptions,
} from '../../src/utils/materialUomMutations.js';
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

/** Canonical assembly id (legacy rows may embed `#location_id` in material_assembly_id). */
export function materialAssemblyIdFromStoredRow(row) {
  const raw = String(row?.material_assembly_id || row?.assembly_id || '').trim();
  return assemblyIdFromLineKey(raw);
}

export function warehouseLocationIdFromStoredRow(row) {
  const explicit = String(row?.warehouse_location_id || row?.warehouseLocationId || '').trim();
  if (explicit) return explicit;
  return storeroomLocFromLineKey(String(row?.material_assembly_id || row?.assembly_id || ''));
}

function lineKey(row) {
  const aid = materialAssemblyIdFromStoredRow(row);
  const loc = warehouseLocationIdFromStoredRow(row);
  if (!aid) return '';
  return loc ? `${aid}#${loc}` : aid;
}

const MATERIAL_REF_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function assemblyIdFromLineKey(key) {
  const s = String(key || '');
  const i = s.indexOf('#');
  return i >= 0 ? s.slice(0, i) : s;
}

export function uuidsInMaterialRef(raw) {
  return [...new Set(String(raw || '').match(MATERIAL_REF_UUID_RE) || [])];
}

function usageRowsMatchLine(usage, line) {
  const loc = warehouseLocationIdFromStoredRow(line);
  const uLoc = warehouseLocationIdFromStoredRow(usage);
  if (!loc || !uLoc || loc !== uLoc) return false;
  const qty = Math.max(0, Number(line.quantity) || 0);
  const uQty = Math.max(0, Number(usage.quantity) || 0);
  return Math.abs(qty - uQty) < 0.001;
}

/** Legacy manual lines may embed `#storeroom_id` in material_assembly_id; usage rows keep the real id. */
export function reconcileManualMaterialLineWithUsage(line, usageRows) {
  const base = { ...(line || {}) };
  const loc = warehouseLocationIdFromStoredRow(base);
  let usage = (usageRows || []).find((u) => usageRowsMatchLine(u, base));
  if (!usage && loc) {
    usage = (usageRows || []).find((u) => warehouseLocationIdFromStoredRow(u) === loc);
  }
  const fromUsageAid = usage ? materialAssemblyIdFromStoredRow(usage) : '';
  const primaryAid = materialAssemblyIdFromStoredRow(base);
  const aid = fromUsageAid || primaryAid;
  return {
    ...base,
    material_assembly_id: aid,
    assembly_id: aid,
    warehouse_location_id: loc || warehouseLocationIdFromStoredRow(usage) || null,
    name: String(base.name || usage?.name || '').trim(),
    family_sku: String(base.family_sku || usage?.family_sku || '').trim(),
    uom: base.uom || usage?.uom,
    uom_label: base.uom_label || usage?.uom_label,
    storeroom_label: base.storeroom_label || usage?.storeroom_label,
  };
}

export function manualMaterialLinesNeedMetadataRepair(rawLines, enrichedLines) {
  const raw = Array.isArray(rawLines) ? rawLines : [];
  const next = Array.isArray(enrichedLines) ? enrichedLines : [];
  if (raw.some((row) => String(row?.material_assembly_id || '').includes('#'))) return true;
  if (raw.length !== next.length) return true;
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i];
    const b = next[i];
    if (materialAssemblyIdFromStoredRow(a) !== materialAssemblyIdFromStoredRow(b)) return true;
    if (String(a?.storeroom_label || '') !== String(b?.storeroom_label || '')) return true;
  }
  return false;
}

function storeroomLocFromLineKey(key) {
  const s = String(key || '');
  const i = s.indexOf('#');
  return i >= 0 ? s.slice(i + 1) : '';
}

function isStoreroomMaterialAssembly(asm) {
  return asm?.metadata?.storeroom?.is_storeroom_material === true;
}

function displayStoreroomMaterialUomLabel(code, labelByCode) {
  const c = normalizeCarpentryUom(code || 'ea') || 'ea';
  const fromDb = labelByCode.get(c);
  if (fromDb && String(fromDb).trim() && String(fromDb).toLowerCase() !== c.toLowerCase()) {
    return String(fromDb).trim();
  }
  if (c.toLowerCase() === 'box_es' || c.toLowerCase() === 'boxes') return 'Box (es)';
  const human = labelFromMaterialUomCode(c);
  if (/_es$/i.test(c) && human) {
    return human.replace(/\s+Es$/i, ' (es)').replace(/\s+\(Es\)$/i, ' (es)');
  }
  return human || c;
}

function mergeMaterialsByFamilySku(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const skuKey = normalizeWarehouseProductSku(row.family_sku) || String(row.assembly_id || row.id);
    if (!skuKey) continue;
    const prev = map.get(skuKey);
    if (!prev) {
      map.set(skuKey, {
        ...row,
        locations: [...(row.locations || [])],
        _canonicalQty: Number(row.quantity) || 0,
      });
      continue;
    }
    prev.quantity = (Number(prev.quantity) || 0) + (Number(row.quantity) || 0);
    const locById = new Map((prev.locations || []).map((loc) => [String(loc.location_id), { ...loc }]));
    for (const loc of row.locations || []) {
      const id = String(loc.location_id);
      const existing = locById.get(id);
      if (existing) existing.quantity = (Number(existing.quantity) || 0) + (Number(loc.quantity) || 0);
      else locById.set(id, { ...loc });
    }
    prev.locations = [...locById.values()];
    if ((Number(row.quantity) || 0) > (Number(prev._canonicalQty) || 0)) {
      prev.assembly_id = row.assembly_id;
      prev.id = row.id;
      prev._canonicalQty = Number(row.quantity) || 0;
    }
  }
  return [...map.values()].map((row) => {
    const { _canonicalQty, ...rest } = row;
    return rest;
  });
}

function normalizeLines(raw) {
  const out = [];
  const uomFallback = 'ea';
  for (const row of raw || []) {
    const aid = materialAssemblyIdFromStoredRow(row);
    const q = Math.max(0, Number(row.quantity) || 0);
    if (!aid || q <= 0) continue;
    const loc = warehouseLocationIdFromStoredRow(row);
    out.push({
      material_assembly_id: aid,
      assembly_id: aid,
      quantity: q,
      uom: normalizeCarpentryUom(row.uom || uomFallback),
      name: String(row.name || '').trim(),
      family_sku: String(row.family_sku || '').trim(),
      warehouse_location_id: loc || null,
      storeroom_label: String(row.storeroom_label || '').trim(),
      uom_label: String(row.uom_label || '').trim(),
    });
  }
  return out;
}

function storeroomDisplayLabelForId(locationId, storeroomLocs) {
  const id = String(locationId || '').trim();
  if (!id) return '';
  const idx = (storeroomLocs || []).findIndex((l) => String(l.id) === id);
  if (idx >= 0 && CARPENTRY_WAREHOUSE_NAMES[idx]) {
    return `Storeroom ${idx + 1}`;
  }
  const hit = (storeroomLocs || []).find((l) => String(l.id) === id);
  return hit?.name ? String(hit.name) : '';
}

/** Enrich saved job lines for API/clients (name, SKU, UOM labels, storeroom labels). */
export async function enrichManualMaterialLines(sb, lines, options = {}) {
  const usageRows = options.usageRows || [];
  const src = (Array.isArray(lines) ? lines : [])
    .map((row) => reconcileManualMaterialLineWithUsage(row, usageRows));
  if (!src.length) return [];
  const storeroomLocs = await resolveCarpentryStoreroomLocations(sb);
  const aidSet = new Set();
  for (const row of src) {
    for (const id of uuidsInMaterialRef(row?.material_assembly_id || row?.assembly_id)) {
      aidSet.add(id);
    }
    const primary = materialAssemblyIdFromStoredRow(row);
    if (primary) aidSet.add(primary);
  }
  for (const u of usageRows || []) {
    const id = materialAssemblyIdFromStoredRow(u);
    if (id) aidSet.add(id);
  }
  const aids = [...aidSet];
  const [{ data: assemblies, error: asmErr }, uomRows] = await Promise.all([
    aids.length
      ? sb.from(ASSEMBLIES).select('id, name, family_sku, metadata').in('id', aids)
      : Promise.resolve({ data: [] }),
    listMaterialUoms(sb).catch(() => []),
  ]);
  if (asmErr) throw new Error(asmErr.message || 'Failed to load materials for job lines');
  const byId = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const uomLabelByCode = new Map((uomRows || []).map((r) => [String(r.code), String(r.label || r.code)]));

  return src
    .map((row) => {
      let aid = materialAssemblyIdFromStoredRow(row);
      let asm = byId.get(aid);
      if (!asm) {
        for (const alt of uuidsInMaterialRef(row.material_assembly_id || row.assembly_id)) {
          const hit = byId.get(alt);
          if (hit) {
            aid = alt;
            asm = hit;
            break;
          }
        }
      }
      const usage = (usageRows || []).find((u) => usageRowsMatchLine(u, row));
      const loc = warehouseLocationIdFromStoredRow(row);
      const metaUom = asm ? parseStoreroomMaterialMeta(asm).default_uom : '';
      const uom = normalizeCarpentryUom(row.uom || usage?.uom || metaUom || 'ea');
      const qty = Math.max(0, Number(row.quantity) || 0);
      const name = String(row.name || '').trim()
        || String(asm?.name || '').trim()
        || String(usage?.name || '').trim();
      const familySku = String(row.family_sku || '').trim()
        || String(asm?.family_sku || '').trim()
        || String(usage?.family_sku || '').trim();
      return {
        material_assembly_id: aid,
        assembly_id: aid,
        quantity: qty,
        uom,
        uom_label: String(row.uom_label || usage?.uom_label || '').trim()
          || displayStoreroomMaterialUomLabel(uom, uomLabelByCode),
        name,
        family_sku: familySku,
        warehouse_location_id: loc || null,
        storeroom_label: String(row.storeroom_label || usage?.storeroom_label || '').trim()
          || storeroomDisplayLabelForId(loc, storeroomLocs),
      };
    })
    .filter((line) => line.material_assembly_id && line.quantity > 0);
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
  const [{ data: assemblies, error: aErr }, { data: invRows, error: invErr }, uomRows] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata'),
    sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity').in('location_id', locIds),
    listMaterialUoms(sb).catch(() => []),
  ]);
  const uomLabelByCode = new Map((uomRows || []).map((r) => [String(r.code), String(r.label || r.code)]));
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
    const isMaterial = isStoreroomMaterialAssembly(asm);
    const aid = String(asm.id);
    let totalQty = 0;
    const perLoc = [];
    for (const loc of storeroomLocs) {
      const q = qtyByAidLoc.get(`${aid}:${String(loc.id)}`) || 0;
      if (q > 0) perLoc.push({ location_id: String(loc.id), location_name: loc.name, quantity: q });
      totalQty += q;
    }
    if (!isMaterial) continue;
    if (totalQty <= 0) continue;
    const meta = parseStoreroomMaterialMeta(asm);
    const uomCode = meta.default_uom || 'ea';
    byAid.set(aid, {
      id: aid,
      assembly_id: aid,
      name: String(asm.name || aid).trim(),
      family_sku: String(asm.family_sku || '').trim(),
      uom: uomCode,
      uom_label: displayStoreroomMaterialUomLabel(uomCode, uomLabelByCode),
      quantity: totalQty,
      locations: perLoc,
    });
  }

  const materials = mergeMaterialsByFamilySku([...byAid.values()])
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    materials,
    uom_options: materialUomSelectOptions(uomRows || []),
    storeroom_labels: CARPENTRY_WAREHOUSE_NAMES,
    storerooms: storeroomLocs.map((loc, i) => ({
      id: String(loc.id),
      name: String(loc.name || ''),
      label: CARPENTRY_WAREHOUSE_NAMES[i] || String(loc.name || ''),
    })),
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
  preferredStoreroomLocationId = null,
}) {
  const kind = String(jobKind || '').trim().toLowerCase();
  const storeroomLocs = await resolveCarpentryStoreroomLocations(sb);
  if (!storeroomLocs.length) {
    throw new Error('Storerooms not configured — run seedCarpentryWarehouseLocations.js');
  }
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const uomRows = await listMaterialUoms(sb).catch(() => []);
  const uomLabelByCode = new Map((uomRows || []).map((r) => [String(r.code), String(r.label || r.code)]));
  const desired = normalizeLines(materialLines).map((row) => {
    const uom = normalizeCarpentryUom(row.uom, uomAllowed.size ? uomAllowed : undefined);
    const loc = row.warehouse_location_id;
    return {
      ...row,
      uom,
      uom_label: row.uom_label || displayStoreroomMaterialUomLabel(uom, uomLabelByCode),
      storeroom_label: row.storeroom_label || storeroomDisplayLabelForId(loc, storeroomLocs),
    };
  });

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

  const allKeys = [...new Set([...prevMap.keys(), ...nextMap.keys()])];
  const usageRows = [];

  for (const key of allKeys) {
    const prev = prevMap.get(key) || 0;
    const next = nextMap.get(key) || 0;
    const delta = next - prev;
    if (Math.abs(delta) < 0.000001) continue;
    const aid = assemblyIdFromLineKey(key);
    const lineMeta = desired.find((d) => lineKey(d) === key)
      || prevLines.find((d) => lineKey(d) === key);
    const lineLoc = String(
      lineMeta?.warehouse_location_id || storeroomLocFromLineKey(key) || '',
    ).trim() || null;
    if (delta > 0) {
      const order = warehousePickOrder(storeroomLocs, lineLoc || preferredStoreroomLocationId);
      if (!lineLoc && !preferredStoreroomLocationId) {
        throw new Error('Choose a storeroom for each material line');
      }
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
          uom: lineMeta?.uom || 'ea',
          name: String(lineMeta?.name || '').trim(),
          family_sku: String(lineMeta?.family_sku || '').trim(),
          uom_label: String(lineMeta?.uom_label || '').trim(),
          storeroom_label: String(lineMeta?.storeroom_label || '').trim()
            || storeroomDisplayLabelForId(move.warehouse_location_id, storeroomLocs),
        });
      }
    } else {
      const addBack = -delta;
      const creditLoc = lineLoc || String(storeroomLocs[0]?.id || '');
      if (creditLoc) {
        await adjustAssemblyInventory(sb, aid, creditLoc, addBack);
        usageRows.push({
          material_assembly_id: aid,
          warehouse_location_id: creditLoc,
          quantity: -addBack,
          uom: lineMeta?.uom || 'ea',
          name: String(lineMeta?.name || '').trim(),
          family_sku: String(lineMeta?.family_sku || '').trim(),
          uom_label: String(lineMeta?.uom_label || '').trim(),
          storeroom_label: String(lineMeta?.storeroom_label || '').trim()
            || storeroomDisplayLabelForId(creditLoc, storeroomLocs),
        });
      }
    }
  }

  const mergedUsage = [...normalizeLines(meta.material_usage_rows || [])];
  for (const row of usageRows) {
    if (row.quantity < 0) continue;
    mergedUsage.push(row);
  }

  const enrichedLines = await enrichManualMaterialLines(sb, desired);

  const nextMeta = {
    ...meta,
    manual_material_lines: enrichedLines,
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
    material_lines: enrichedLines,
    deducted_rows: usageRows.filter((r) => r.quantity > 0),
  };
}
