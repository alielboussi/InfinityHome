import { formatProductionElapsed as formatElapsed } from '../shared/lib/formatProductionElapsed';
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
