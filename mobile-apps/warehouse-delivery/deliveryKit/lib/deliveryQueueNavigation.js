/** After repair/order queue signature, return to the matching dashboard screen. */
export function deliveryQueueReturnRoute(queueKind) {
  if (queueKind === 'repair' || queueKind === 'order') return 'DeliveryUnifiedQueue';
  return 'KitweSendHome';
}
