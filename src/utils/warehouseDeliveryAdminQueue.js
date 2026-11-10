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

export function deliveryAdminStageLabel(stage, kind = 'repair') {
  const s = String(stage || '').trim().toLowerCase();
  const k = String(kind || 'repair').toLowerCase();
  if (s === DELIVERY_ADMIN_STAGE.IN_PROGRESS) return k === 'order' ? 'Order in progress' : 'Repair in progress';
  if (s === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return 'Awaiting driver (Delivery app)';
  if (s === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER) return 'Collected by driver';
  if (s === DELIVERY_ADMIN_STAGE.DELIVERY_COMPLETED) return k === 'order' ? 'Order completed' : 'Repair completed';
  return s ? s.replace(/_/g, ' ') : '—';
}
