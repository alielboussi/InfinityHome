/** Repairs + production orders — delivery lifecycle on /warehouse-repairs-admin (no floor stock). */

export const DELIVERY_ADMIN_KIND = Object.freeze({
  REPAIR: 'repair',
  ORDER: 'order',
});

export const DELIVERY_ADMIN_STAGE = Object.freeze({
  IN_PROGRESS: 'in_progress',
  AWAITING_DRIVER: 'awaiting_driver',
  COLLECTED_BY_DRIVER: 'collected_by_driver',
  DELIVERY_COMPLETED: 'delivery_completed',
});

export function readDeliveryAdminMeta(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const admin = meta.delivery_admin && typeof meta.delivery_admin === 'object'
    ? meta.delivery_admin
    : null;
  return admin;
}

const COMPLETED_AWAITING_DELIVERY = 'Completed (Awaiting Delivery)';

export function isCompletedAwaitingDelivery(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status !== 'completed') return false;
  const admin = readDeliveryAdminMeta(row);
  const stage = String(admin?.stage || row?.delivery_admin_stage || '').toLowerCase();
  if (stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return true;
  if (row?.metadata?.ready_for_delivery_app === true) return true;
  if (row?.ready_for_delivery_app === true) return true;
  if (/awaiting driver/i.test(String(row?.lifecycle_badge || ''))) return true;
  if (stage === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER
    || stage === DELIVERY_ADMIN_STAGE.DELIVERY_COMPLETED) {
    return false;
  }
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.floor1_awaiting_hassan || meta.floor2_repair_staged_at || meta.kitwe_restored_at) {
    return false;
  }
  if (meta.customer_fulfilled_at) return false;
  return true;
}

/** Portal + shared display for repair rows on /warehouse-repairs-admin. */
export function repairAdminStatusDisplay(row) {
  if (isCompletedAwaitingDelivery(row)) return COMPLETED_AWAITING_DELIVERY;
  const admin = readDeliveryAdminMeta(row);
  const stage = String(admin?.stage || row?.delivery_admin_stage || '').toLowerCase();
  const status = String(row?.status || '').toLowerCase();
  if (stage) return deliveryAdminStageLabel(stage, 'repair');
  if (status === 'in_progress') return 'In progress';
  if (status) return status.replace(/_/g, ' ');
  return '—';
}

/** Production order lines in delivery queue (awaiting driver). */
export function orderAdminStatusDisplay(row) {
  const stage = String(row?.delivery_admin_stage || '').toLowerCase();
  if (stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER || !stage) {
    return COMPLETED_AWAITING_DELIVERY;
  }
  return deliveryAdminStageLabel(stage, 'order');
}

export function deliveryAdminStageLabel(stage, kind = 'repair') {
  const s = String(stage || '').trim().toLowerCase();
  const k = String(kind || 'repair').toLowerCase();
  if (s === DELIVERY_ADMIN_STAGE.IN_PROGRESS) return k === 'order' ? 'Order in progress' : 'Repair in progress';
  if (s === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return 'Awaiting driver (Delivery app)';
  if (s === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER) return 'Collected by driver';
  if (s === DELIVERY_ADMIN_STAGE.DELIVERY_COMPLETED) return k === 'order' ? 'Order completed' : 'Repair completed';
  return s ? s.replace(/_/g, ' ') : '—';
}
