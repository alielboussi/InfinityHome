import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { normalizeWarehousePacketScan } from '../../src/utils/warehouseScanResolver.js';
import { newUuid } from './uuid.js';
import { enqueueWarehouseProductionLabelJob } from './productionLabelPrint.js';
import { logWarehouseProductionStockIncrease } from './warehouseProductionLog.js';
import { resolveCarpentryStoreroomLocations } from './storeroomBomDeduction.js';
import {
  creditUpholsteryFinishedOutput,
  loadUpholsteryManufactureContext,
  recomputeUpholsteryManufactureLocations,
} from './upholsteryManufacture.js';

const JOBS = 'upholstery_production_jobs';
const RUNS = 'carpentry_production_runs';
const USAGE = 'carpentry_production_material_usage';

const ACTIVE_STATUSES = new Set(['ready', 'running', 'paused']);

function stripUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  }
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

function jobCheckedUnits(job) {
  const meta = job?.metadata && typeof job.metadata === 'object' ? job.metadata : {};
  const raw = meta.checked_unit_indexes || meta.checked_units || [];
  return Array.isArray(raw) ? raw.map((n) => Math.floor(Number(n))).filter((n) => n >= 1) : [];
}

function computeElapsedMs(job, nowMs = Date.now()) {
  let ms = Math.max(0, Number(job.accumulated_ms) || 0);
  if (job.status === 'running' && job.timer_started_at) {
    const started = new Date(job.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

function serializeJob(job, assembliesById = null) {
  if (!job) return null;
  const checked = jobCheckedUnits(job);
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  let rawName = job.raw_name || '';
  let finishedName = job.finished_name || '';
  if (assembliesById) {
    rawName = rawName || assembliesById.get(String(job.raw_assembly_id))?.name || '';
    finishedName = finishedName || assembliesById.get(String(job.finished_assembly_id))?.name || '';
  }
  return {
    job_id: job.id,
    id: job.id,
    raw_assembly_id: job.raw_assembly_id,
    finished_assembly_id: job.finished_assembly_id,
    raw_name: rawName,
    finished_name: finishedName,
    finished_sku: job.finished_sku || '',
    product_qty: qty,
    status: job.status,
    checked_unit_indexes: checked,
    units_checked: checked.length,
    all_units_checked: checked.length >= qty,
    accumulated_ms: Number(job.accumulated_ms) || 0,
    elapsed_ms: computeElapsedMs(job),
    timer_started_at: job.timer_started_at || null,
    started_at: job.started_at || null,
    completed_at: job.completed_at || null,
    accepted_by: job.accepted_by || null,
    manual_material_lines: Array.isArray(job.metadata?.manual_material_lines)
      ? job.metadata.manual_material_lines
      : [],
    floor2_push: Boolean(job.metadata?.floor2_push),
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
  if (!row?.id) {
    return loadJob(sb, jobId);
  }
  return row;
}

export async function startUpholsteryProductionJob(sb, {
  rawAssemblyId,
  productQty = 1,
  userId = null,
  user = null,
}) {
  const requestedQty = Math.floor(Number(productQty) || 1);
  if (requestedQty !== 1) {
    throw new Error('Each job is one product only (qty 1). Start a new job for another unit.');
  }
  const ctx = await loadUpholsteryManufactureContext(sb, rawAssemblyId);
  const storeroomLocsForRecompute = await resolveCarpentryStoreroomLocations(sb);

  const now = new Date().toISOString();
  const jobId = newUuid();
  const rawName = String(ctx.rawRow?.name || '').trim();
  const finishedName = String(ctx.finishedTemplate?.name || '').trim();
  const finishedSku = String(ctx.finishedTemplate?.family_sku || '').trim();

  const row = stripUndefinedDeep({
    id: jobId,
    raw_assembly_id: ctx.rawId,
    finished_assembly_id: ctx.finishedTemplate.id,
    raw_name: rawName,
    finished_name: finishedName,
    finished_sku: finishedSku,
    product_qty: 1,
    status: 'ready',
    accumulated_ms: 0,
    timer_started_at: null,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: {
      channel: 'warehouse_production_app',
      material_usage_rows: [],
      manual_material_lines: [],
      storeroom_location_ids: storeroomLocsForRecompute.map((l) => l.id).filter(Boolean),
    },
    created_at: now,
    updated_at: now,
  });

  const { data: inserted, error: insErr } = await sb.from(JOBS).insert(row).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create production job');
  if (!inserted?.id) throw new Error('Failed to create production job (no row returned)');

  return { job: serializeJob(inserted) };
}

export async function listUpholsteryProductionJobs(sb, { activeOnly = true } = {}) {
  const { data, error } = await sb.from(JOBS).select('*');
  if (error) throw new Error(error.message || 'Failed to list jobs');
  let rows = data || [];
  if (activeOnly) {
    rows = rows.filter((r) => ACTIVE_STATUSES.has(normalizeJobStatus(r.status)));
  }
  rows.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  return { jobs: rows.map((r) => serializeJob(r)) };
}

export async function pauseUpholsteryProductionJob(sb, { jobId, userId }) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  if (String(job.accepted_by || '') !== String(userId || '') && userId) {
    // allow same kiosk user pool — only block if another user id set
  }
  if (job.status !== 'running') {
    return { job: serializeJob(job) };
  }
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

export async function resumeUpholsteryProductionJob(sb, { jobId, userId }) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  if (job.status === 'running') return { job: serializeJob(job) };
  if (job.status !== 'paused' && job.status !== 'ready') {
    throw new Error('Job cannot be started');
  }
  const nowIso = new Date().toISOString();
  const updated = await saveJobPatch(sb, job.id, {
    status: 'running',
    timer_started_at: nowIso,
    paused_at: null,
  });
  return { job: serializeJob(updated) };
}

export async function toggleUpholsteryProductionJobUnit(sb, {
  jobId,
  unitIndex,
  userId,
}) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const unit = Math.floor(Number(unitIndex) || 0);
  if (unit < 1 || unit > qty) throw new Error(`unit_index must be 1..${qty}`);

  const checked = jobCheckedUnits(job);
  const set = new Set(checked);
  if (set.has(unit)) {
    set.delete(unit);
  } else {
    set.add(unit);
  }
  const nextChecked = [...set].sort((a, b) => a - b);
  const meta = { ...(job.metadata || {}), checked_unit_indexes: nextChecked };

  let patch = { metadata: meta };
  const wasReady = job.status === 'ready';
  const firstCheck = nextChecked.length > 0 && wasReady;
  if (firstCheck) {
    patch = {
      ...patch,
      status: 'running',
      timer_started_at: new Date().toISOString(),
    };
  }
  if (nextChecked.length === 0 && (job.status === 'running' || job.status === 'ready')) {
    const accumulated = computeElapsedMs(job);
    patch = {
      ...patch,
      status: 'ready',
      accumulated_ms: accumulated,
      timer_started_at: null,
    };
  }

  const updated = await saveJobPatch(sb, job.id, patch);
  return { job: serializeJob(updated) };
}

export async function finishUpholsteryProductionJob(sb, {
  jobId,
  userId = null,
  user = null,
  labelPrintedBy = 'Upholstery production',
}) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));

  const ctx = await loadUpholsteryManufactureContext(sb, job.raw_assembly_id);
  const output = await creditUpholsteryFinishedOutput(sb, ctx, qty);

  const meta = job.metadata || {};
  const materialUsageRows = Array.isArray(meta.material_usage_rows) ? meta.material_usage_rows : [];
  const storeroomIds = Array.isArray(meta.storeroom_location_ids) ? meta.storeroom_location_ids : [];

  const now = new Date().toISOString();
  const finalElapsed = computeElapsedMs(job);
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'upholstery_floor',
    quote_id: null,
    assembly_id: output.output_assembly_id,
    product_qty: qty,
    started_at: job.started_at || now,
    completed_at: now,
    accepted_by: userId,
    metadata: {
      channel: 'warehouse_production_app',
      upholstery_job_id: job.id,
      raw_assembly_id: job.raw_assembly_id,
      finished_template_id: ctx.finishedTemplate.id,
      output_created: output.created,
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

  const labelSku = normalizeWarehousePacketScan(output.sku) || output.sku;
  let labelJobId = null;
  let labelPrintWarning = null;
  try {
    labelJobId = await enqueueWarehouseProductionLabelJob(sb, {
      name: output.name,
      sku: labelSku,
      qty,
      printedBy: labelPrintedBy,
      source: 'warehouse_production_app',
      printedAt: new Date(),
    });
    if (!labelJobId) {
      labelPrintWarning = 'Stock updated but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
    }
  } catch (printErr) {
    labelPrintWarning = printErr?.message || 'Label print failed';
  }

  await logWarehouseProductionStockIncrease({
    user,
    assembly: output.outputAssembly,
    delta: qty,
    qtyBefore: output.qty_before,
    qtyAfter: output.qty_after,
    warehouseLocationId: WAREHOUSE_FACTORY_LOCATION_ID,
    source: 'warehouse_production_app',
  });

  const storeroomLocs = storeroomIds.map((id) => ({ id }));
  await recomputeUpholsteryManufactureLocations(sb, ctx, storeroomLocs);

  const updated = await saveJobPatch(sb, job.id, {
    status: 'completed',
    completed_at: now,
    accumulated_ms: finalElapsed,
    timer_started_at: null,
    metadata: {
      ...meta,
      production_run_id: runErr ? null : runId,
      label_job_id: labelJobId,
      label_print_warning: labelPrintWarning,
    },
  });

  return {
    job: serializeJob(updated),
    output_assembly_id: output.output_assembly_id,
    output_sku: output.sku,
    output_name: output.name,
    label_job_id: labelJobId,
    label_print_warning: labelPrintWarning,
  };
}
