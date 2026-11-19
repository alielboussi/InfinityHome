import { formatProductionElapsed as formatElapsed } from '../lib/formatProductionElapsed';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

export function computeRepairElapsedMs(row, nowMs = Date.now()) {
  let ms = Number(row?.elapsed_ms) || Number(row?.accumulated_ms) || 0;
  if (row?.timer_status === 'running' && row?.timer_started_at) {
    const started = new Date(row.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

const tickerListeners = new Set();
let tickerId = null;

function emitRepairElapsedTick(nowMs) {
  for (const fn of tickerListeners) {
    try {
      fn(nowMs);
    } catch {
      /* ignore listener errors */
    }
  }
}

function ensureRepairElapsedTicker() {
  if (tickerId != null) return;
  tickerId = setInterval(() => emitRepairElapsedTick(Date.now()), 1000);
}

function stopRepairElapsedTickerIfIdle() {
  if (tickerListeners.size > 0 || tickerId == null) return;
  clearInterval(tickerId);
  tickerId = null;
}

function subscribeRepairElapsedTick(listener) {
  tickerListeners.add(listener);
  ensureRepairElapsedTicker();
  return () => {
    tickerListeners.delete(listener);
    stopRepairElapsedTickerIfIdle();
  };
}

export default function RunningRepairElapsed({ row, style }) {
  const isRunning = row?.timer_status === 'running';
  const rowId = String(row?.id || '');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return undefined;
    return subscribeRepairElapsedTick(setNow);
  }, [isRunning, rowId]);

  return <Text style={style}>{formatElapsed(computeRepairElapsedMs(row, now))}</Text>;
}
