import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export async function fetchPaintingAccess() {
  const payload = await warehouseMobileRequest('painting-access-self');
  return {
    allowed: Boolean(payload?.allowed),
    displayName: payload?.display_name || null,
    grant: payload?.grant || null,
  };
}

export async function fetchPaintingProductionJobs({ activeOnly = true } = {}) {
  const payload = await warehouseMobileRequest('painting-job-list', { active_only: activeOnly });
  return payload?.jobs || [];
}

export async function fetchPaintingReturnOrders() {
  const payload = await warehouseMobileRequest('return-order-list', {
    for_production: true,
    repair_department: 'painting',
    hassan_only: true,
  });
  return payload?.return_orders || [];
}

export async function pausePaintingProductionJob(jobId) {
  return warehouseMobileRequest('painting-job-pause', { job_id: jobId });
}

export async function resumePaintingProductionJob(jobId) {
  return warehouseMobileRequest('painting-job-resume', { job_id: jobId });
}

export async function finishPaintingProductionJob(jobId) {
  return warehouseMobileRequest('painting-job-finish', { job_id: jobId });
}

export async function fetchProductionStoreroomMaterials() {
  const payload = await warehouseMobileRequest('production-storeroom-materials-list');
  return payload?.materials || [];
}

export async function saveProductionJobMaterials({
  jobKind,
  jobId,
  returnOrderId,
  productionRoute,
  materialLines,
} = {}) {
  return warehouseMobileRequest('production-job-materials-save', {
    job_kind: jobKind,
    job_id: jobId,
    return_order_id: returnOrderId,
    production_route: productionRoute,
    material_lines: materialLines,
  });
}
