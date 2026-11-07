import { useEffect, useState } from 'react';
import { Text } from 'react-native';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function computeJobElapsedMs(job, nowMs = Date.now()) {
  const base = Number(job?.elapsed_ms) ?? Number(job?.accumulated_ms) || 0;
  const running = job?.status === 'running';
  if (!running || !job?.timer_started_at) return base;
  const started = new Date(job.timer_started_at).getTime();
  if (!Number.isFinite(started)) return base;
  return base + Math.max(0, nowMs - started);
}

/** Per-card timer — avoids re-rendering entire job lists every second. */
export default function RunningJobElapsed({ job, style }) {
  const jobId = String(job?.job_id || job?.id || '');
  const isRunning = job?.status === 'running';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning, jobId]);

  return <Text style={style}>{formatElapsed(computeJobElapsedMs(job, now))}</Text>;
}
