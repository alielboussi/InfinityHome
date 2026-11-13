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
    if (!String(patch.floor2_image_url || '').trim() && String(j.floor2_image_url || '').trim()) {
      next.floor2_image_url = j.floor2_image_url;
    }
    if (!String(patch.image_url || '').trim() && String(j.image_url || '').trim()) {
      next.image_url = j.image_url;
    }
    if (!String(patch.product_image_url || '').trim() && String(j.product_image_url || '').trim()) {
      next.product_image_url = j.product_image_url;
    }
    if (!String(patch.dimensions_display || '').trim() && String(j.dimensions_display || '').trim()) {
      next.dimensions_display = j.dimensions_display;
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
