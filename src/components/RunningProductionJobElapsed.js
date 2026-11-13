import React, { useEffect, useState } from 'react';
import { formatProductionElapsed } from '../utils/formatProductionElapsed';

export function computeTrackingJobElapsedMs(job, nowMs = Date.now()) {
  const accumulated = Number(job?.accumulated_ms) || 0;
  if (job?.timer_status === 'running' && job?.timer_started_at) {
    const started = new Date(job.timer_started_at).getTime();
    if (Number.isFinite(started)) {
      return accumulated + Math.max(0, nowMs - started);
    }
  }
  const snap = Number(job?.elapsed_ms);
  return Number.isFinite(snap) && snap > 0 ? snap : accumulated;
}

export default function RunningProductionJobElapsed({ job, style }) {
  const jobId = String(job?.production_job_id || job?.id || '');
  const isRunning = job?.timer_status === 'running';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning, jobId]);

  return (
    <span style={style}>
      {formatProductionElapsed(computeTrackingJobElapsedMs(job, now))}
    </span>
  );
}
