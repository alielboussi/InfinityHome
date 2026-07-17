/**
 * Supabase Realtime (WebSocket) is optional. Some networks block wss:// and
 * produce console timeouts. Live refresh is off unless explicitly enabled.
 *
 * Set REACT_APP_ENABLE_REALTIME=1 in env to turn on postgres_changes subscriptions.
 */
export function isRealtimeEnabled() {
  return String(process.env.REACT_APP_ENABLE_REALTIME || '').trim() === '1';
}
