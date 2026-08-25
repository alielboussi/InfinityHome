export function parseBalanceDueDays(value) {
  const n = Math.floor(Number(String(value ?? '').trim()));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function computeBalanceDueDeadline(createdAtIso, days) {
  const daysNum = parseBalanceDueDays(days);
  if (!daysNum) return null;
  const start = new Date(createdAtIso || new Date().toISOString());
  if (Number.isNaN(start.getTime())) return null;
  const deadline = new Date(start.getTime());
  deadline.setUTCDate(deadline.getUTCDate() + daysNum);
  return deadline.toISOString();
}
