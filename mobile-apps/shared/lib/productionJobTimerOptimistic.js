import { computeJobElapsedMs } from '../components/RunningJobElapsed';

export function mergeJobInList(jobs, jobId, patch) {
  const id = String(jobId || '').trim();
  if (!id || !patch) return jobs || [];
  return (jobs || []).map((j) => {
    const jid = String(j.job_id || j.id || '').trim();
    if (jid !== id) return j;
    const next = { ...j, ...patch };
    if (!patch.manual_material_lines && j.manual_material_lines) {
      next.manual_material_lines = j.manual_material_lines;
    }
    return next;
  });
}

export function optimisticPauseJobPatch(job, nowMs = Date.now()) {
  const accumulated = computeJobElapsedMs(job, nowMs);
  return {
    status: 'paused',
    accumulated_ms: accumulated,
    elapsed_ms: accumulated,
    timer_started_at: null,
    paused_at: new Date(nowMs).toISOString(),
  };
}

export function optimisticResumeJobPatch(nowMs = Date.now()) {
  const nowIso = new Date(nowMs).toISOString();
  return {
    status: 'running',
    timer_started_at: nowIso,
    paused_at: null,
  };
}

export function serverJobPatchFromResponse(payload) {
  const j = payload?.job || payload;
  if (!j || !(j.job_id || j.id)) return null;
  return j;
}

function buildOptimisticUnitsPatch(job, checked_unit_indexes, nowMs = Date.now()) {
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const sorted = [...checked_unit_indexes].sort((a, b) => a - b);
  const patch = {
    checked_unit_indexes: sorted,
    units_checked: sorted.length,
    all_units_checked: sorted.length >= qty,
  };
  const wasReady = job.status === 'ready';
  const firstCheck = sorted.length > 0 && wasReady;
  if (firstCheck) {
    return {
      ...patch,
      status: 'running',
      timer_started_at: new Date(nowMs).toISOString(),
      accumulated_ms: Math.max(0, Number(job.accumulated_ms) || 0),
    };
  }
  if (sorted.length === 0 && (job.status === 'running' || job.status === 'ready')) {
    const accumulated_ms = computeJobElapsedMs(job, nowMs);
    return {
      ...patch,
      status: 'ready',
      accumulated_ms,
      elapsed_ms: accumulated_ms,
      timer_started_at: null,
    };
  }
  return patch;
}

/** Set completed unit count (0..qty) — mirrors server completed_count on upholstery-job-check-unit. */
export function optimisticSetUnitsCompletedPatch(job, completedCount, nowMs = Date.now()) {
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const count = Math.max(0, Math.min(qty, Math.floor(Number(completedCount) || 0)));
  const checked_unit_indexes = count === 0 ? [] : Array.from({ length: count }, (_, i) => i + 1);
  return buildOptimisticUnitsPatch(job, checked_unit_indexes, nowMs);
}
