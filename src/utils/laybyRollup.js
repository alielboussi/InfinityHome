import { normalizeLaybyStatement } from './laybyStatementNormalize.js';
import { computeQuotationTotals, resolveQuoteVatApply } from './quotationDisplay.js';

const normalizeCurrency = (cur) => ((cur === '$' || cur === 'USD') ? 'USD' : 'K');

const toNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

// Match layby PDF display: ZMW amounts are whole kwacha; USD keeps cents.
const roundLaybyMoney = (value, currency = 'K') => {
  const n = toNumber(value);
  if (currency === 'USD') return Math.round(n * 100) / 100;
  return Math.round(n);
};

const toSortTime = (sale) => {
  const raw = sale?.sale_date || sale?.created_at || 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const LAYBY_ROWS_CACHE_KEY = 'layby-mgmt:rows:v16';

export function buildLaybySaleFinancials(statement) {
  const normalized = normalizeLaybyStatement(statement || {});
  const sales = Array.isArray(normalized?.sales) ? normalized.sales : [];
  const items = Array.isArray(normalized?.items) ? normalized.items : [];
  const payments = Array.isArray(normalized?.payments) ? normalized.payments : [];

  const itemsSumBySale = new Map();
  items.forEach((item) => {
    const saleKey = String(item?.sale_id || '').trim();
    if (!saleKey) return;
    const lineAmount = toNumber(item?.unit_price) * toNumber(item?.quantity);
    itemsSumBySale.set(saleKey, toNumber(itemsSumBySale.get(saleKey)) + lineAmount);
  });

  const paymentsBySale = new Map();
  payments.forEach((payment) => {
    const saleKey = String(payment?.sale_id || '').trim();
    if (!saleKey) return;
    const previous = paymentsBySale.get(saleKey) || { paid: 0, paymentDiscount: 0, currency: null };
    paymentsBySale.set(saleKey, {
      paid: previous.paid + toNumber(payment?.amount),
      paymentDiscount: previous.paymentDiscount + toNumber(payment?.discount_amount),
      currency: normalizeCurrency(payment?.currency || previous.currency || 'K'),
    });
  });

  return sales
    .map((sale, index) => {
      const rawSaleId = sale?.sale_id ?? sale?.id ?? null;
      const saleKey = String(rawSaleId || '').trim();
      if (!saleKey) return null;

      const paymentAgg = paymentsBySale.get(saleKey) || { paid: 0, paymentDiscount: 0, currency: null };
      const itemSubtotal = toNumber(itemsSumBySale.get(saleKey));
      const saleDiscountRaw = toNumber(sale?.discount_amount);
      const reportedTotal = Math.max(0, toNumber(sale?.total_due || sale?.total_amount));

      let subtotalBeforeDiscount = itemSubtotal > 0 ? itemSubtotal : toNumber(sale?.subtotal_before_discount);
      if (subtotalBeforeDiscount <= 0) {
        const totalDue = toNumber(sale?.total_due);
        subtotalBeforeDiscount = totalDue > 0 ? totalDue + saleDiscountRaw : 0;
      }

      const saleDiscount = Math.min(Math.max(0, saleDiscountRaw), Math.max(0, subtotalBeforeDiscount));
      const derivedNet = Math.max(0, subtotalBeforeDiscount - saleDiscount);
      const vatApply = Boolean(sale?.vat_apply)
        || resolveQuoteVatApply(sale, subtotalBeforeDiscount, saleDiscount);
      const vatRate = Number(sale?.vat_rate) > 0 ? Number(sale?.vat_rate) : 0.16;
      const derivedTotal = vatApply
        ? computeQuotationTotals({
            subtotal: subtotalBeforeDiscount,
            discount: saleDiscount,
            vatApply: true,
            vatRate,
          }).total
        : derivedNet;

      let total = derivedTotal;
      if (reportedTotal > 0) {
        if (Math.abs(reportedTotal - derivedTotal) < 1) {
          total = reportedTotal;
        } else if (vatApply && reportedTotal < derivedTotal) {
          total = derivedTotal;
        } else if (!vatApply || reportedTotal >= derivedTotal) {
          total = reportedTotal;
        }
      }
      if (total > 0 && subtotalBeforeDiscount < total + saleDiscount) {
        subtotalBeforeDiscount = total + saleDiscount;
      }
      const paid = toNumber(paymentAgg.paid);
      const paymentDiscount = toNumber(paymentAgg.paymentDiscount);

      return {
        saleId: rawSaleId,
        saleKey,
        currency: normalizeCurrency(sale?.currency || paymentAgg.currency || 'K'),
        subtotalBeforeDiscount,
        saleDiscount,
        total,
        paid,
        paymentDiscount,
        discount: saleDiscount + paymentDiscount,
        due: Math.max(0, total - paid - paymentDiscount),
        saleDate: sale?.sale_date || null,
        createdAt: sale?.created_at || null,
        sortTime: toSortTime(sale),
        sortIndex: index,
      };
    })
    .filter(Boolean);
}

export function computeLaybyTotalsByCurrency(statement) {
  const totals = {};
  buildLaybySaleFinancials(statement).forEach((sale) => {
    const code = sale.currency || 'K';
    if (!totals[code]) totals[code] = { total: 0, paid: 0, discount: 0, due: 0 };
    totals[code].total += toNumber(sale.total);
    totals[code].paid += toNumber(sale.paid);
    totals[code].discount += toNumber(sale.discount);
    totals[code].due += toNumber(sale.due);
  });
  return totals;
}

// PDF-aligned pooled settlement: sum sale totals, subtract all payments for the currency.
// Sale discounts are already netted into each sale total; payment discounts are subtracted separately.
export function computePooledLaybyTotalsByCurrency(statement) {
  const normalized = normalizeLaybyStatement(statement || {});
  const saleFinancials = buildLaybySaleFinancials(normalized);
  const totals = {};
  const saleDiscountByCurrency = {};

  saleFinancials.forEach((sale) => {
    const code = sale.currency || 'K';
    if (!totals[code]) totals[code] = { total: 0, paid: 0, discount: 0, due: 0 };
    totals[code].total += toNumber(sale.total);
    saleDiscountByCurrency[code] = toNumber(saleDiscountByCurrency[code]) + toNumber(sale.saleDiscount);
  });

  const paymentDiscountByCurrency = {};
  (normalized.payments || []).forEach((payment) => {
    const raw = String(payment?.currency || '').trim().toUpperCase();
    const code = (raw === '$' || raw === 'USD') ? 'USD' : 'K';
    if (!totals[code]) totals[code] = { total: 0, paid: 0, discount: 0, due: 0 };
    totals[code].paid += toNumber(payment?.amount);
    paymentDiscountByCurrency[code] = toNumber(paymentDiscountByCurrency[code]) + toNumber(payment?.discount_amount);
  });

  Object.entries(totals).forEach(([code, bucket]) => {
    const saleDiscount = toNumber(saleDiscountByCurrency[code]);
    const paymentDiscount = toNumber(paymentDiscountByCurrency[code]);
    bucket.total = roundLaybyMoney(bucket.total, code);
    bucket.paid = roundLaybyMoney(bucket.paid, code);
    bucket.discount = roundLaybyMoney(saleDiscount + paymentDiscount, code);
    bucket.due = Math.max(0, roundLaybyMoney(bucket.total - bucket.paid - paymentDiscount, code));
  });

  return totals;
}

export function sumLaybyCustomerTotalsByCurrency(rows) {
  const out = {};
  (rows || []).forEach((row) => {
    Object.entries(row?.totalsByCurrency || {}).forEach(([code, vals]) => {
      if (!out[code]) out[code] = { total: 0, paid: 0, discount: 0, due: 0 };
      out[code].total += toNumber(vals.total);
      out[code].paid += toNumber(vals.paid);
      out[code].discount += toNumber(vals.discount);
      out[code].due += toNumber(vals.due);
    });
  });
  return out;
}

export function formatLaybyCurrency(amount, currency = 'K') {
  const n = toNumber(amount);
  const formatted = n % 1 === 0
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawCode = String(currency || '').trim();
  const code = rawCode.toUpperCase();
  const label = (code === 'USD' || rawCode === '$') ? '$' : (rawCode || 'K');
  return `${label} ${formatted}`;
}

export function formatLaybyTotalsLine(totalsByCurrency, field) {
  const entries = Object.entries(totalsByCurrency || {});
  if (!entries.length) return '—';
  return entries.map(([code, vals]) => formatLaybyCurrency(vals?.[field] || 0, code)).join(' | ');
}

export function buildOutstandingLaybySales(statement) {
  return buildLaybySaleFinancials(statement)
    .filter((sale) => toNumber(sale.due) > 0)
    .sort((left, right) => {
      if (left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
      const bySaleId = String(left.saleKey || '').localeCompare(String(right.saleKey || ''), undefined, { numeric: true, sensitivity: 'base' });
      if (bySaleId !== 0) return bySaleId;
      return left.sortIndex - right.sortIndex;
    });
}

export function filterStatementToOutstandingSales(statement) {
  const normalized = normalizeLaybyStatement(statement || {});
  const outstandingSaleIds = new Set(
    buildLaybySaleFinancials(normalized)
      .filter((sale) => toNumber(sale.due) > 0)
      .map((sale) => String(sale.saleId || '').trim())
      .filter(Boolean)
  );

  if (!outstandingSaleIds.size) {
    return { sales: [], items: [], payments: [] };
  }

  return {
    sales: (normalized.sales || []).filter((sale) => outstandingSaleIds.has(String(sale?.sale_id ?? sale?.id ?? '').trim())),
    items: (normalized.items || []).filter((item) => outstandingSaleIds.has(String(item?.sale_id || '').trim())),
    payments: (normalized.payments || []).filter((payment) => outstandingSaleIds.has(String(payment?.sale_id || '').trim())),
  };
}