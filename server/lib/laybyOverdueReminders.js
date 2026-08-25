const FAHME_CUSTOMER_IDS = new Set([
  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',
  'efb21cad-1a8d-4d64-9487-51e816fcb429',
]);

const BALANCE_THRESHOLD = 1;
const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
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

function formatReportDate(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return '';
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

function daysBetween(startIso, endDate = new Date()) {
  const start = new Date(startIso);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

async function computeLaybyOutstanding(db, laybyId) {
  const { data: linkedSales, error: salesErr } = await db
    .from('sales')
    .select('id, total_amount, discount, currency')
    .eq('layby_id', laybyId);
  if (salesErr) throw salesErr;

  const sales = linkedSales || [];
  const saleIds = sales.map((sale) => sale.id).filter(Boolean);
  if (!saleIds.length) return { outstanding: 0, currency: 'K' };

  const { data: payRows, error: payErr } = await db
    .from('sales_payments')
    .select('sale_id, amount, payment_type')
    .in('sale_id', saleIds);
  if (payErr) throw payErr;

  const paidBySale = (payRows || []).reduce((acc, row) => {
    if (String(row.payment_type || '').toLowerCase() === 'credit') return acc;
    const key = String(row.sale_id);
    acc[key] = (acc[key] || 0) + Number(row.amount || 0);
    return acc;
  }, {});

  let outstanding = 0;
  for (const sale of sales) {
    const net = Number(sale.total_amount || 0);
    const disc = Number(sale.discount || 0);
    const gross = net + disc;
    const salePaid = Number(paidBySale[String(sale.id)] || 0);
    if (disc > 0) {
      outstanding += Math.max(0, gross - salePaid - disc);
    } else {
      outstanding += Math.max(0, net - salePaid);
    }
  }

  const currency = normalizeCurrency(sales[0]?.currency || 'K');
  return {
    outstanding: normalizeBalanceDue(outstanding, currency),
    currency,
  };
}

export function isReminderDue(lastReminderAtIso, now = new Date()) {
  if (!lastReminderAtIso) return true;
  const last = new Date(lastReminderAtIso);
  if (Number.isNaN(last.getTime())) return true;
  return (now.getTime() - last.getTime()) >= REMINDER_INTERVAL_MS;
}

export async function fetchLaybysNeedingOverdueReminder(db, { now = new Date() } = {}) {
  const { data: laybys, error } = await db
    .from('laybys')
    .select('id, customer_id, status, created_at, balance_due_days, balance_due_deadline, last_overdue_reminder_at')
    .eq('status', 'active');
  if (error) throw error;

  const candidates = (laybys || []).filter((row) => {
    if (!row?.id || isFahmeCustomer(row.customer_id)) return false;
    const days = parseBalanceDueDays(row.balance_due_days);
    if (!days) return false;
    const deadlineIso = row.balance_due_deadline || computeBalanceDueDeadline(row.created_at, days);
    if (!deadlineIso) return false;
    return new Date(deadlineIso).getTime() < now.getTime();
  });

  if (!candidates.length) return [];

  const customerIds = Array.from(new Set(candidates.map((row) => String(row.customer_id)).filter(Boolean)));
  const { data: customers, error: custErr } = await db
    .from('customers')
    .select('id, name, phone')
    .in('id', customerIds);
  if (custErr) throw custErr;

  const customerById = new Map((customers || []).map((row) => [String(row.id), row]));
  const rows = [];

  for (const layby of candidates) {
    if (!isReminderDue(layby.last_overdue_reminder_at, now)) continue;

    const { outstanding, currency } = await computeLaybyOutstanding(db, layby.id);
    if (outstanding <= 0) continue;

    const customer = customerById.get(String(layby.customer_id)) || {};
    const deadlineIso = layby.balance_due_deadline
      || computeBalanceDueDeadline(layby.created_at, layby.balance_due_days);
    const daysOverdue = daysBetween(deadlineIso, now);

    rows.push({
      laybyId: layby.id,
      customerId: layby.customer_id,
      customerName: String(customer.name || 'Unknown').trim() || 'Unknown',
      customerPhone: String(customer.phone || '').trim(),
      balanceDue: outstanding,
      currency,
      balanceDueDays: parseBalanceDueDays(layby.balance_due_days),
      balanceDueDeadline: deadlineIso,
      daysOverdue,
    });
  }

  rows.sort((left, right) => left.customerName.localeCompare(right.customerName, undefined, { sensitivity: 'base' }));
  return rows;
}

export function buildLaybyOverdueReminderMessage(row, { reportDate = new Date() } = {}) {
  const dateLabel = formatReportDate(reportDate);
  const deadlineLabel = formatReportDate(row.balanceDueDeadline);
  const lines = [
    '⚠️ *Layby Balance Overdue Reminder*',
    '',
    `📅 Report date: ${dateLabel}`,
    `👤 Customer Name: ${row.customerName}`,
  ];

  if (row.customerPhone) {
    lines.push(`📞 Customer Number: ${row.customerPhone}`);
  }

  lines.push(`⏳ Balance Due: ${formatAmount(row.balanceDue, row.currency)}`);

  if (row.balanceDueDays > 0) {
    lines.push(`⏳ Allowed period: ${row.balanceDueDays} days (deadline ${deadlineLabel})`);
    lines.push(`⏳ Days overdue: ${row.daysOverdue}`);
  }

  lines.push('');
  lines.push('Please follow up with the customer until the balance is fully paid.');

  return lines.join('\n').trim();
}

export function buildLaybyOverdueReminderMessages(rows, options = {}) {
  if (!rows.length) {
    return [`⚠️ *Layby Balance Overdue Reminder*\n\nNo overdue laybys with an allowance period require reminders today.`];
  }

  const messages = [];
  let buffer = [];
  const header = '⚠️ *Layby Balance Overdue Reminders*';

  const flush = (withFooter = false) => {
    if (!buffer.length) return;
    const part = messages.length + 1;
    const title = part === 1 ? header : `${header} (part ${part})`;
    let text = `${title}\n\n${buffer.join('\n\n')}`;
    if (withFooter) {
      text += `\n\nTotal overdue laybys: ${rows.length}`;
    }
    messages.push(text);
    buffer = [];
  };

  for (const row of rows) {
    const block = buildLaybyOverdueReminderMessage(row, options);
    const part = messages.length + 1;
    const title = part === 1 ? header : `${header} (part ${part})`;
    const trial = `${title}\n\n${[...buffer, block].join('\n\n')}\n\nTotal overdue laybys: ${rows.length}`;
    if (trial.length > WHATSAPP_TEXT_LIMIT - 20 && buffer.length) {
      flush(false);
    }
    buffer.push(block);
  }

  flush(true);
  return messages;
}
