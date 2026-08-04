/**
 * Optional live refresh via Supabase Realtime or Firestore onSnapshot (when USE_FIREBASE=true).
 * Off unless REACT_APP_ENABLE_REALTIME=1 — some networks block wss://.
 */
export function isRealtimeEnabled() {
  return String(process.env.REACT_APP_ENABLE_REALTIME || '').trim() === '1';
}
