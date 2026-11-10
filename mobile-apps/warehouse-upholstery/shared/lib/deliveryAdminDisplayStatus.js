/** Workshop + delivery app — completed work waiting for Delivery app driver. */

export function isCompletedAwaitingDelivery(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status !== 'completed') return false;
  const stage = String(row?.metadata?.delivery_admin?.stage || row?.delivery_admin_stage || '').toLowerCase();
  if (stage === 'awaiting_driver') return true;
  if (row?.metadata?.ready_for_delivery_app === true) return true;
  if (row?.ready_for_delivery_app === true) return true;
  if (stage === 'collected_by_driver' || stage === 'delivery_completed') return false;
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.floor1_awaiting_hassan || meta.floor2_repair_staged_at || meta.kitwe_restored_at) return false;
  if (meta.customer_fulfilled_at) return false;
  return true;
}

export function isJobAwaitingDelivery(job) {
  if (String(job?.status || '').toLowerCase() !== 'completed') return false;
  const stage = String(job?.metadata?.delivery_admin?.stage || '').toLowerCase();
  return stage === 'awaiting_driver' || job?.metadata?.ready_for_delivery_app === true;
}
