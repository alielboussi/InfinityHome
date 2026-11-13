/** Hassan portal + Orders app — unified workshop job lifecycle labels. */

const ACTIVE_STATUSES = new Set(['ready', 'running', 'paused']);

const DEPARTMENT_LABELS = Object.freeze({
  upholstery: 'Upholstery',
  carpentry: 'Carpentry',
  painting: 'Painting',
});

export function productionDepartmentLabel(department) {
  const d = String(department || '').trim().toLowerCase();
  return DEPARTMENT_LABELS[d] || (d ? d.charAt(0).toUpperCase() + d.slice(1) : '—');
}

function deliveryAdminStage(meta) {
  const admin = meta?.delivery_admin && typeof meta.delivery_admin === 'object' ? meta.delivery_admin : {};
  return String(admin.stage || '').trim().toLowerCase();
}

/**
 * Flow status for a production job row (server metadata + timer status).
 * @param {'upholstery'|'carpentry'|'painting'} department
 * @param {object} job — raw or serialized; needs status + metadata
 */
export function computeProductionFlowStatus(department, job) {
  const dept = String(department || '').trim().toLowerCase();
  const status = String(job?.status || '').trim().toLowerCase();
  const meta = job?.metadata && typeof job.metadata === 'object' ? job.metadata : {};

  if (dept === 'painting') {
    if (ACTIVE_STATUSES.has(status)) return 'In Painting';
    if (status === 'completed') {
      const dest = String(meta.finish_destination || job.finish_destination || '').toLowerCase();
      const stage = deliveryAdminStage(meta);
      if (dest === 'floor1' || meta.floor1_credited === true) {
        return 'Sent to Floor 1 for Storage';
      }
      if (stage === 'awaiting_driver' || dest === 'delivery') return 'Ready For Delivery';
      if (stage === 'collected_by_driver') return 'With driver';
      if (stage === 'delivery_completed') return 'Delivered';
      return 'Completed';
    }
    return 'In Painting';
  }

  if (ACTIVE_STATUSES.has(status)) return 'In production';

  if (status === 'completed') {
    const stage = deliveryAdminStage(meta);
    if (stage === 'awaiting_driver') return 'Ready For Delivery';
    if (stage === 'collected_by_driver') return 'With driver';
    if (stage === 'delivery_completed') return 'Delivered';
    if (meta.catalog_manufacture) return 'Completed';
    return 'Completed';
  }

  return 'In production';
}

export function isActiveProductionJobStatus(status) {
  return ACTIVE_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function productTitleForTrackingJob(row) {
  if (!row) return '—';
  return (
    row.product_name
    || row.finished_name
    || row.raw_name
    || row.assembly_name
    || row.assembly_id
    || '—'
  );
}
