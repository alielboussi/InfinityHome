/**
 * Optional live refresh via Firestore onSnapshot.
 * Off unless REACT_APP_ENABLE_REALTIME=1 — some networks block wss://.
 */
export function isRealtimeEnabled() {
  return String(process.env.REACT_APP_ENABLE_REALTIME || '').trim() === '1';
}
