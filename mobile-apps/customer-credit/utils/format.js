const CURRENCY = 'K';

export function formatMoney(amount, currency = CURRENCY) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} 0`;
  const decimals = n % 1 !== 0;
  const fmt = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return `${currency} ${fmt}`;
}

export function parseMoney(text) {
  const n = Number(String(text || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysBetween(startIso, endDate = new Date()) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function addDays(isoDate, days) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days) || 0);
  return d.toISOString();
}

export const BALANCE_EPSILON = 0.01;

export function hasBalance(balance) {
  return Number(balance) > BALANCE_EPSILON;
}
