import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { listCarpentryCatalogProducts } from './carpentryCatalog.js';
import {
  adjustAssemblyInventory,
  loadAssemblyInventoryQty,
} from './storeroomBomDeduction.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { enrichManualMaterialLines } from './productionJobMaterials.js';

const JOBS = 'painting_production_jobs';
const RUNS = 'carpentry_production_runs';
const ASSEMBLIES = 'warehouse_assemblies';
const LOCATIONS = 'locations';

const ACTIVE_STATUSES = new Set(['ready', 'running', 'paused']);

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
    manual_material_lines: Array.isArray(job.metadata?.manual_material_lines)
      ? job.metadata.manual_material_lines
      : [],
    carpentry_quote_id: String(job.metadata?.carpentry_quote_id || '').trim() || null,
    quote_id: String(job.metadata?.carpentry_quote_id || job.metadata?.quote_id || '').trim() || null,
    inventory_source: job.metadata?.inventory_source || null,
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

  return { job: serializeJob(inserted) };
}

/**
 * After a completed carpentry Hassan order — queue painting (Floor 2 WIP first, else Floor 1 finished stock).
 */
export async function sendCarpentryQuoteToPaintingDepartment(sb, {
  quoteId,
  productQty = 1,
  userId = null,
}) {
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

  const { data: activeRows, error: dupErr } = await sb.from(JOBS).select('id, status, metadata');
  if (!dupErr && (activeRows || []).some((r) => (
    ACTIVE_STATUSES.has(normalizeJobStatus(r.status))
    && String(r.metadata?.carpentry_quote_id || '') === qid
  ))) {
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
    if (floor1Have < qty) {
      throw new Error(
        `Insufficient stock for painting (need ${qty} on Floor 2 WIP or Warehouse Floor 1 after order complete)`,
      );
    }
    inventory_source = 'floor1';
    await adjustAssemblyInventory(sb, assemblyId, floor1LocationId, -qty);
    await recomputeWarehouseLocationStockServer(sb, floor1LocationId);
  }

  const ctx = await loadPaintingProductContext(sb, assemblyId);
  const now = new Date().toISOString();
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
      channel: 'carpentry_workshop_app',
      carpentry_quote_id: qid,
      quote_id: qid,
      inventory_source,
      floor2_deducted_qty: inventory_source === 'floor2' ? qty : 0,
      factory_deducted_qty: inventory_source === 'floor1' ? qty : 0,
      floor2_location_id: floor2LocationId,
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
    console.warn('[sendCarpentryQuoteToPaintingDepartment] push notify failed:', pushErr?.message || pushErr);
  }

  return { job: serializeJob(inserted) };
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
  for (const row of rows.slice(0, cap)) {
    const base = serializeJob(row);
    const lines = await enrichManualMaterialLines(sb, row.metadata?.manual_material_lines);
    jobs.push({ ...base, manual_material_lines: lines });
  }
  return { jobs };
}

export async function pausePaintingProductionJob(sb, { jobId, userId }) {
  void userId;
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  if (job.status !== 'running') return { job: serializeJob(job) };
  const now = Date.now();
  const accumulated = computeElapsedMs(job, now);
  const updated = await saveJobPatch(sb, job.id, {
    status: 'paused',
    accumulated_ms: accumulated,
    timer_started_at: null,
    paused_at: new Date(now).toISOString(),
  });
  return { job: serializeJob(updated) };
}

export async function resumePaintingProductionJob(sb, { jobId, userId }) {
  void userId;
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  if (job.status === 'running') return { job: serializeJob(job) };
  if (job.status !== 'paused' && job.status !== 'ready') throw new Error('Job cannot be started');
  const nowIso = new Date().toISOString();
  const updated = await saveJobPatch(sb, job.id, {
    status: 'running',
    timer_started_at: nowIso,
    paused_at: null,
  });
  return { job: serializeJob(updated) };
}

/**
 * Painting app: finish job — credit finished qty on Warehouse Floor 1 (Send Delivery).
 * Floor 2 was already deducted when carpentry sent WIP to painting.
 */
export async function finishPaintingProductionJob(sb, {
  jobId,
  userId = null,
}) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');

  const productId = String(job.assembly_id || '').trim();
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const { floor2LocationId, floor1LocationId } = await resolveFloor2AndFactoryIds(sb);

  await adjustAssemblyInventory(sb, productId, floor1LocationId, qty);

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
    },
    created_at: now,
  });
  if (runErr && !/not found|does not exist/i.test(String(runErr.message || ''))) {
    throw new Error(runErr.message || 'Failed to save production run');
  }

  await recomputeWarehouseLocationStockServer(sb, floor1LocationId);

  const updated = await saveJobPatch(sb, job.id, {
    status: 'completed',
    completed_at: now,
    accumulated_ms: finalElapsed,
    timer_started_at: null,
    metadata: {
      ...(job.metadata || {}),
      production_run_id: runErr ? null : runId,
      floor1_credited_qty: qty,
    },
  });

  const floor1After = await loadAssemblyInventoryQty(sb, productId, floor1LocationId);

  return {
    job: serializeJob(updated),
    run_id: runErr ? null : runId,
    assembly_id: productId,
    product_qty: qty,
    floor1_location_id: floor1LocationId,
    floor1_qty_after: floor1After,
  };
}
