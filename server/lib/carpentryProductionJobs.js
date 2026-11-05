import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import {
  listCarpentryCatalogProducts,
} from './carpentryCatalog.js';
import {
  adjustAssemblyInventory,
  deductStoreroomBomMaterials,
  resolveCarpentryStoreroomLocations,
} from './storeroomBomDeduction.js';

const JOBS = 'carpentry_production_jobs';
const RUNS = 'carpentry_production_runs';
const USAGE = 'carpentry_production_material_usage';
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

async function loadCarpentryProductContext(sb, assemblyId) {
  const productId = String(assemblyId || '').trim();
  if (!productId) throw new Error('assembly_id required');

  const [{ data: assembly, error: aErr }, carpentryLocs] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata, item_kind').eq('id', productId).maybeSingle(),
    resolveCarpentryStoreroomLocations(sb),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');
  if (carpentryLocs.length < 1) {
    throw new Error('Carpentry warehouses not configured — run seedCarpentryWarehouseLocations.js');
  }

  const catalog = listCarpentryCatalogProducts([assembly]);
  const product = catalog[0];
  if (!product) throw new Error('Product is not in the Carpentry catalog');
  const materials = product.materials || [];
  if (!materials.length) throw new Error('No materials defined for this product');

  return { productId, product, materials, carpentryLocs, assembly };
}

export async function startCarpentryProductionJob(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
}) {
  const requestedQty = Math.floor(Number(productQty) || 1);
  if (requestedQty !== 1) {
    throw new Error('Each job is one product only (qty 1). Start a new job for another unit.');
  }

  const ctx = await loadCarpentryProductContext(sb, assemblyId);
  const usageRows = await deductStoreroomBomMaterials(sb, ctx.materials, 1, ctx.carpentryLocs);

  const now = new Date().toISOString();
  const jobId = newUuid();
  const row = stripUndefinedDeep({
    id: jobId,
    assembly_id: ctx.productId,
    product_name: String(ctx.assembly.name || '').trim(),
    product_sku: String(ctx.assembly.family_sku || '').trim(),
    product_qty: 1,
    status: 'ready',
    accumulated_ms: 0,
    timer_started_at: null,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: {
      channel: 'carpentry_workshop_app',
      material_usage_rows: usageRows,
      storeroom_location_ids: ctx.carpentryLocs.map((l) => l.id).filter(Boolean),
    },
    created_at: now,
    updated_at: now,
  });

  const { data: inserted, error: insErr } = await sb.from(JOBS).insert(row).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create carpentry job');
  if (!inserted?.id) throw new Error('Failed to create carpentry job (no row returned)');

  for (const loc of ctx.carpentryLocs) {
    await recomputeWarehouseLocationStockServer(sb, loc.id);
  }

  return { job: serializeJob(inserted) };
}

export async function listCarpentryProductionJobs(sb, { activeOnly = true, limit = 200 } = {}) {
  const { data, error } = await sb.from(JOBS).select('*');
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) {
      return { jobs: [], tableMissing: true };
    }
    throw new Error(error.message || 'Failed to list carpentry jobs');
  }
  let rows = data || [];
  if (activeOnly) {
    rows = rows.filter((r) => ACTIVE_STATUSES.has(normalizeJobStatus(r.status)));
  }
  rows.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const cap = Math.min(500, Math.max(1, Number(limit) || 200));
  return { jobs: rows.slice(0, cap).map((r) => serializeJob(r)) };
}

export async function pauseCarpentryProductionJob(sb, { jobId, userId }) {
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

export async function resumeCarpentryProductionJob(sb, { jobId, userId }) {
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

export async function finishCarpentryProductionJob(sb, {
  jobId,
  userId = null,
}) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');

  const productId = String(job.assembly_id || '').trim();
  const meta = job.metadata || {};
  const materialUsageRows = Array.isArray(meta.material_usage_rows) ? meta.material_usage_rows : [];
  const storeroomIds = Array.isArray(meta.storeroom_location_ids) ? meta.storeroom_location_ids : [];

  const { data: locRows, error: locErr } = await sb.from(LOCATIONS).select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const outputLocationId = floor2Loc?.id ? String(floor2Loc.id) : WAREHOUSE_FACTORY_LOCATION_ID;

  await adjustAssemblyInventory(sb, productId, outputLocationId, 1);

  const now = new Date().toISOString();
  const finalElapsed = computeElapsedMs(job);
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'carpentry_floor',
    quote_id: null,
    assembly_id: productId,
    product_qty: 1,
    started_at: job.started_at || now,
    completed_at: now,
    accepted_by: userId,
    metadata: {
      channel: 'carpentry_workshop_app',
      carpentry_job_id: job.id,
      elapsed_ms: finalElapsed,
    },
    created_at: now,
  });
  if (runErr && !/not found|does not exist/i.test(String(runErr.message || ''))) {
    throw new Error(runErr.message || 'Failed to save production run');
  }
  if (!runErr && materialUsageRows.length) {
    for (const row of materialUsageRows) {
      await sb.from(USAGE).insert({
        id: newUuid(),
        run_id: runId,
        material_assembly_id: row.material_assembly_id,
        warehouse_location_id: row.warehouse_location_id,
        quantity: row.quantity,
        uom: row.uom,
        created_at: now,
      });
    }
  }

  for (const locId of storeroomIds) {
    if (locId) await recomputeWarehouseLocationStockServer(sb, locId);
  }
  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  const updated = await saveJobPatch(sb, job.id, {
    status: 'completed',
    completed_at: now,
    accumulated_ms: finalElapsed,
    timer_started_at: null,
    metadata: {
      ...meta,
      production_run_id: runErr ? null : runId,
    },
  });

  return {
    job: serializeJob(updated),
    run_id: runErr ? null : runId,
    assembly_id: productId,
  };
}

export async function listCarpentryManufactureCandidates(sb) {
  const [{ data: assemblies, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, item_kind, metadata, category_id'),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');

  const carpentryRows = listCarpentryCatalogProducts(assemblies || []);
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  let floor2QtyByAssembly = new Map();
  if (floor2Id) {
    const { data: invRows } = await sb
      .from('warehouse_assembly_inventory')
      .select('assembly_id, quantity')
      .eq('location_id', floor2Id);
    floor2QtyByAssembly = new Map(
      (invRows || []).map((r) => [String(r.assembly_id), Math.max(0, Number(r.quantity) || 0)]),
    );
  }

  const products = carpentryRows.map((p) => {
    const id = String(p.id);
    const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
    const imageUrl = meta.floor2_wip_image_url || meta.catalog_image_url || meta.image_url || '';
    return {
      id,
      raw_assembly_id: id,
      name: p.name,
      raw_name: p.name,
      family_sku: p.family_sku || '',
      material_count: (p.materials || []).length,
      materials: p.materials || [],
      floor2_qty: floor2QtyByAssembly.get(id) || 0,
      image_url: imageUrl,
    };
  });

  return { products };
}
