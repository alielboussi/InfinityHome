/** Freeze production timer at current displayed elapsed (ms). */
export function snapshotQuoteOrderElapsedMs(quote, { tick = Date.now() } = {}) {
  const accumulated = Math.max(0, Number(quote?.accumulated_ms) || 0);
  const paused = String(quote?.timer_status || '').toLowerCase() === 'paused' || Boolean(quote?.run_paused_at);
  const startedAt = quote?.run_started_at || quote?.accepted_at;
  if (paused || !startedAt) return accumulated;
  const running = Math.max(0, tick - new Date(startedAt).getTime());
  return accumulated + running;
}

export function applyQuoteOrderTimerFrozenPatch(quote, { tick = Date.now() } = {}) {
  const accumulated_ms = snapshotQuoteOrderElapsedMs(quote, { tick });
  const now = new Date().toISOString();
  return {
    ...quote,
    timer_status: 'paused',
    run_paused_at: now,
    run_started_at: null,
    accumulated_ms,
  };
}

export function isQuoteOrderFullyCompleteLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return false;
  return list.every((line) => {
    const remaining = Number(line?.production_remaining_qty);
    if (Number.isFinite(remaining)) return remaining <= 0;
    const ordered = Math.max(
      Number(line?.ordered_qty) || Number(line?.quantity) || 1,
      0,
    );
    const done = Math.max(Number(line?.production_completed_qty) || 0, 0);
    return ordered - done <= 0;
  });
}