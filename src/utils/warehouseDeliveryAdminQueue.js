/** Repairs + production orders — delivery lifecycle on /warehouse-repairs-admin (no floor stock). */

import {
  parseWarehouseReturnMetadata,
  WAREHOUSE_RETURN_STATUSES,
} from './warehouseReturnOrder.js';

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

export { parseWarehouseReturnMetadata };

export function readDeliveryAdminMeta(row) {
  const meta = parseWarehouseReturnMetadata(row?.metadata);
  const admin = meta.delivery_admin && typeof meta.delivery_admin === 'object'
    ? meta.delivery_admin
    : null;
  return admin;
}

function legacyFloor1CompleteAwaitingHassan(meta, admin) {
  const stage = String(admin?.stage || '').toLowerCase();
  if (stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return false;
  if (meta.ready_for_delivery_app === true) return false;
  return meta.floor1_awaiting_hassan === true && Boolean(meta.factory_stock_added_at);
}

function legacyFloor2StagedOnly(meta, admin) {
  const stage = String(admin?.stage || '').toLowerCase();
  if (stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return false;
  if (meta.ready_for_delivery_app === true) return false;
  return Boolean(meta.floor2_repair_staged_at);
}

/** Workshop repair complete → listed in Delivery app Repairs queue (not legacy Floor 1 ship). */
export function repairEligibleForMobileDeliveryQueue(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) return false;

  const meta = parseWarehouseReturnMetadata(row?.metadata);
  const admin = meta.delivery_admin && typeof meta.delivery_admin === 'object' ? meta.delivery_admin : null;
  const stage = String(admin?.stage || row?.delivery_admin_stage || '').toLowerCase();

  if (stage === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER
    || stage === DELIVERY_ADMIN_STAGE.DELIVERY_COMPLETED) {
    return false;
  }
  if (meta.customer_fulfilled_at || meta.kitwe_restored_at || meta.in_transit_to_kitwe_at) {
    return false;
  }
  if (stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return true;
  if (meta.ready_for_delivery_app === true) return true;
  if (row?.ready_for_delivery_app === true) return true;
  if (legacyFloor2StagedOnly(meta, admin)) return false;
  if (legacyFloor1CompleteAwaitingHassan(meta, admin)) return false;
  return true;
}

const COMPLETED_AWAITING_DELIVERY = 'Ready for delivery';

/** Portal copy — unit is held on delivery_admin, not warehouse_assembly_inventory. */
export const DELIVERY_ADMIN_HOLD_LABEL = 'In delivery queue (not on floor)';
export const DELIVERY_ADMIN_IN_TRANSIT_LABEL = 'With driver — not counted on warehouse floors';

export function repairOnDeliveryAdminVirtualHold(row) {
  return repairEligibleForMobileDeliveryQueue(row);
}

export function orderOnDeliveryAdminVirtualHold(row) {
  const stage = String(row?.delivery_admin_stage || '').toLowerCase();
  if (stage === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER
    || stage === DELIVERY_ADMIN_STAGE.DELIVERY_COMPLETED) {
    return false;
  }
  return stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER || !stage;
}

/** Footnote for /warehouse-repairs-admin cards (null when on floors or fully done). */
export function deliveryAdminInventoryFootnote(row, kind = 'repair') {
  if (kind === 'order') {
    if (orderOnDeliveryAdminVirtualHold(row)) return DELIVERY_ADMIN_HOLD_LABEL;
    const stage = String(row?.delivery_admin_stage || '').toLowerCase();
    if (stage === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER) return DELIVERY_ADMIN_IN_TRANSIT_LABEL;
    return null;
  }
  const admin = readDeliveryAdminMeta(row);
  const stage = String(admin?.stage || row?.delivery_admin_stage || '').toLowerCase();
  if (repairOnDeliveryAdminVirtualHold(row)) return DELIVERY_ADMIN_HOLD_LABEL;
  if (stage === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER) return DELIVERY_ADMIN_IN_TRANSIT_LABEL;
  return null;
}

export function isCompletedAwaitingDelivery(row) {
  if (/awaiting driver/i.test(String(row?.lifecycle_badge || ''))) return true;
  return repairEligibleForMobileDeliveryQueue(row);
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
