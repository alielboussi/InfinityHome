import { getFirebaseAuth } from '../shared/firebase';

/** Label for "Dispatched by" on delivery notes (no extra API round-trip). */
export function getProductionDispatcherLabelSync() {
  const user = getFirebaseAuth().currentUser;
  if (!user) return '';
  const display = String(user.displayName || '').trim();
  if (display) return display;
  const email = String(user.email || '').trim();
  if (email) return email.split('@')[0] || email;
  return '';
}
