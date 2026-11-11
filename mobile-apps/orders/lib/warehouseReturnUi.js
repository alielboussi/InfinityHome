export const WAREHOUSE_RETURN_REASON_GROUPS = [
  { id: 'upholstery', label: 'Upholstery', reasons: ['Upholstery', 'Maintenance', 'Cushion', 'Design', 'Repair', 'Color', 'Size'] },
  { id: 'carpentry', label: 'Carpentry', reasons: ['Structure', 'Legs', 'Finish', 'Design', 'Repair', 'Size'] },
  { id: 'painting', label: 'Painting', reasons: ['Color', 'Touch-up', 'Spray finish', 'Scratches', 'Peeling', 'Mismatch', 'Finish'] },
  { id: 'general', label: 'General', reasons: ['Maintenance', 'Quality check', 'Other'] },
];

export const REPAIR_DEPARTMENTS = [
  { id: 'upholstery', label: 'Upholstery' },
  { id: 'carpentry', label: 'Carpentry' },
  { id: 'painting', label: 'Painting' },
];

export function returnReasonShowsLeatherCode(reason) {
  const lower = String(reason || '').trim().toLowerCase();
  return lower === 'upholstery' || lower === 'cushion' || lower === 'color';
}

export function resolveReturnRepairDepartment(row) {
  const reason = String(row?.reason || '').trim().toLowerCase();
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const groupId = String(row?.reason_group || meta.reason_group || '').trim().toLowerCase();
  const paintingReasons = ['color', 'touch-up', 'spray finish', 'scratches', 'peeling', 'mismatch', 'finish'];
  if (groupId === 'upholstery') return 'upholstery';
  if (groupId === 'painting') return 'painting';
  if (groupId === 'general') return 'carpentry';
  if (groupId === 'carpentry') return paintingReasons.includes(reason) ? 'painting' : 'carpentry';
  if (paintingReasons.includes(reason)) return 'painting';
  if (['structure', 'legs', 'quality check', 'other'].includes(reason)) return 'carpentry';
  if (['upholstery', 'cushion'].includes(reason)) return 'upholstery';
  if (reason === 'maintenance') return 'carpentry';
  if (['design', 'repair', 'size'].includes(reason)) return 'upholstery';
  return 'upholstery';
}

export function repairDepartmentLabel(departmentId) {
  return REPAIR_DEPARTMENTS.find((d) => d.id === departmentId)?.label || departmentId || '—';
}

export function returnOrderLifecycleBadge(row) {
  const status = String(row?.status || '').trim();
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const hasCustomer = Boolean(String(row?.customer_name || '').trim());
  if (status === 'awaiting_kitwe_accept') {
    return 'In transit to Kitwe — awaiting Hassan accept on Deliveries';
  }
  const admin = meta.delivery_admin;
  if (admin?.stage === 'awaiting_driver' || meta.ready_for_delivery_app === true) {
    return 'Ready for delivery — Delivery app → Repairs';
  }
  if (admin?.stage === 'collected_by_driver') {
    return 'Collected by driver — awaiting Hassan accept on Deliveries';
  }
  if (admin?.stage === 'delivery_completed') return 'Delivery completed';
  if (
    status === 'completed'
    && meta.floor1_awaiting_hassan
    && !hasCustomer
    && !meta.kitwe_restored_at
    && !meta.customer_fulfilled_at
  ) {
    return 'On Floor 1 — ship back from production; Hassan accepts on Deliveries when it arrives';
  }
  if (status === 'shipped' && meta.kitwe_restored_at) return 'Back on Kitwe stock';
  if (status === 'customer_delivered') return 'Delivered to customer';
  return '';
}

export function deliveryAdminStageLabel(stage) {
  const s = String(stage || '').trim().toLowerCase();
  if (s === 'in_progress') return 'Repair in progress';
  if (s === 'awaiting_driver') return 'Awaiting driver (Delivery app)';
  if (s === 'collected_by_driver') return 'Collected by driver';
  if (s === 'delivery_completed') return 'Repair completed';
  return s ? s.replace(/_/g, ' ') : '';
}

export function returnOrderUnitLabel(row) {
  const meta = row?.metadata || {};
  const total = Number(meta.batch_line_count) || 0;
  const index = Number(meta.batch_line_index) || 0;
  if (total > 1 && index > 0) {
    return `${row?.return_number || 'RO'} · unit ${index}/${total}`;
  }
  return String(row?.return_number || 'RO');
}

export function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const s = totalSec % 60;
  const m = Math.floor((totalSec % 3600) / 60);
  const h = Math.floor(totalSec / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
