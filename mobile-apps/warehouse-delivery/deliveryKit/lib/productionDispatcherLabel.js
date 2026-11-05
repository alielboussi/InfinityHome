import { getFirebaseAuth } from '../shared/firebase';

/** Set when login access is verified (mobile_display_name from User Access). */
let cachedAppDisplayName = '';

export function setProductionAppDisplayName(name) {
  cachedAppDisplayName = String(name || '').trim();
}

/** Label for "Dispatched by" on delivery notes (no extra API round-trip). */
export function getProductionDispatcherLabelSync() {
  if (cachedAppDisplayName) return cachedAppDisplayName;
  const user = getFirebaseAuth().currentUser;
  if (!user) return '';
  const display = String(user.displayName || '').trim();
  if (display) return display;
  return '';
}
