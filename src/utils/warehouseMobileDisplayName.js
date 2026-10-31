/**
 * "Name in app" from User Access (mobile_display_name), then profile fallbacks.
 * Used on warehouse delivery PDFs, labels, and WhatsApp — not raw email when a name exists.
 */
export function resolveWarehouseMobileDisplayName(user, loginAccessRecord = null) {
  const fromApp = String(
    loginAccessRecord?.mobile_display_name
    || user?.mobile_display_name
    || '',
  ).trim();
  if (fromApp) return fromApp;
  return String(
    loginAccessRecord?.display_name
    || user?.display_name
    || user?.user_metadata?.full_name
    || user?.full_name
    || user?.email
    || '',
  ).trim();
}

/** PDF / print label from a persisted delivery session (no live user object). */
export function deliverySessionSubmittedByName(session, usersById = null) {
  const meta = session?.metadata || {};
  const dispatched = String(meta.dispatched_by_name || '').trim();
  if (dispatched) return dispatched;

  const stored = String(session?.created_by_name || meta.created_by_name || '').trim();
  if (stored) return stored;

  const id = session?.created_by_id;
  if (id != null && usersById) {
    const fromMap = usersById.get(Number(id)) || usersById.get(String(id));
    if (fromMap) return fromMap;
  }

  const email = String(session?.created_by_email || meta.created_by_email || '').trim();
  return email || '—';
}
