export const CURRENCIES = ['K', '$'];
export const DEFAULT_CURRENCY = 'K';

export function normalizeCurrency(value) {
  const raw = String(value || DEFAULT_CURRENCY).trim();
  return raw === '$' ? '$' : 'K';
}

export function emptyCurrencyMap() {
  return { K: 0, $: 0 };
}

export function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  const c = normalizeCurrency(currency);
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${c} 0`;
  const decimals = n % 1 !== 0;
  const fmt = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return `${c} ${fmt}`;
}

export function formatBalances(balanceByCurrency) {
  const parts = CURRENCIES
    .filter((currency) => hasBalance(balanceByCurrency?.[currency]))
    .map((currency) => formatMoney(balanceByCurrency[currency], currency));
  return parts.length ? parts.join(' · ') : formatMoney(0, DEFAULT_CURRENCY);
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

export function customerHasBalance(balanceByCurrency) {
  return CURRENCIES.some((currency) => hasBalance(balanceByCurrency?.[currency]));
}

export function formatSaleTitle(sale) {
  const productName = String(sale?.product_name || '').trim();
  if (productName) return productName;
  const description = String(sale?.description || '').trim();
  if (description) return description;
  const notes = String(sale?.notes || '').trim();
  if (notes) return notes;
  return 'Sale';
}
