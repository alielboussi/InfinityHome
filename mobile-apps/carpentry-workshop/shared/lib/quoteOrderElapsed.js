/**
 * Quote-order production timer (mobile kiosk).
 * Keep in sync with src/utils/quoteOrderElapsed.js
 */

import { formatProductionElapsed } from './formatProductionElapsed';

export function computeQuoteOrderElapsedMs(order, nowMs = Date.now()) {
  const completedAt = order?.completed_at || order?.run_completed_at;
  const acceptedAt = order?.accepted_at;
  const runStartedAt = order?.run_started_at;
  const accumulated = Math.max(0, Number(order.accumulated_ms) || 0);
  const isPaused = String(order.timer_status || '').toLowerCase() === 'paused' || Boolean(order.run_paused_at);

  if (completedAt) {
    const startRaw = acceptedAt || runStartedAt;
    if (!startRaw) return accumulated;
    const startMs = new Date(startRaw).getTime();
    const endMs = new Date(completedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      return Math.max(0, endMs - startMs);
    }
    return accumulated;
  }

  if (!acceptedAt && !runStartedAt) return 0;

  if (isPaused) return accumulated;

  if (runStartedAt) {
    const started = new Date(runStartedAt).getTime();
    if (Number.isFinite(started)) {
      return accumulated + Math.max(0, nowMs - started);
    }
  }

  if (accumulated > 0) return accumulated;

  const fallbackStart = acceptedAt || runStartedAt;
  const fallbackMs = new Date(fallbackStart).getTime();
  if (!Number.isFinite(fallbackMs)) return 0;
  return Math.max(0, nowMs - fallbackMs);
}

export function formatQuoteOrderTimer(order, nowMs = Date.now()) {
  if (!(order?.accepted_at || order?.run_started_at)) return '00:00:00';
  return formatProductionElapsed(computeQuoteOrderElapsedMs(order, nowMs));
}
