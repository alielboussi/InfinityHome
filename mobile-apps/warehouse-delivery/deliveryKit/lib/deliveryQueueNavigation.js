/** After repair/order queue signature, return to the matching dashboard screen. */
export function deliveryQueueReturnRoute(queueKind) {
  if (queueKind === 'repair') return 'DeliveryRepairQueue';
  if (queueKind === 'order') return 'DeliveryOrderQueue';
  return 'KitweSendHome';
}
