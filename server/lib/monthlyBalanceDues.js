import { aggregateCustomerTotals, buildFinancialsMap } from '../../src/utils/saleFinancials.js';

const FAHME_CUSTOMER_IDS = new Set([
  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',
  'efb21cad-1a8d-4d64-9487-51e816fcb429',
]);

const BALANCE_THRESHOLD = 1;
const WHATSAPP_TEXT_LIMIT = 4096;
const LUSAKA_TZ = 'Africa/Lusaka';

function isFahmeCustomer(customerId) {
  if (!customerId) return false;
  return FAHME_CUSTOMER_IDS.has(String(customerId).trim().toLowerCase());
}

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

function normalizeBalanceDue(balanceDue, currency = 'K') {
  const due = Math.max(0, Number(balanceDue || 0));
  if (due < BALANCE_THRESHOLD) return 0;
  return due;
}

async function computeTotalsForCustomers(db, customerIds) {
  const ids = Array.from(new Set((customerIds || []).map((id) => String(id)).filter(Boolean)));
  if (!ids.length) return {};

  const [{ data: salesRows, error: salesErr }, { data: laybyRows, error: laybyErr }] = await Promise.all([
    db
      .from('sales')
      .select('id, customer_id, currency, total_amount, discount, layby_id')
      .in('customer_id', ids),
    db
      .from('laybys')
      .select('id, customer_id')
      .in('customer_id', ids),
  ]);
  if (salesErr) throw salesErr;
  if (laybyErr) throw laybyErr;

  const laybyIds = (laybyRows || []).map((row) => row.id).filter((value) => value != null);
  const laybyCustomerById = new Map((laybyRows || []).map((row) => [String(row.id), String(row.customer_id)]));

  let linkedSales = [];
  if (laybyIds.length) {
    const { data: byLayby, error: linkedErr } = await db
      .from('sales')
      .select('id, customer_id, currency, total_amount, discount, layby_id')
      .in('layby_id', laybyIds);
    if (linkedErr) throw linkedErr;
    linkedSales = byLayby || [];
  }

  const salesById = new Map();
  [...(salesRows || []), ...linkedSales].forEach((sale) => {
    if (!sale?.id) return;
    const customerId = sale.customer_id || laybyCustomerById.get(String(sale.layby_id || '')) || null;
    if (!customerId || !ids.includes(String(customerId))) return;
    salesById.set(String(sale.id), { ...sale, customer_id: customerId });
  });

  const normalizedSales = [...salesById.values()];
  const saleIds = normalizedSales.map((sale) => sale.id).filter((value) => value != null);
  if (!saleIds.length) return {};

  const [itemsRes, payRes] = await Promise.all([
    db
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds),
    db
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, currency')
      .in('sale_id', saleIds),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  const payRows = payRes.error ? [] : (payRes.data || []);

  const finMap = buildFinancialsMap(normalizedSales, itemsRes.data || [], payRows);
  return aggregateCustomerTotals(normalizedSales, finMap, payRows);
}

export async function fetchCustomersWithBalanceDue(db) {
  const { data: customers, error: custErr } = await db
    .from('customers')
    .select('id, name, currency')
    .order('name', { ascending: true });
  if (custErr) throw custErr;

  const eligible = (customers || []).filter((row) => row?.id && !isFahmeCustomer(row.id));
  if (!eligible.length) return [];

  const totalsByCustomer = await computeTotalsForCustomers(db, eligible.map((row) => row.id));
  const nameById = new Map(eligible.map((row) => [String(row.id), String(row.name || 'Unknown').trim() || 'Unknown']));

  const rows = [];
  Object.entries(totalsByCustomer).forEach(([customerId, byCurrency]) => {
    const balances = Object.entries(byCurrency || {})
      .map(([currency, agg]) => ({
        currency,
        outstanding: normalizeBalanceDue(agg?.outstanding, currency),
      }))
      .filter((entry) => entry.outstanding > 0);

    if (!balances.length) return;
    rows.push({
      customerId,
      name: nameById.get(String(customerId)) || 'Unknown',
      balances,
      totalOutstanding: balances.reduce((sum, entry) => sum + entry.outstanding, 0),
    });
  });

  rows.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  return rows;
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
  const intro = 'Customers with outstanding balances (Fahme accounts excluded):';

  if (!rows.length) {
    return [`${header}\n\n${intro}\n\nNo customers with balance due.`];
  }

  const lines = rows.map((row) => {
    const amounts = row.balances
      .map((entry) => formatAmount(entry.outstanding, entry.currency))
      .join(' · ');
    return `• ${row.name} — ${amounts}`;
  });

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

export function isScheduledMonthlyRunDay(date = new Date()) {
  try {
    const day = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: LUSAKA_TZ,
      day: 'numeric',
    }).format(date));
    return day === 30;
  } catch {
    return date.getUTCDate() === 30;
  }
}
