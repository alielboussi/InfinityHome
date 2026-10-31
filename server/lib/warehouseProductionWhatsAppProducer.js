/** "Name in app" from User access (mobile_display_name), then profile fallbacks. */
export function resolveWarehouseProductionWhatsAppProducerName(user, loginAccessRecord) {
  const fromApp = String(loginAccessRecord?.mobile_display_name || '').trim();
  if (fromApp) return fromApp;
  return String(
    loginAccessRecord?.display_name
    || user?.user_metadata?.full_name
    || user?.full_name
    || user?.display_name
    || user?.email
    || '',
  ).trim();
}
