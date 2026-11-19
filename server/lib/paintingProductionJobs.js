import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { listCarpentryCatalogProducts } from './carpentryCatalog.js';
import {
  adjustAssemblyInventory,
  loadAssemblyInventoryQty,
} from './storeroomBomDeduction.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import {
  enrichManualMaterialLines,
  manualMaterialLinesNeedMetadataRepair,
} from './productionJobMaterials.js';
import { readWarehouseFloor2WipImageUrl } from '../../src/utils/warehouseFloor2WipImage.js';
import { resolveWarehouseMobileDisplayName } from '../../src/utils/warehouseMobileDisplayName.js';
import { quoteItemLineImageUrl } from '../../src/utils/quoteProductionItemFields.js';
import { getLoginAccessRecord } from './loginAccess.js';

const JOBS = 'painting_production_jobs';
const RUNS = 'carpentry_production_runs';
const ASSEMBLIES = 'warehouse_assemblies';
const LOCATIONS = 'locations';

const ACTIVE_STATUSES = new Set(['ready', 'running', 'paused']);

async function paintingSenderNameForUserId(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const record = await getLoginAccessRecord(uid);
  const name = resolveWarehouseMobileDisplayName({ id: uid }, record);
  return name || null;
}

function quoteLineDisplayName(it, productById = null) {
  const fromProduct = productById && it?.quote_product_id
    ? String(productById.get(String(it.quote_product_id))?.name || '').trim()
    : '';
  return String(it?.name_override || it?.name || fromProduct || '').trim();
}

function formatCarpentryQuoteProductTitle(items, { quoteNumber = '' } = {}) {
  const parts = (items || [])
    .map((it) => {
      const name = quoteLineDisplayName(it, null);
      if (!name) return '';
      const lineQty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      return lineQty > 1 ? `${name} ×${lineQty}` : name;
    })
    .filter(Boolean);
  if (parts.length === 1) return parts[0];
  if (parts.length > 1) return parts.join(' · ');
  const num = String(quoteNumber || '').trim();
  return num || '';
}

function firstQuoteLineImageUrl(items) {
  for (const it of items || []) {
    const url = quoteItemLineImageUrl(it);
    if (url) return url;
  }
  return '';
}

async function loadCarpentryQuoteDisplayBundle(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  if (!qid) return null;
  const [{ data: quote }, { data: items }] = await Promise.all([
    sb.from('quotations').select('id, quote_number').eq('id', qid).maybeSingle(),
    sb.from('quotation_items').select('*').eq('quotation_id', qid).order('sort_order'),
  ]);
  if (!quote?.id) return null;
  const rawItems = items || [];
  const qpIds = [...new Set(rawItems.map((it) => it?.quote_product_id).filter(Boolean).map(String))];
  let productById = new Map();
  if (qpIds.length) {
    const { data: qps } = await sb
      .from('quotation_products')
      .select('id, name, description')
      .in('id', qpIds);
    productById = new Map((qps || []).map((p) => [String(p.id), p]));
  }
  const list = rawItems.map((it) => ({
    ...it,
    name: quoteLineDisplayName(it, productById),
    description: String(it?.description || productById.get(String(it?.quote_product_id))?.description || '').trim() || it?.description,
  }));
  return {
    quote_number: quote.quote_number || null,
    product_title: formatCarpentryQuoteProductTitle(list, { quoteNumber: quote.quote_number }),
    line_image_url: firstQuoteLineImageUrl(list),
  };
}

async function attachCarpentryQuoteIdsFromProductionRuns(sb, jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const missing = list.filter((j) => {
    const qid = String(j.carpentry_quote_id || j.quote_id || '').trim();
    const asm = String(j.assembly_id || '').trim();
    return !qid && asm;
  });
  if (!missing.length) return list;
  const asmIds = [...new Set(missing.map((j) => String(j.assembly_id).trim()))];
  const { data: runs, error } = await sb
    .from(RUNS)
    .select('quote_id, assembly_id, completed_at')
    .in('assembly_id', asmIds)
    .not('quote_id', 'is', null)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(400);
  if (error) return list;
  const quoteByAssembly = new Map();
  for (const row of runs || []) {
    const aid = String(row.assembly_id || '').trim();
    const qid = String(row.quote_id || '').trim();
    if (!aid || !qid || quoteByAssembly.has(aid)) continue;
    quoteByAssembly.set(aid, qid);
  }
  return list.map((j) => {
    const qid = String(j.carpentry_quote_id || j.quote_id || '').trim();
    if (qid) return j;
    const fromRun = quoteByAssembly.get(String(j.assembly_id || '').trim());
    if (!fromRun) return j;
    return { ...j, carpentry_quote_id: fromRun, quote_id: fromRun };
  });
}

async function enrichPaintingJobsFromCarpentryQuotes(sb, jobs) {
  const list = await attachCarpentryQuoteIdsFromProductionRuns(sb, Array.isArray(jobs) ? jobs : []);
  const quoteIds = [
    ...new Set(
      list
        .map((j) => String(j.carpentry_quote_id || j.quote_id || '').trim())
        .filter(Boolean),
    ),
  ];
  if (!quoteIds.length) return list;
  const bundles = new Map();
  await Promise.all(quoteIds.map(async (qid) => {
    const bundle = await loadCarpentryQuoteDisplayBundle(sb, qid);
    if (bundle) bundles.set(qid, bundle);
  }));
  return list.map((job) => {
    const qid = String(job.carpentry_quote_id || job.quote_id || '').trim();
    if (!qid) return job;
    const bundle = bundles.get(qid);
    if (!bundle) return job;
    const storedTitle = String(job.product_name || '').trim();
    const title = bundle.product_title || storedTitle;
    const quoteImg = String(bundle.line_image_url || job.quote_line_image_url || '').trim();
    const photo = quoteImg || job.image_url || job.floor2_image_url || '';
    return {
      ...job,
      product_name: title || storedTitle,
      quote_number: bundle.quote_number || job.quote_number || null,
      quote_line_image_url: quoteImg || null,
      image_url: quoteImg ? quoteImg : job.image_url,
      floor2_image_url: quoteImg ? quoteImg : job.floor2_image_url,
    };
  });
}

async function attachPaintingSenderAliases(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const missing = list.filter(
    (j) => !String(j.sent_by_alias || '').trim() && String(j.accepted_by || '').trim(),
  );
  const ids = [...new Set(missing.map((j) => String(j.accepted_by).trim()))];
  const byId = new Map();
  await Promise.all(ids.map(async (uid) => {
    const record = await getLoginAccessRecord(uid);
    byId.set(uid, resolveWarehouseMobileDisplayName({ id: uid }, record) || uid);
  }));
  return list.map((j) => {
    const stored = String(j.sent_by_alias || '').trim();
    if (stored) return j;
    const uid = String(j.accepted_by || '').trim();
    if (!uid) return j;
    return { ...j, sent_by_alias: byId.get(uid) || null };
  });
}

function stripUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    out[key] = stripUndefinedDeep(val);
  }
  return out;
}

function normalizeJobStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function computeElapsedMs(job, nowMs = Date.now()) {
  let ms = Math.max(0, Number(job.accumulated_ms) || 0);
  if (job.status === 'running' && job.timer_started_at) {
    const started = new Date(job.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

async function enrichPaintingJobsWithAssemblyPhotos(sb, jobs) {
  const list = Array.isArray(jobs) ? jobs : [jobs];
  const assemblyIds = [...new Set(
    list.map((j) => String(j.assembly_id || '').trim()).filter(Boolean),
  )];
  if (!assemblyIds.length) return list;
  const { data: assemblies } = await sb
    .from(ASSEMBLIES)
    .select('id, image_url, metadata')
    .in('id', assemblyIds);
  const byId = new Map((assemblies || []).map((row) => [String(row.id), row]));
  return list.map((job) => {
    const asm = byId.get(String(job.assembly_id || ''));
    const wip = readWarehouseFloor2WipImageUrl(asm);
    const fromFloor1 = String(job.inventory_source || '').toLowerCase() === 'floor1';
    const photo = fromFloor1 ? String(asm?.image_url || '').trim() : wip;
    return {
      ...job,
      floor2_image_url: fromFloor1 ? '' : (wip || job.floor2_image_url || ''),
      image_url: photo || job.image_url || '',
    };
  });
}

async function serializePaintingJobForClient(sb, job) {
  const base = serializeJob(job);
  const [enriched] = await enrichPaintingJobsWithAssemblyPhotos(sb, [base]);
  const [fromQuote] = await enrichPaintingJobsFromCarpentryQuotes(sb, [enriched]);
  const [withSender] = await attachPaintingSenderAliases([fromQuote]);
  return withSender;
}

function serializeJob(job) {
  if (!job) return null;
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  return {
    job_id: job.id,
    id: job.id,
    assembly_id: job.assembly_id,
    product_name: job.product_name || '',
    product_sku: job.product_sku || '',
    product_qty: qty,
    status: job.status,
    accumulated_ms: Number(job.accumulated_ms) || 0,
    elapsed_ms: computeElapsedMs(job),
    timer_started_at: job.timer_started_at || null,
    started_at: job.started_at || null,
    completed_at: job.completed_at || null,
    accepted_by: job.accepted_by || null,
    sent_by_alias:
      String(job.metadata?.sent_by_name || job.metadata?.sent_by_alias || '').trim() || null,
    manual_material_lines: Array.isArray(job.metadata?.manual_material_lines)
      ? job.metadata.manual_material_lines
      : [],
    carpentry_quote_id: String(job.metadata?.carpentry_quote_id || '').trim() || null,
    quote_id: String(job.metadata?.carpentry_quote_id || job.metadata?.quote_id || '').trim() || null,
    quote_number: String(job.metadata?.quote_number || '').trim() || null,
    quote_line_image_url: String(job.metadata?.quote_line_image_url || '').trim() || null,
    inventory_source: job.metadata?.inventory_source || null,
    floor2_image_url: String(job.floor2_image_url || '').trim(),
    image_url: String(job.image_url || job.floor2_image_url || '').trim(),
  };
}

async function loadJob(sb, jobId) {
  const id = String(jobId || '').trim();
  if (!id) throw new Error('job_id required');
  const { data, error } = await sb.from(JOBS).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load job');
  if (!data?.id) throw new Error('Job not found');
  return data;
}

async function saveJobPatch(sb, jobId, patch) {
  const now = new Date().toISOString();
  const { data, error } = await sb.from(JOBS).update({ ...patch, updated_at: now }).eq('id', jobId).select('*');
  if (error) throw new Error(error.message || 'Failed to update job');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return loadJob(sb, jobId);
  return row;
}

async function resolveFloor2AndFactoryIds(sb) {
  const { data: locRows, error: locErr } = await sb.from(LOCATIONS).select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  if (!floor2Id) {
    throw new Error('Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  }
  return {
    floor2LocationId: floor2Id,
    floor1LocationId: WAREHOUSE_FACTORY_LOCATION_ID,
  };
}

async function loadPaintingProductContext(sb, assemblyId) {
  const productId = String(assemblyId || '').trim();
  if (!productId) throw new Error('assembly_id required');

  const { data: assembly, error: aErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata, item_kind')
    .eq('id', productId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');

  return { productId, assembly };
}

/**
 * Carpentry app: send Floor 2 WIP to painting — deduct Floor 2 (WIP leaves the floor) + queue painting job.
 */
export async function sendAssemblyToPaintingDepartment(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
  channel = 'carpentry_workshop_app',
}) {
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  const ctx = await loadPaintingProductContext(sb, assemblyId);
  const { floor2LocationId } = await resolveFloor2AndFactoryIds(sb);

  const have = await loadAssemblyInventoryQty(sb, ctx.productId, floor2LocationId);
  if (have < qty) {
    throw new Error(`Insufficient unfinished stock on Floor 2 (have ${have}, need ${qty})`);
  }

  await adjustAssemblyInventory(sb, ctx.productId, floor2LocationId, -qty);
  await recomputeWarehouseLocationStockServer(sb, floor2LocationId);

  const now = new Date().toISOString();
  const sentByName = await paintingSenderNameForUserId(userId);
  const jobId = newUuid();
  const row = stripUndefinedDeep({
    id: jobId,
    assembly_id: ctx.productId,
    product_name: String(ctx.assembly.name || '').trim(),
    product_sku: String(ctx.assembly.family_sku || '').trim(),
    product_qty: qty,
    status: 'ready',
    accumulated_ms: 0,
    timer_started_at: null,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: {
      channel,
      inventory_source: 'floor2',
      floor2_deducted_qty: qty,
      floor2_location_id: floor2LocationId,
      sent_by_name: sentByName,
    },
    created_at: now,
    updated_at: now,
  });

  const { data: inserted, error: insErr } = await sb.from(JOBS).insert(row).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create painting job');
  if (!inserted?.id) throw new Error('Failed to create painting job (no row returned)');

  try {
    const { notifyPaintingNewJob } = await import('./productionExpoPush.js');
    await notifyPaintingNewJob(serializeJob(inserted));
  } catch (pushErr) {
    console.warn('[sendAssemblyToPaintingDepartment] push notify failed:', pushErr?.message || pushErr);
  }

  return { job: await serializePaintingJobForClient(sb, inserted) };
}

/**
 * After a completed carpentry Hassan order — queue painting (Floor 2 WIP first, else Floor 1 finished stock).
 */
export async function sendCarpentryQuoteToPaintingDepartment(sb, {
  quoteId,
  productQty = 1,
  userId = null,
  skipClientEnrichment = false,
} = {}) {
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id required');

  const { getQuoteProductionRouting } = await import('./quoteProductionRouting.js');
  const routing = await getQuoteProductionRouting(sb, qid);
  if (!routing?.route || routing.route !== 'carpentry') {
    throw new Error('Quote is not on the carpentry production route');
  }
  if (!routing.completed_at) {
    throw new Error('Complete the carpentry order before sending to painting');
  }

  const { data: dupRows, error: dupErr } = await sb
    .from(JOBS)
    .select('id, status, metadata')
    .contains('metadata', { carpentry_quote_id: qid })
    .limit(8);
  if (!dupErr && (dupRows || []).some((r) => ACTIVE_STATUSES.has(normalizeJobStatus(r.status)))) {
    throw new Error('This order is already on the painting queue');
  }

  const { data: runs, error: runErr } = await sb
    .from(RUNS)
    .select('*')
    .eq('quote_id', qid)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (runErr) throw new Error(runErr.message || 'Failed to load production run');
  const run = (runs || [])[0];
  if (!run?.assembly_id) throw new Error('No completed carpentry run for this quote');

  const assemblyId = String(run.assembly_id);
  const qty = Math.max(1, Math.floor(Number(productQty) || Number(run.product_qty) || 1));
  const { floor2LocationId, floor1LocationId } = await resolveFloor2AndFactoryIds(sb);

  let inventory_source = 'floor2';
  const floor2Have = await loadAssemblyInventoryQty(sb, assemblyId, floor2LocationId);
  if (floor2Have >= qty) {
    await adjustAssemblyInventory(sb, assemblyId, floor2LocationId, -qty);
    await recomputeWarehouseLocationStockServer(sb, floor2LocationId);
  } else {
    const floor1Have = await loadAssemblyInventoryQty(sb, assemblyId, floor1LocationId);
    if (floor1Have >= qty) {
      inventory_source = 'floor1';
      await adjustAssemblyInventory(sb, assemblyId, floor1LocationId, -qty);
      await recomputeWarehouseLocationStockServer(sb, floor1LocationId);
    } else {
      inventory_source = 'virtual_hold';
    }
  }

  const ctx = await loadPaintingProductContext(sb, assemblyId);
  const quoteDisplay = await loadCarpentryQuoteDisplayBundle(sb, qid);
  const now = new Date().toISOString();
  const sentByName = await paintingSenderNameForUserId(userId);
  const jobId = newUuid();
  const row = stripUndefinedDeep({
    id: jobId,
    assembly_id: ctx.productId,
    product_name:
      quoteDisplay?.product_title || String(ctx.assembly.name || '').trim(),
    product_sku: String(ctx.assembly.family_sku || '').trim(),
    product_qty: qty,
    status: 'ready',
    accumulated_ms: 0,
    timer_started_at: null,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: {
      channel: 'carpentry_workshop_app',
      carpentry_quote_id: qid,
      quote_id: qid,
      quote_number: quoteDisplay?.quote_number || null,
      quote_line_image_url: quoteDisplay?.line_image_url || null,
      inventory_source,
      floor2_deducted_qty: inventory_source === 'floor2' ? qty : 0,
      factory_deducted_qty: inventory_source === 'floor1' ? qty : 0,
      virtual_hold: inventory_source === 'virtual_hold',
      floor2_location_id: floor2LocationId,
      sent_by_name: sentByName,
    },
    created_at: now,
    updated_at: now,
  });

  const { data: inserted, error: insErr } = await sb.from(JOBS).insert(row).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create painting job');
  if (!inserted?.id) throw new Error('Failed to create painting job (no row returned)');

  import('./productionExpoPush.js')
    .then(({ notifyPaintingNewJob }) => notifyPaintingNewJob(serializeJob(inserted)))
    .catch((pushErr) => {
      console.warn('[sendCarpentryQuoteToPaintingDepartment] push notify failed:', pushErr?.message || pushErr);
    });

  if (skipClientEnrichment) {
    return { job: serializeJob(inserted) };
  }
  return { job: await serializePaintingJobForClient(sb, inserted) };
}

/** Partial carpentry quote line — order timer may still be running. */
export async function sendPartialCarpentryQuoteLineToPainting(sb, {
  quoteId,
  itemId,
  productQty = null,
  userId = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const iid = String(itemId || '').trim();
  if (!qid || !iid) throw new Error('quote_id and item_id required');

  const { getQuoteProductionRouting } = await import('./quoteProductionRouting.js');
  const routing = await getQuoteProductionRouting(sb, qid);
  if (!routing?.route || routing.route !== 'carpentry') {
    throw new Error('Quote is not on the carpentry production route');
  }
  if (routing.completed_at) {
    throw new Error('Quote is already completed');
  }

  const meta = routing.metadata && typeof routing.metadata === 'object' ? routing.metadata : {};
  const progress = meta.line_progress?.[iid];
  if (!progress) throw new Error('Mark items ready before sending to painting');

  const sliceQty = productQty != null
    ? Math.max(1, Math.floor(Number(productQty)))
    : Math.max(1, Number(progress.slices?.[progress.slices.length - 1]?.qty) || 0);

  const { data: runs } = await sb
    .from(RUNS)
    .select('*')
    .eq('quote_id', qid)
    .eq('source', 'quote_order')
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const run = (runs || [])[0];
  if (!run?.assembly_id) throw new Error('No active production run for this quote');

  const { data: lineRow } = await sb.from('quotation_items').select('name_override, name, quote_product_id').eq('id', iid).maybeSingle();
  let lineName = '';
  if (lineRow?.quote_product_id) {
    const { data: qp } = await sb
      .from('quotation_products')
      .select('name')
      .eq('id', lineRow.quote_product_id)
      .maybeSingle();
    lineName = String(lineRow?.name_override || lineRow?.name || qp?.name || '').trim();
  } else {
    lineName = String(lineRow?.name_override || lineRow?.name || '').trim();
  }

  const assemblyId = String(run.assembly_id);
  const qty = sliceQty;
  const { floor2LocationId, floor1LocationId } = await resolveFloor2AndFactoryIds(sb);

  let inventory_source = 'virtual_hold';
  const floor2Have = await loadAssemblyInventoryQty(sb, assemblyId, floor2LocationId);
  if (floor2Have >= qty) {
    inventory_source = 'floor2';
    await adjustAssemblyInventory(sb, assemblyId, floor2LocationId, -qty);
    await recomputeWarehouseLocationStockServer(sb, floor2LocationId);
  } else {
    const floor1Have = await loadAssemblyInventoryQty(sb, assemblyId, floor1LocationId);
    if (floor1Have >= qty) {
      inventory_source = 'floor1';
      await adjustAssemblyInventory(sb, assemblyId, floor1LocationId, -qty);
      await recomputeWarehouseLocationStockServer(sb, floor1LocationId);
    }
  }

  const ctx = await loadPaintingProductContext(sb, assemblyId);
  const now = new Date().toISOString();
  const sentByName = await paintingSenderNameForUserId(userId);
  const jobId = newUuid();
  const row = stripUndefinedDeep({
    id: jobId,
    assembly_id: ctx.productId,
    product_name: lineName || String(ctx.assembly.name || '').trim(),
    product_sku: String(ctx.assembly.family_sku || '').trim(),
    product_qty: qty,
    status: 'ready',
    accumulated_ms: 0,
    timer_started_at: null,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: {
      channel: 'carpentry_workshop_app',
      carpentry_quote_id: qid,
      quote_id: qid,
      quote_line_id: iid,
      partial_quote_line: true,
      inventory_source,
      floor2_deducted_qty: inventory_source === 'floor2' ? qty : 0,
      factory_deducted_qty: inventory_source === 'floor1' ? qty : 0,
      virtual_hold: inventory_source === 'virtual_hold',
      floor2_location_id: floor2LocationId,
      sent_by_name: sentByName,
    },
    created_at: now,
    updated_at: now,
  });

  const { data: inserted, error: insErr } = await sb.from(JOBS).insert(row).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create painting job');
  if (!inserted?.id) throw new Error('Failed to create painting job (no row returned)');

  try {
    const { notifyPaintingNewJob } = await import('./productionExpoPush.js');
    await notifyPaintingNewJob(serializeJob(inserted));
  } catch (pushErr) {
    console.warn('[sendPartialCarpentryQuoteLineToPainting] push notify failed:', pushErr?.message || pushErr);
  }

  return { job: await serializePaintingJobForClient(sb, inserted) };
}

export async function listPaintingProductionJobs(sb, { activeOnly = false, limit = 200 } = {}) {
  const { data, error } = await sb.from(JOBS).select('*');
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) {
      return { jobs: [], tableMissing: true };
    }
    throw new Error(error.message || 'Failed to list painting jobs');
  }
  let rows = data || [];
  if (activeOnly) {
    rows = rows.filter((r) => ACTIVE_STATUSES.has(normalizeJobStatus(r.status)));
  }
  rows.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const cap = Math.min(500, Math.max(1, Number(limit) || 200));
  const jobs = [];
  const now = new Date().toISOString();
  for (const row of rows.slice(0, cap)) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const lines = await enrichManualMaterialLines(sb, meta.manual_material_lines, {
      usageRows: meta.material_usage_rows,
    });
    if (manualMaterialLinesNeedMetadataRepair(meta.manual_material_lines, lines)) {
      await sb.from(JOBS).update({
        metadata: { ...meta, manual_material_lines: lines },
        updated_at: now,
      }).eq('id', row.id);
    }
    const base = serializeJob(row);
    jobs.push({ ...base, manual_material_lines: lines });
  }
  const withPhotos = await enrichPaintingJobsWithAssemblyPhotos(sb, jobs);
  const withQuoteDisplay = await enrichPaintingJobsFromCarpentryQuotes(sb, withPhotos);

  await Promise.all(withQuoteDisplay.map(async (job) => {
    const qid = String(job.carpentry_quote_id || job.quote_id || '').trim();
    if (!qid) return;
    const corrected = String(job.product_name || '').trim();
    const row = rows.find((r) => String(r.id) === String(job.job_id || job.id));
    if (!row || !corrected) return;
    const oldName = String(row.product_name || '').trim();
    if (corrected === oldName) return;
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    await sb.from(JOBS).update({
      product_name: corrected,
      metadata: {
        ...meta,
        carpentry_quote_id: qid,
        quote_id: qid,
        quote_number: job.quote_number || meta.quote_number || null,
        quote_line_image_url: job.quote_line_image_url || meta.quote_line_image_url || null,
      },
      updated_at: now,
    }).eq('id', row.id);
  }));

  const withSenders = await attachPaintingSenderAliases(withQuoteDisplay);
  return { jobs: withSenders };
}

export async function pausePaintingProductionJob(sb, { jobId, userId }) {
  void userId;
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  if (job.status !== 'running') return { job: await serializePaintingJobForClient(sb, job) };
  const now = Date.now();
  const accumulated = computeElapsedMs(job, now);
  const updated = await saveJobPatch(sb, job.id, {
    status: 'paused',
    accumulated_ms: accumulated,
    timer_started_at: null,
    paused_at: new Date(now).toISOString(),
  });
  return { job: await serializePaintingJobForClient(sb, updated) };
}

export async function resumePaintingProductionJob(sb, { jobId, userId }) {
  void userId;
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  if (job.status === 'running') return { job: await serializePaintingJobForClient(sb, job) };
  if (job.status !== 'paused' && job.status !== 'ready') throw new Error('Job cannot be started');
  const nowIso = new Date().toISOString();
  const updated = await saveJobPatch(sb, job.id, {
    status: 'running',
    timer_started_at: nowIso,
    paused_at: null,
  });
  return { job: await serializePaintingJobForClient(sb, updated) };
}

/**
 * Painting app: finish job.
 * destination=delivery → virtual hold in Delivery app (default).
 * destination=floor1 → credit Warehouse Floor 1 for storage.
 * Floor 2 was already deducted when carpentry sent WIP (unless source was virtual_hold).
 */
export async function finishPaintingProductionJob(sb, {
  jobId,
  userId = null,
  destination = 'delivery',
  printedBy = null,
}) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');

  const productId = String(job.assembly_id || '').trim();
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const { floor2LocationId } = await resolveFloor2AndFactoryIds(sb);

  let assemblyRow = null;
  if (productId) {
    const { data: asm } = await sb
      .from(ASSEMBLIES)
      .select('name, family_sku, dim_length, dim_width, dim_height')
      .eq('id', productId)
      .maybeSingle();
    assemblyRow = asm || null;
  }

  const dest = String(destination || 'delivery').trim().toLowerCase() === 'floor1'
    ? 'floor1'
    : 'delivery';
  const now = new Date().toISOString();
  const finalElapsed = computeElapsedMs(job);
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'painting_floor',
    quote_id: null,
    assembly_id: productId,
    product_qty: qty,
    started_at: job.started_at || now,
    completed_at: now,
    accepted_by: userId,
    metadata: {
      channel: 'painting_workshop_app',
      painting_job_id: job.id,
      elapsed_ms: finalElapsed,
      floor2_location_id: floor2LocationId,
      finish_destination: dest,
    },
    created_at: now,
  });
  if (runErr && !/not found|does not exist/i.test(String(runErr.message || ''))) {
    throw new Error(runErr.message || 'Failed to save production run');
  }

  let floor1Credited = false;
  if (dest === 'floor1' && productId) {
    const { floor1LocationId } = await resolveFloor2AndFactoryIds(sb);
    await adjustAssemblyInventory(sb, productId, floor1LocationId, qty);
    await recomputeWarehouseLocationStockServer(sb, floor1LocationId);
    floor1Credited = true;
  }

  const updated = await saveJobPatch(sb, job.id, {
    status: 'completed',
    completed_at: now,
    accumulated_ms: finalElapsed,
    timer_started_at: null,
    metadata: {
      ...(job.metadata || {}),
      production_run_id: runErr ? null : runId,
      finish_destination: dest,
      floor1_credited: floor1Credited,
    },
  });

  let deliveryAdminAwaiting = false;
  if (dest === 'delivery') {
    const { registerProductionJobAwaitingDriver } = await import('./warehouseDeliveryAdminQueue.js');
    await registerProductionJobAwaitingDriver(sb, {
      jobsTable: JOBS,
      jobRow: updated,
      assemblyId: productId,
      assemblyName: assemblyRow?.name || productId,
      qty,
      department: 'painting',
    });
    deliveryAdminAwaiting = true;
  }

  let labelJobId = null;
  let labelPrintWarning = null;
  const labelName = String(assemblyRow?.name || job.product_name || productId).trim();
  const rawSku = String(assemblyRow?.family_sku || job.product_sku || '').trim();
  if (labelName && rawSku) {
    const { normalizeWarehousePacketScan } = await import('../../src/utils/warehouseScanResolver.js');
    const { enqueueWarehouseProductionLabelJob } = await import('./productionLabelPrint.js');
    const { LABEL_PHOTO_FLOOR2 } = await import('./warehouseLabelPhotoFloor.js');
    const labelSku = normalizeWarehousePacketScan(rawSku) || rawSku;
    const operator = String(printedBy || '').trim() || 'Painting workshop';
    try {
      labelJobId = await enqueueWarehouseProductionLabelJob(sb, {
        name: labelName,
        sku: labelSku,
        qty,
        printedBy: operator,
        source: 'warehouse_floor_2',
        printedAt: new Date(),
        photoFloor: LABEL_PHOTO_FLOOR2,
        dimLength: assemblyRow?.dim_length,
        dimWidth: assemblyRow?.dim_width,
        dimHeight: assemblyRow?.dim_height,
      });
      if (!labelJobId) {
        labelPrintWarning = 'Job completed but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
      }
    } catch (printErr) {
      const { formatZebraPrintError } = await import('./formatZebraPrintError.js');
      labelPrintWarning = formatZebraPrintError(printErr);
      console.warn('[paintingProductionJobs] label print failed:', printErr?.message || printErr);
    }
  }

  return {
    job: serializeJob(updated),
    run_id: runErr ? null : runId,
    assembly_id: productId,
    product_qty: qty,
    finish_destination: dest,
    delivery_admin_awaiting_driver: deliveryAdminAwaiting,
    floor1_credited: floor1Credited,
    label_job_id: labelJobId,
    label_print_warning: labelPrintWarning,
    label_copies: qty,
  };
}

/**
 * Cancel an active painting job and restore Floor 2 / Floor 1 stock when it was deducted on send.
 */
export async function cancelPaintingProductionJob(sb, {
  jobId,
  userId = null,
  reason = '',
} = {}) {
  const job = await loadJob(sb, jobId);
  const status = normalizeJobStatus(job.status);
  if (!ACTIVE_STATUSES.has(status)) {
    throw new Error('Only active painting jobs can be cancelled');
  }

  const meta = job.metadata && typeof job.metadata === 'object' ? { ...job.metadata } : {};
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const assemblyId = String(job.assembly_id || '').trim();
  const src = String(meta.inventory_source || 'floor2').toLowerCase();

  let stockRestored = null;
  if (assemblyId && src !== 'virtual_hold') {
    const { floor2LocationId, floor1LocationId } = await resolveFloor2AndFactoryIds(sb);
    if (src === 'floor1') {
      const restoreQty = Math.max(0, Math.floor(Number(meta.factory_deducted_qty) || qty));
      if (restoreQty > 0) {
        await adjustAssemblyInventory(sb, assemblyId, floor1LocationId, restoreQty);
        await recomputeWarehouseLocationStockServer(sb, floor1LocationId);
        stockRestored = { location: 'floor1', location_id: floor1LocationId, qty: restoreQty, assembly_id: assemblyId };
      }
    } else {
      const restoreQty = Math.max(0, Math.floor(Number(meta.floor2_deducted_qty) || qty));
      if (restoreQty > 0) {
        await adjustAssemblyInventory(sb, assemblyId, floor2LocationId, restoreQty);
        await recomputeWarehouseLocationStockServer(sb, floor2LocationId);
        stockRestored = { location: 'floor2', location_id: floor2LocationId, qty: restoreQty, assembly_id: assemblyId };
      }
    }
  }

  const now = new Date().toISOString();
  const updated = await saveJobPatch(sb, job.id, {
    status: 'cancelled',
    timer_started_at: null,
    paused_at: null,
    accumulated_ms: computeElapsedMs(job),
    metadata: {
      ...meta,
      cancelled_at: now,
      cancelled_by: userId || null,
      cancel_reason: String(reason || '').trim() || null,
      stock_restore: stockRestored,
    },
  });

  return {
    job: await serializePaintingJobForClient(sb, updated),
    stock_restored: stockRestored,
    virtual_hold: src === 'virtual_hold',
  };
}

/** Find active painting jobs by product name (contains) or SKU (exact). */
export async function findActivePaintingJobsByProduct(sb, { name = '', sku = '' } = {}) {
  const nameNeedle = String(name || '').trim().toLowerCase();
  const skuNeedle = String(sku || '').trim().toLowerCase();
  if (!nameNeedle && !skuNeedle) throw new Error('name or sku required');

  const { data, error } = await sb.from(JOBS).select('*');
  if (error) throw new Error(error.message || 'Failed to list painting jobs');

  return (data || []).filter((row) => {
    if (!ACTIVE_STATUSES.has(normalizeJobStatus(row.status))) return false;
    const rowName = String(row.product_name || '').toLowerCase();
    const rowSku = String(row.product_sku || '').toLowerCase();
    if (skuNeedle && rowSku === skuNeedle) return true;
    if (nameNeedle && rowName.includes(nameNeedle)) return true;
    return false;
  });
}
