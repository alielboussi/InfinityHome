import { resolvePosSaleDate } from './laybyRollup';

export function saleTimestampMs(sale) {
  const raw = resolvePosSaleDate(sale);
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Inclusive range using POS sale date (sale_date, else created_at). */
export function saleMatchesRange(sale, startMs, endMs) {
  const t = saleTimestampMs(sale);
  if (t == null) return false;
  if (startMs != null && t < startMs) return false;
  if (endMs != null && t > endMs) return false;
  return true;
}

export function rangeBoundsForDashboard(range, customStart, customEnd) {
  const now = new Date();
  const endMs = now.getTime();
  let startMs = null;

  if (range === 'custom') {
    if (customStart) {
      const s = new Date(`${customStart}T00:00:00`);
      if (!Number.isNaN(s.getTime())) startMs = s.getTime();
    }
    const endDate = customEnd || customStart;
    let customEndMs = endMs;
    if (endDate) {
      const e = new Date(`${endDate}T23:59:59.999`);
      if (!Number.isNaN(e.getTime())) customEndMs = e.getTime();
    }
    return { startMs, endMs: customEndMs };
  }

  switch (range) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      startMs = d.getTime();
      break;
    }
    case '7d':
      startMs = endMs - 7 * 86400000;
      break;
    case '30d':
      startMs = endMs - 30 * 86400000;
      break;
    case 'month':
      startMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      break;
    case 'year':
      startMs = new Date(now.getFullYear(), 0, 1).getTime();
      break;
    case 'all':
    default:
      startMs = null;
      break;
  }
  return { startMs, endMs };
}

/** created_at lower bound for server query (buffer before range start). */
export function createdAtQueryLowerBound(startMs) {
  if (startMs == null) return null;
  return new Date(startMs - 2 * 86400000).toISOString();
}
