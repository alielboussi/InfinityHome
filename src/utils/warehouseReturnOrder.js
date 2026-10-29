export const WAREHOUSE_RETURN_STATUSES = Object.freeze({
  SUBMITTED: 'submitted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SHIPPED: 'shipped',
});

export function formatReturnElapsedDuration(startIso, endIso = null) {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  if (!Number.isFinite(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (!Number.isFinite(end) || end < start) return '—';
  const totalSec = Math.floor((end - start) / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

export function returnOrderElapsedSeconds(row, nowMs = Date.now()) {
  const started = row?.work_started_at || row?.accepted_at;
  if (!started) return null;
  const end = row?.work_completed_at
    ? new Date(row.work_completed_at).getTime()
    : nowMs;
  const startMs = new Date(started).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - startMs) / 1000));
}

export function buildReturnPrintGroupsFromOrder(row) {
  const qty = Math.max(1, Number(row?.quantity) || 1);
  const elapsed = formatReturnElapsedDuration(
    row?.work_started_at || row?.accepted_at,
    row?.work_completed_at,
  );
  return [{
    assembly_name: row?.assembly_name || 'Product',
    units: qty,
    elapsed_display: elapsed,
    lines: [],
  }];
}
