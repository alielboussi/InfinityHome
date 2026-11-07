import { useEffect, useState } from 'react';
import { Text } from 'react-native';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function computeRepairElapsedMs(row, nowMs = Date.now()) {
  let ms = Number(row?.elapsed_ms) || Number(row?.accumulated_ms) || 0;
  if (row?.timer_status === 'running' && row?.timer_started_at) {
    const started = new Date(row.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

export default function RunningRepairElapsed({ row, style }) {
  const isRunning = row?.timer_status === 'running';
  const rowId = String(row?.id || '');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning, rowId]);

  return <Text style={style}>{formatElapsed(computeRepairElapsedMs(row, now))}</Text>;
}
