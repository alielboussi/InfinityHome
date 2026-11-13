import {
  computeProductionFlowStatus,
  isActiveProductionJobStatus,
  productTitleForTrackingJob,
  productionDepartmentLabel,
} from '../../src/utils/productionJobFlowStatus.js';

const TABLES = Object.freeze({
  upholstery: 'upholstery_production_jobs',
  carpentry: 'carpentry_production_jobs',
  painting: 'painting_production_jobs',
});

function normalizeDepartmentFilter(raw) {
  const d = String(raw || '').trim().toLowerCase();
  if (!d || d === 'all') return null;
  if (d === 'upholstery' || d === 'carpentry' || d === 'painting') return d;
  return null;
}

function computeElapsedMs(job, nowMs = Date.now()) {
  let ms = Math.max(0, Number(job.accumulated_ms) || 0);
  if (job.status === 'running' && job.timer_started_at) {
    const started = new Date(job.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

function assemblyKeyForRow(department, row) {
  if (department === 'upholstery') {
    return String(row.finished_assembly_id || row.assembly_id || '').trim();
  }
  return String(row.assembly_id || '').trim();
}

function toTrackingRow(department, row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const qty = Math.max(1, Math.floor(Number(row.product_qty) || 1));
  const flowStatus = computeProductionFlowStatus(department, row);
  return {
    id: String(row.id),
    production_job_id: String(row.id),
    department,
    department_label: productionDepartmentLabel(department),
    assembly_id: assemblyKeyForRow(department, row),
    product_name: productTitleForTrackingJob({
      product_name: row.product_name,
      finished_name: row.finished_name,
      raw_name: row.raw_name,
      assembly_id: row.assembly_id,
    }),
    product_sku: String(row.product_sku || row.finished_sku || '').trim(),
    product_qty: qty,
    timer_status: String(row.status || '').trim().toLowerCase(),
    flow_status: flowStatus,
    accumulated_ms: Number(row.accumulated_ms) || 0,
    elapsed_ms: computeElapsedMs(row),
    timer_started_at: row.timer_started_at || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
  };
}

function shouldHideBehindPainting(department, row, activePaintingAssemblyIds) {
  const key = assemblyKeyForRow(department, row);
  if (!key || !activePaintingAssemblyIds.has(key)) return false;
  const st = String(row.status || '').trim().toLowerCase();
  return isActiveProductionJobStatus(st) || st === 'completed';
}

async function loadTableJobs(sb, table) {
  const { data, error } = await sb.from(table).select('*').limit(500);
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) return [];
    throw new Error(error.message || `Failed to load ${table}`);
  }
  return data || [];
}

/** Unified Hassan / Orders tracking — all departments, flow status, no materials. */
export async function listProductionJobsForTracking(sb, {
  department = null,
  limit = 300,
} = {}) {
  const deptFilter = normalizeDepartmentFilter(department);
  const cap = Math.min(500, Math.max(1, Number(limit) || 300));

  const [upholstery, carpentry, painting] = await Promise.all([
    deptFilter && deptFilter !== 'upholstery' ? [] : loadTableJobs(sb, TABLES.upholstery),
    deptFilter && deptFilter !== 'carpentry' ? [] : loadTableJobs(sb, TABLES.carpentry),
    deptFilter && deptFilter !== 'painting' ? [] : loadTableJobs(sb, TABLES.painting),
  ]);

  const activePaintingAssemblyIds = new Set();
  for (const row of painting) {
    if (!isActiveProductionJobStatus(row.status)) continue;
    const key = assemblyKeyForRow('painting', row);
    if (key) activePaintingAssemblyIds.add(key);
  }

  const merged = [];

  for (const row of upholstery) {
    if (shouldHideBehindPainting('upholstery', row, activePaintingAssemblyIds)) continue;
    merged.push(toTrackingRow('upholstery', row));
  }
  for (const row of carpentry) {
    if (shouldHideBehindPainting('carpentry', row, activePaintingAssemblyIds)) continue;
    merged.push(toTrackingRow('carpentry', row));
  }
  for (const row of painting) {
    merged.push(toTrackingRow('painting', row));
  }

  merged.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));

  return {
    jobs: merged.slice(0, cap),
    departments: ['upholstery', 'carpentry', 'painting'],
  };
}
