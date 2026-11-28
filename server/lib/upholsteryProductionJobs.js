import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { normalizeWarehousePacketScan } from '../../src/utils/warehouseScanResolver.js';
import { newUuid } from './uuid.js';
import { enqueueWarehouseProductionLabelJob } from './productionLabelPrint.js';
import { logWarehouseProductionStockIncrease } from './warehouseProductionLog.js';
import { resolveCarpentryStoreroomLocations } from './storeroomBomDeduction.js';
import {
  enrichManualMaterialLines,
  manualMaterialLinesNeedMetadataRepair,
} from './productionJobMaterials.js';
import {
  consumeUpholsteryRawAndMaterials,
  resolveFinishedOutputAssemblyOnly,
  creditUpholsteryFinishedOutput,
  loadUpholsteryManufactureContext,
  recomputeUpholsteryManufactureLocations,
  pickAssemblyDimensionFields,
} from './upholsteryManufacture.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { formatAssemblyDimensions } from '../../src/utils/warehouseAssemblySpecs.js';
import { readWarehouseFloor2WipImageUrl } from '../../src/utils/warehouseFloor2WipImage.js';

const ASSEMBLIES = 'warehouse_assemblies';

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
    dim_length: job.dim_length ?? null,
    dim_width: job.dim_width ?? null,
    dim_height: job.dim_height ?? null,
    dimensions_display: String(job.dimensions_display || '').trim() || undefined,
    floor2_image_url: String(job.floor2_image_url || '').trim() || undefined,
    product_image_url: String(job.product_image_url || job.floor2_image_url || '').trim() || undefined,
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
  const jobs = [];
  const now = new Date().toISOString();
  for (const row of rows) {
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
  const assemblyIds = [
    ...new Set(
      jobs.flatMap((j) => [String(j.raw_assembly_id || ''), String(j.finished_assembly_id || '')]).filter(Boolean),
    ),
  ];
  if (assemblyIds.length) {
    const { data: assemblies } = await sb
      .from(ASSEMBLIES)
      .select('id, metadata, dim_length, dim_width, dim_height')
      .in('id', assemblyIds);
    const byId = new Map((assemblies || []).map((row) => [String(row.id), row]));
    for (const job of jobs) {
      const rawAsm = byId.get(String(job.raw_assembly_id || ''));
      const finishedAsm = byId.get(String(job.finished_assembly_id || ''));
      const dims = pickAssemblyDimensionFields(finishedAsm, rawAsm);
      job.dim_length = dims.dim_length;
      job.dim_width = dims.dim_width;
      job.dim_height = dims.dim_height;
      const display = formatAssemblyDimensions(dims);
      if (display) job.dimensions_display = display;
      const wip = readWarehouseFloor2WipImageUrl(rawAsm)
        || readWarehouseFloor2WipImageUrl(finishedAsm);
      if (wip) {
        job.floor2_image_url = wip;
        job.product_image_url = wip;
      }
    }
  }
  return { jobs };
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

function buildUpholsteryJobUnitCheckPatch(job, nextChecked) {
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const sorted = [...new Set(
    (nextChecked || []).map((n) => Math.floor(Number(n))).filter((n) => n >= 1 && n <= qty),
  )].sort((a, b) => a - b);
  const meta = { ...(job.metadata || {}), checked_unit_indexes: sorted };

  let patch = { metadata: meta };
  const wasReady = job.status === 'ready';
  const firstCheck = sorted.length > 0 && wasReady;
  if (firstCheck) {
    patch = {
      ...patch,
      status: 'running',
      timer_started_at: new Date().toISOString(),
      accumulated_ms: Math.max(0, Number(job.accumulated_ms) || 0),
    };
  }
  if (sorted.length === 0 && (job.status === 'running' || job.status === 'ready')) {
    const accumulated = computeElapsedMs(job);
    patch = {
      ...patch,
      status: 'ready',
      accumulated_ms: accumulated,
      timer_started_at: null,
    };
  }
  return { patch, sorted };
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
  const { patch } = buildUpholsteryJobUnitCheckPatch(job, nextChecked);
  const updated = await saveJobPatch(sb, job.id, patch);
  return { job: serializeJob(updated) };
}

/** Set how many units are complete (1..qty) — kiosk enters count + confirm. */
export async function setUpholsteryProductionJobUnitsCompleted(sb, {
  jobId,
  completedCount,
  userId,
}) {
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const count = Math.floor(Number(completedCount));
  if (!Number.isFinite(count) || count < 0 || count > qty) {
    throw new Error(`completed_count must be 0..${qty}`);
  }
  const nextChecked = count === 0 ? [] : Array.from({ length: count }, (_, i) => i + 1);
  const { patch } = buildUpholsteryJobUnitCheckPatch(job, nextChecked);
  const updated = await saveJobPatch(sb, job.id, patch);
  return { job: serializeJob(updated) };
}

export async function finishUpholsteryProductionJob(sb, {
  jobId,
  userId = null,
  user = null,
  labelPrintedBy = 'Upholstery production',
  destination = 'delivery',
}) {
  const dest = String(destination || 'delivery').trim().toLowerCase() === 'floor1'
    ? 'floor1'
    : 'delivery';
  const job = await loadJob(sb, jobId);
  if (!ACTIVE_STATUSES.has(normalizeJobStatus(job.status))) throw new Error('Job is not active');
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const { lookupQuoteIdForAssembly } = await import('./warehouseDeliveryAdminQueue.js');
  let linkedQuoteId = String(job.metadata?.quote_id || job.metadata?.carpentry_quote_id || job.quote_id || '').trim();

  const ctx = await loadUpholsteryManufactureContext(sb, job.raw_assembly_id);
  const meta = job.metadata || {};
  const alreadyDeducted = meta.floor2_raw_deducted === true;
  const deductRawOnFinish = meta.floor2_deduct_on_finish === true && !alreadyDeducted;
  let floor2DeductedNow = alreadyDeducted;
  let storeroomLocsForRecompute = [];
  if (!alreadyDeducted && !deductRawOnFinish && job.raw_assembly_id) {
    const { adjustAssemblyInventory, loadAssemblyInventoryQty } = await import('./storeroomBomDeduction.js');
    const { resolveWarehouseFloor2Location } = await import('../../src/constants/warehouseFloorLocations.js');
    const { data: locRows } = await sb.from('locations').select('id, name');
    const floor2Id = resolveWarehouseFloor2Location(locRows || [])?.id;
    if (floor2Id) {
      const have = await loadAssemblyInventoryQty(sb, job.raw_assembly_id, floor2Id);
      if (have < qty) throw new Error(`Insufficient Floor 2 stock (have ${have}, need ${qty})`);
      await adjustAssemblyInventory(sb, job.raw_assembly_id, floor2Id, -qty);
      await recomputeWarehouseLocationStockServer(sb, floor2Id);
      floor2DeductedNow = true;
    }
  }
  if (deductRawOnFinish) {
    const { storeroomLocsForRecompute: storeroomLocs } = await consumeUpholsteryRawAndMaterials(
      sb,
      ctx,
      qty,
      { deductStoreroomBom: false },
    );
    storeroomLocsForRecompute = storeroomLocs || [];
  }

  const output = await resolveFinishedOutputAssemblyOnly(sb, ctx);
  output.qty_after = qty;
  if (!linkedQuoteId) {
    linkedQuoteId = await lookupQuoteIdForAssembly(sb, output.output_assembly_id || job.raw_assembly_id || job.assembly_id, {
      department: 'upholstery',
      assemblyName: output.name || job.product_name,
      quantity: qty,
    }) || '';
  }
  const materialUsageRows = Array.isArray(meta.material_usage_rows) ? meta.material_usage_rows : [];
  const storeroomIds = Array.isArray(meta.storeroom_location_ids) ? meta.storeroom_location_ids : [];

  const now = new Date().toISOString();
  const finalElapsed = computeElapsedMs(job);
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'upholstery_floor',
    quote_id: linkedQuoteId || null,
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
    if (linkedQuoteId) {
      const { printQuoteOrderLabelsForQuote } = await import('./quoteProductionRouting.js');
      labelJobId = await printQuoteOrderLabelsForQuote(sb, {
        quoteId: linkedQuoteId,
        printedBy: labelPrintedBy,
        qtyFallback: qty,
      });
    } else {
    labelJobId = await enqueueWarehouseProductionLabelJob(sb, {
      name: output.name,
      sku: labelSku,
      qty,
      printedBy: labelPrintedBy,
      source: 'warehouse_production_app',
      printedAt: new Date(),
      photoFloor: 'floor2',
      customerName: job.metadata?.customer_name,
      customerPhone: job.metadata?.customer_phone,
      quoteNumber: job.metadata?.quote_number,
    });
    }
    if (!labelJobId) {
      labelPrintWarning = 'Stock updated but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
    }
  } catch (printErr) {
    labelPrintWarning = printErr?.message || 'Label print failed';
  }

  let floor1Credited = false;
  let deliveryQueued = false;
  const storeroomLocs = [...storeroomIds.map((id) => ({ id })), ...storeroomLocsForRecompute];

  let pendingFloor1 = null;
  if (dest === 'floor1') {
    const { buildPendingFloor1Credit } = await import('./floor1CreditApproval.js');
    pendingFloor1 = buildPendingFloor1Credit({
      assemblyId: output.output_assembly_id,
      qty,
      requestedBy: userId,
      requestedEmail: user?.email,
      source: 'upholstery_job',
    });
    await logWarehouseProductionStockIncrease({
      user,
      assembly: output.outputAssembly,
      delta: qty,
      qtyBefore: 0,
      qtyAfter: 0,
      warehouseLocationId: WAREHOUSE_FACTORY_LOCATION_ID,
      source: 'warehouse_production_app_floor1_pending',
    });
    await recomputeUpholsteryManufactureLocations(sb, ctx, storeroomLocs);
  } else {
    await logWarehouseProductionStockIncrease({
      user,
      assembly: output.outputAssembly,
      delta: qty,
      qtyBefore: 0,
      qtyAfter: qty,
      warehouseLocationId: 'warehouse_floor_2_staging',
      source: 'warehouse_production_app_delivery_queue',
    });
    await recomputeUpholsteryManufactureLocations(sb, ctx, storeroomLocs);
  }

  const updated = await saveJobPatch(sb, job.id, {
    status: 'completed',
    completed_at: now,
    accumulated_ms: finalElapsed,
    timer_started_at: null,
    metadata: stripUndefinedDeep({
      ...meta,
      ...(linkedQuoteId ? { quote_id: linkedQuoteId, carpentry_quote_id: linkedQuoteId } : {}),
      production_run_id: runErr ? null : runId,
      label_job_id: labelJobId ?? null,
      label_print_warning: labelPrintWarning ?? null,
      floor2_raw_deducted: floor2DeductedNow || deductRawOnFinish || meta.floor2_raw_deducted === true,
      finish_destination: dest,
      floor1_credited: floor1Credited,
      production_locked: true,
      floor1_awaiting_hassan: dest === 'floor1',
      pending_floor1_credit: pendingFloor1,
    }),
  });

  if (dest === 'delivery') {
    const { registerProductionJobAwaitingDriver } = await import('./warehouseDeliveryAdminQueue.js');
    await registerProductionJobAwaitingDriver(sb, {
      jobsTable: 'upholstery_production_jobs',
      jobRow: updated,
      assemblyId: output.output_assembly_id,
      assemblyName: String(updated?.product_name || job.product_name || '').trim(),
      qty,
      department: 'upholstery',
      quoteId: linkedQuoteId || null,
    });
    deliveryQueued = true;
  }

  try {
    const { queueUpholsteryProductionWhatsApp } = await import('./upholsteryProductionWhatsAppNotify.js');
    queueUpholsteryProductionWhatsApp({
      kind: 'orderComplete',
      orderSource: 'manufacture',
      producedBy: labelPrintedBy,
      status: 'Completed',
      products: [{
        name: String(output.name || job.finished_name || job.raw_name || 'Product').trim(),
        qty,
        remainingQty: 0,
      }],
    });
  } catch (waErr) {
    console.warn('[upholstery-job-finish] WhatsApp notify failed:', waErr?.message || waErr);
  }

  return {
    job: serializeJob(updated),
    output_assembly_id: output.output_assembly_id,
    output_sku: output.sku,
    output_name: output.name,
    label_job_id: labelJobId,
    label_print_warning: labelPrintWarning,
    finish_destination: dest,
    floor1_credited: floor1Credited,
    delivery_admin_awaiting_driver: deliveryQueued,
  };
}
