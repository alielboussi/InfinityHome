import {
  computeProductionFlowStatus,
  productTitleForTrackingJob,
  productionDepartmentLabel,
} from './productionJobFlowStatus';
import {
  collapseProductionTrackingDisplayRows,
  isProductionTrackingRowHidden,
} from './productionTrackingListUi';

function assemblyKey(department, job) {
  if (department === 'upholstery') {
    return String(job.finished_assembly_id || job.assembly_id || '').trim();
  }
  return String(job.assembly_id || '').trim();
}

export function jobToTrackingRow(department, job) {
  const meta = job?.metadata && typeof job.metadata === 'object' ? job.metadata : {};
  const status = String(job?.status || '').trim().toLowerCase();
  const qty = Math.max(1, Math.floor(Number(job?.product_qty) || 1));
  const quoteId = String(meta.carpentry_quote_id || meta.quote_id || '').trim() || null;
  const quoteLineId = String(meta.quote_line_id || '').trim() || null;
  const showroom = job.showroom_order === true || meta.showroom_order === true;
  const customerName = String(job.customer_name || meta.customer_name || '').trim();
  const customerPhone = String(job.customer_phone || meta.customer_phone || '').trim();
  const customer = !showroom && (
    job.customer_order === true || meta.customer_order === true || Boolean(customerName) || Boolean(quoteId)
  );
  return {
    id: String(job.job_id || job.id || ''),
    track_kind: 'factory',
    production_job_id: String(job.job_id || job.id || ''),
    quote_id: quoteId,
    quote_line_id: quoteLineId,
    quote_number: String(job.quote_number || meta.quote_number || '').trim() || null,
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
    customer_name: customerName || null,
    customer_phone: customerPhone || null,
    showroom_order: showroom,
    customer_order: customer,
    catalog_manufacture: meta.catalog_manufacture === true || job.catalog_manufacture === true,
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
  const merged = [];
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'upholstery') {
    for (const job of upholstery) {
      const row = jobToTrackingRow('upholstery', job);
      if (isProductionTrackingRowHidden(row)) continue;
      merged.push(row);
    }
  }
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'carpentry') {
    for (const job of carpentry) {
      const row = jobToTrackingRow('carpentry', job);
      if (isProductionTrackingRowHidden(row)) continue;
      merged.push(row);
    }
  }
  if (!deptFilter || deptFilter === 'all' || deptFilter === 'painting') {
    for (const job of painting) {
      const row = jobToTrackingRow('painting', job);
      if (isProductionTrackingRowHidden(row)) continue;
      merged.push(row);
    }
  }

  const jobs = collapseProductionTrackingDisplayRows(merged);
  return {
    jobs,
    departments: ['upholstery', 'carpentry', 'painting'],
  };
}
