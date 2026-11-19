import {
  computeProductionFlowStatus,
  isActiveProductionJobStatus,
  productTitleForTrackingJob,
  productionDepartmentLabel,
} from './productionJobFlowStatus';

function assemblyKey(department, job) {
  if (department === 'upholstery') {
    return String(job.finished_assembly_id || job.assembly_id || '').trim();
  }
  return String(job.assembly_id || '').trim();
}

function shouldHideBehindPainting(department, job, activePaintingAssemblyIds) {
  const key = assemblyKey(department, job);
  if (!key || !activePaintingAssemblyIds.has(key)) return false;
  const st = String(job.status || '').trim().toLowerCase();
  return isActiveProductionJobStatus(st) || st === 'completed';
}

export function jobToTrackingRow(department, job) {
  const meta = job?.metadata && typeof job.metadata === 'object' ? job.metadata : {};
  const status = String(job?.status || '').trim().toLowerCase();
  const qty = Math.max(1, Math.floor(Number(job?.product_qty) || 1));
  return {
    id: String(job.job_id || job.id || ''),
    production_job_id: String(job.job_id || job.id || ''),
    department,
    department_label: productionDepartmentLabel(department),
    assembly_id: assemblyKey(department, job),
    product_name: productTitleForTrackingJob({
      product_name: job.product_name,
      finished_name: job.finished_name,
      raw_name: job.raw_name,
      assembly_id: job.assembly_id,
    }),
    product_sku: String(job.product_sku || job.finished_sku || '').trim(),
    product_qty: qty,
    timer_status: status,
    flow_status: computeProductionFlowStatus(department, { status, metadata: meta, ...job }),
    accumulated_ms: Number(job.accumulated_ms) || 0,
    elapsed_ms: Number(job.elapsed_ms) || Number(job.accumulated_ms) || 0,
    timer_started_at: job.timer_started_at || null,
    started_at: job.started_at || null,
    completed_at: job.completed_at || null,
  };
}

/** Client merge when `production-jobs-tracking-list` is not deployed yet. */
export function mergeProductionJobsTrackingClient({
  upholstery = [],
  carpentry = [],
  painting = [],
  department = null,
} = {}) {
  const deptFilter = String(department || '').trim().toLowerCase();
  const activePaintingAssemblyIds = new Set();
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'painting') {
    for (const job of painting) {
      if (!isActiveProductionJobStatus(job.status)) continue;
      const key = assemblyKey('painting', job);
      if (key) activePaintingAssemblyIds.add(key);
    }
  }

  const merged = [];
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'upholstery') {
    for (const job of upholstery) {
      if (shouldHideBehindPainting('upholstery', job, activePaintingAssemblyIds)) continue;
      merged.push(jobToTrackingRow('upholstery', job));
    }
  }
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'carpentry') {
    for (const job of carpentry) {
      if (shouldHideBehindPainting('carpentry', job, activePaintingAssemblyIds)) continue;
      merged.push(jobToTrackingRow('carpentry', job));
    }
  }
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'painting') {
    for (const job of painting) {
      merged.push(jobToTrackingRow('painting', job));
    }
  }

  merged.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  return {
    jobs: merged,
    departments: ['upholstery', 'carpentry', 'painting'],
  };
}
