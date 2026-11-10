/** Workshop + delivery app — completed work waiting for Delivery app driver. */

function parseMeta(raw) {
  if (!raw || typeof raw === 'object') return raw && typeof raw === 'object' ? raw : {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function legacyFloor1Complete(meta, stage) {
  if (stage === 'awaiting_driver' || meta.ready_for_delivery_app === true) return false;
  return meta.floor1_awaiting_hassan === true && Boolean(meta.factory_stock_added_at);
}

function legacyFloor2Only(meta, stage) {
  if (stage === 'awaiting_driver' || meta.ready_for_delivery_app === true) return false;
  return Boolean(meta.floor2_repair_staged_at);
}

export function isCompletedAwaitingDelivery(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status !== 'completed') return false;
  const meta = parseMeta(row?.metadata);
  const stage = String(meta.delivery_admin?.stage || row?.delivery_admin_stage || '').toLowerCase();
  if (stage === 'awaiting_driver') return true;
  if (meta.ready_for_delivery_app === true) return true;
  if (row?.ready_for_delivery_app === true) return true;
  if (stage === 'collected_by_driver' || stage === 'delivery_completed') return false;
  if (meta.customer_fulfilled_at || meta.kitwe_restored_at || meta.in_transit_to_kitwe_at) return false;
  if (legacyFloor2Only(meta, stage)) return false;
  if (legacyFloor1Complete(meta, stage)) return false;
  return true;
}

export function isJobAwaitingDelivery(job) {
  if (String(job?.status || '').toLowerCase() !== 'completed') return false;
  const stage = String(job?.metadata?.delivery_admin?.stage || '').toLowerCase();
  return stage === 'awaiting_driver' || job?.metadata?.ready_for_delivery_app === true;
}
