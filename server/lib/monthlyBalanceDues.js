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

async function trySelectBySaleIds(supabase, saleIds, view, columns) {
  try {
    const { data, error } = await supabase
      .from(view)
      .select(columns)
      .in('sale_id', saleIds);
    if (error) return { ok: false, data: [] };
    return { ok: true, data: data || [] };
  } catch {
    return { ok: false, data: [] };
  }
}

async function computeTotalsForCustomers(supabase, customerIds) {
  const ids = Array.from(new Set((customerIds || []).map((id) => String(id)).filter(Boolean)));
  if (!ids.length) return {};

  const [{ data: salesRows, error: salesErr }, { data: laybyRows, error: laybyErr }] = await Promise.all([
    supabase
      .from('sales')
      .select('id, customer_id, currency, total_amount, discount, layby_id')
      .in('customer_id', ids),
    supabase
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
    const { data: byLayby, error: linkedErr } = await supabase
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

  let totalsRows = [];
  let totalsRes = await trySelectBySaleIds(
    supabase,
    saleIds,
    'v_sales_pdf_totals',
    'sale_id, currency, subtotal_before_discount, discount_amount, total_due, paid_amount, outstanding_amount',
  );
  if (totalsRes.ok) totalsRows = totalsRes.data;
  if (!totalsRows.length) {
    totalsRes = await trySelectBySaleIds(
      supabase,
      saleIds,
      'v_sales_financials',
      'sale_id, currency, subtotal_before_discount, discount_amount, total_due, paid_amount, outstanding_amount',
    );
    if (totalsRes.ok) totalsRows = totalsRes.data;
  }

  const saleMetaById = new Map();
  normalizedSales.forEach((sale) => {
    saleMetaById.set(String(sale.id), {
      currency: sale.currency || null,
      total_amount: Number(sale.total_amount || 0),
      sale_discount: Number(sale.discount || 0),
      customer_id: sale.customer_id || null,
    });
  });

  (totalsRows || []).forEach((row) => {
    const key = String(row.sale_id);
    const prev = saleMetaById.get(key) || {};
    saleMetaById.set(key, {
      ...prev,
      currency: row.currency || prev.currency || null,
      subtotal_before_discount: Number(row.subtotal_before_discount || 0),
      sale_discount: Number(row.discount_amount || prev.sale_discount || 0),
      total_due: Number(row.total_due || 0),
      outstanding_amount: Number(
        row.outstanding_amount ?? Math.max(0, Number(row.total_due || 0) - Number(row.paid_amount || 0)),
      ),
    });
  });

  const { data: payRows, error: payErr } = await supabase
    .from('sales_payments')
    .select('sale_id, amount, discount_amount, currency')
    .in('sale_id', saleIds);
  if (payErr) throw payErr;

  const paymentsByCustomerCurrency = new Map();
  (payRows || []).forEach((payment) => {
    const saleMeta = saleMetaById.get(String(payment.sale_id)) || {};
    const customerId = saleMeta.customer_id || null;
    if (!customerId) return;
    const code = normalizeCurrency(payment.currency || saleMeta.currency || 'K');
    const key = `${customerId}|${code}`;
    const prev = paymentsByCustomerCurrency.get(key) || { paid: 0, discount: 0 };
    prev.paid += Number(payment.amount || 0);
    prev.discount += Number(payment.discount_amount || 0);
    paymentsByCustomerCurrency.set(key, prev);
  });

  const totals = {};
  normalizedSales.forEach((sale) => {
    const customerId = String(sale.customer_id || '');
    if (!customerId) return;
    const fin = saleMetaById.get(String(sale.id)) || {};
    const code = normalizeCurrency(fin.currency || sale.currency || 'K');

    if (!totals[customerId]) totals[customerId] = {};
    if (!totals[customerId][code]) {
      totals[customerId][code] = { total: 0, paid: 0, discount: 0, outstanding: 0, _saleDiscount: 0 };
    }

    const subtotal = Number(fin.subtotal_before_discount || 0);
    const saleDiscount = Number(fin.sale_discount || 0);
    const netTotal = subtotal > 0 ? subtotal : Math.max(0, Number(fin.total_amount || 0) + saleDiscount);
    totals[customerId][code].total += netTotal;
    totals[customerId][code]._saleDiscount += saleDiscount;
  });

  Object.keys(totals).forEach((customerId) => {
    Object.keys(totals[customerId]).forEach((code) => {
      const agg = totals[customerId][code];
      const payKey = `${customerId}|${code}`;
      const payAgg = paymentsByCustomerCurrency.get(payKey) || { paid: 0, discount: 0 };
      const saleDiscount = Number(agg._saleDiscount || 0);
      const paid = Number(payAgg.paid || 0);
      const payDiscount = Number(payAgg.discount || 0);
      const totalDiscount = saleDiscount + payDiscount;
      const outstanding = Math.max(0, Number(agg.total || 0) - saleDiscount - paid - payDiscount);

      totals[customerId][code] = {
        total: Number(agg.total || 0),
        paid,
        discount: totalDiscount,
        outstanding,
      };
    });
  });

  return totals;
}

export async function fetchCustomersWithBalanceDue(supabase) {
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name, currency')
    .order('name', { ascending: true });
  if (custErr) throw custErr;

  const eligible = (customers || []).filter((row) => row?.id && !isFahmeCustomer(row.id));
  if (!eligible.length) return [];

  const totalsByCustomer = await computeTotalsForCustomers(supabase, eligible.map((row) => row.id));
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

  const footer = `\n\nTotal customers: ${rows.length}`;
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
