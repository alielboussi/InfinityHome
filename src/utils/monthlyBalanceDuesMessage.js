import { isFahme } from '../laybyRules';
import { laybyCustomerRowHasLusakaSale } from '../services/whatsappNotify';
import { isExcludedFromMonthlyBalanceDue } from './whatsappCustomerRules';

const BALANCE_THRESHOLD = 1;
const WHATSAPP_TEXT_LIMIT = 4096;
const LUSAKA_TZ = 'Africa/Lusaka';

function normalizeCurrency(raw) {
  const val = String(raw || '').trim().toUpperCase();
  if (val === '$' || val === 'USD') return 'USD';
  if (val === 'K' || val === 'ZMW') return 'K';
  return val || 'K';
}

function formatAmount(amount, currency) {
  const n = Number(amount || 0);
  const decimals = n % 1 !== 0;
  const fmt = Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })
    : '0';
  const label = normalizeCurrency(currency) === 'USD' ? '$' : 'K';
  return `${label} ${fmt}`;
}

function formatReportDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: LUSAKA_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function displayTotalsByCurrency(row) {
  const raw = row?.totalsByCurrency || {};
  if (!isFahme(row?.customerId)) return raw;
  const folded = { total: 0, paid: 0, discount: 0, due: 0 };
  Object.values(raw).forEach((vals) => {
    folded.total += Number(vals?.total || 0);
    folded.paid += Number(vals?.paid || 0);
    folded.discount += Number(vals?.discount || 0);
  });
  folded.due = Math.max(0, folded.total - folded.paid - folded.discount);
  return { USD: folded };
}

function formatCustomerPhone(phone) {
  return String(phone || '').trim();
}

export function formatMonthlyBalanceCustomerBlock(row) {
  const amounts = (row.balances || [])
    .map((entry) => formatAmount(entry.outstanding, entry.currency))
    .join(' · ');
  const phone = formatCustomerPhone(row.phone);
  const line = `• ${row.name} — ${amounts}`;
  if (phone) return `${line} · ${phone}`;
  return line;
}

/** Map Layby Management rows to monthly balance due rows (Kitwe only; Fahme & Basyouni excluded). */
export function laybyRowsToBalanceDueRows(laybyRows = []) {
  const rows = [];
  (laybyRows || []).forEach((row) => {
    const customerName = String(row.customer?.name || '').trim();
    if (!row?.customerId || isExcludedFromMonthlyBalanceDue(row.customerId, customerName)) return;
    if (laybyCustomerRowHasLusakaSale(row)) return;
    const totals = displayTotalsByCurrency(row);
    const balances = Object.entries(totals)
      .map(([currency, vals]) => ({
        currency,
        outstanding: Math.max(0, Number(vals?.due || 0)),
      }))
      .filter((entry) => entry.outstanding >= BALANCE_THRESHOLD);
    if (!balances.length) return;
    const laybyId = row.primaryLayby?.id || row.laybys?.[0]?.id || null;
    rows.push({
      customerId: row.customerId,
      laybyId,
      name: String(row.customer?.name || 'Unknown').trim() || 'Unknown',
      phone: formatCustomerPhone(row.customer?.phone),
      balances,
    });
  });
  rows.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  return rows;
}

function buildMonthlyBalanceFooter(rows) {
  const totals = {};
  rows.forEach((row) => {
    (row.balances || []).forEach((entry) => {
      const currency = normalizeCurrency(entry.currency);
      totals[currency] = (totals[currency] || 0) + Number(entry.outstanding || 0);
    });
  });
  const totalLine = Object.entries(totals)
    .map(([currency, amount]) => formatAmount(amount, currency))
    .join(' · ');
  return `\n\nTotal outstanding: ${totalLine}\nTotal customers: ${rows.length}`;
}

export function buildMonthlyBalanceDueMessages(rows, { reportDate = new Date() } = {}) {
  const dateLabel = formatReportDate(reportDate);
  const header = `📋 *Monthly Balance Due — ${dateLabel}*`;
  const intro = 'Kitwe layby customers with outstanding balances (Fahme & Basyouni excluded):';

  if (!rows.length) {
    return [`${header}\n\n${intro}\n\nNo customers with balance due.`];
  }

  const lines = rows.map((row) => formatMonthlyBalanceCustomerBlock(row));

  const footer = buildMonthlyBalanceFooter(rows);
  const messages = [];
  let buffer = [];

  const emit = (withFooter = false) => {
    if (!buffer.length) return;
    const part = messages.length + 1;
    const title = part === 1 ? header : `${header} (part ${part})`;
    let text = `${title}\n\n${intro}\n\n${buffer.join('\n')}`;
    if (withFooter) text += footer;
    messages.push(text);
    buffer = [];
  };

  for (const line of lines) {
    const part = messages.length + 1;
    const title = part === 1 ? header : `${header} (part ${part})`;
    const trial = `${title}\n\n${intro}\n\n${[...buffer, line].join('\n')}${footer}`;
    if (trial.length > WHATSAPP_TEXT_LIMIT - 20 && buffer.length) {
      emit(false);
    }
    buffer.push(line);
  }

  emit(true);
  return messages;
}
