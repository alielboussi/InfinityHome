/** 30-day months for long-running production timers (not calendar months). */
const SEC_PER_DAY = 86400;
const DAYS_PER_MONTH = 30;

/**
 * Production kiosk elapsed display.
 * Under 24h → HH:MM:SS
 * ≥ 24h → Nd HH:MM:SS
 * ≥ 30d → Nmo Nd HH:MM:SS
 */
export function formatProductionElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const s = totalSec % 60;
  const m = Math.floor((totalSec % 3600) / 60);
  const h = Math.floor((totalSec % SEC_PER_DAY) / 3600);
  const totalDays = Math.floor(totalSec / SEC_PER_DAY);
  const months = Math.floor(totalDays / DAYS_PER_MONTH);
  const days = totalDays % DAYS_PER_MONTH;

  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (months > 0) {
    return `${months}mo ${days}d ${clock}`;
  }
  if (totalDays > 0) {
    return `${totalDays}d ${clock}`;
  }
  const hTotal = Math.floor(totalSec / 3600);
  return `${String(hTotal).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
