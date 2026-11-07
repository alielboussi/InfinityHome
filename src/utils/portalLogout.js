import { cacheClear } from './staleCache';

/** Clear portal session and return to login (used from AppChrome banner). */
export function performPortalLogout(navigate) {
  try {
    sessionStorage.removeItem('bestrest:tabAuthed:v1');
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('user');
  } catch {
    /* ignore */
  }
  try {
    cacheClear('allsales:list:v3');
  } catch {
    /* ignore */
  }
  try {
    cacheClear('dash:recentQuotes:v1');
  } catch {
    /* ignore */
  }
  try {
    cacheClear('dash:recentConverted:v1');
  } catch {
    /* ignore */
  }
  if (typeof navigate === 'function') {
    navigate('/login', { replace: true });
  } else if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
}
