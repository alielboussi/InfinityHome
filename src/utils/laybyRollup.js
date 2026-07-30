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

/** Prefer negotiated layby totals when line-item sums are still at list price. */
export function resolveNegotiatedGrossSubtotal({
  itemSubtotal = 0,
  subtotalBeforeDiscount = 0,
  saleDiscount = 0,
  canonicalTotal = 0,
} = {}) {
  const item = toNumber(itemSubtotal);
  const discount = Math.max(0, toNumber(saleDiscount));
  const canonical = toNumber(canonicalTotal);
  let gross = toNumber(subtotalBeforeDiscount);

  if (gross <= 0 && item > 0) gross = item;
  if (gross <= 0 && canonical > 0) {
    gross = discount > 0 ? canonical + discount : canonical;
  }

  if (item > 0 && canonical > 0) {
    const impliedGross = discount > 0 ? canonical + discount : canonical;
    if (item > impliedGross + 0.5 && impliedGross > 0) {
      gross = impliedGross;
    } else if (item > canonical + 0.5 && gross > canonical + 0.5) {
      gross = canonical;
    }
  } else if (canonical > 0 && gross > canonical + 0.5) {
    gross = canonical;
  }

  return Math.max(0, gross);
}

export const LAYBY_ROWS_CACHE_KEY = 'layby-mgmt:rows:v19';

export function parseFallbackSettlementDateTs(dateLabel) {
  const m = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(String(dateLabel || '').trim());
  if (!m) return 0;
  const ts = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isFinite(ts) ? ts : 0;
}

function paymentDayKey(payment) {
  const raw = payment?.payment_date || payment?.date || null;
  if (!raw) return '';
  try {
    return new Date(raw).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function isPdfRestoreLaybyPayment(payment) {
  const note = String(payment?.notes || '');
  const ref = String(payment?.reference || '');
  return /PDF_ITEM_RESTORE_/i.test(note) || /PDF_ITEM_RESTORE_/i.test(ref)
    || /PDF settlement allocation/i.test(note);
}

export function isPaymentCoveredByFallbackSettlement(payment, fallbackRows) {
  const amount = toNumber(payment?.amount);
  const paymentDay = paymentDayKey(payment);
  return (fallbackRows || []).some((row) => {
    if (Math.abs(toNumber(row?.amount) - amount) > 0.01) return false;
    const fallbackTs = parseFallbackSettlementDateTs(row?.date);
    if (!paymentDay || !fallbackTs) return false;
    const fallbackDay = new Date(fallbackTs).toISOString().slice(0, 10);
    return paymentDay === fallbackDay;
  });
}

/** Drop live DB rows that duplicate PDF fallback settlement lines (Fahme pooled totals). */
export function filterFahmePooledStatementPayments(payments, fallbackRows) {
  return (payments || []).filter((payment) => {
    if (isPdfRestoreLaybyPayment(payment)) return true;
    return !isPaymentCoveredByFallbackSettlement(payment, fallbackRows);
  });
}

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
      subtotalBeforeDiscount = resolveNegotiatedGrossSubtotal({
        itemSubtotal,
        subtotalBeforeDiscount,
        saleDiscount: saleDiscountRaw,
        canonicalTotal: toNumber(sale?.total_amount ?? sale?.total_due),
      });

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
      const totalLooksNet = Math.abs(total - derivedTotal) < 1;
      if (total > 0 && totalLooksNet && subtotalBeforeDiscount < total + saleDiscount) {
        subtotalBeforeDiscount = total + saleDiscount;
      }
      const paid = toNumber(paymentAgg.paid);
      const paymentDiscount = toNumber(paymentAgg.paymentDiscount);
      const netOwed = vatApply
        ? computeQuotationTotals({
            subtotal: subtotalBeforeDiscount,
            discount: saleDiscount,
            vatApply: true,
            vatRate,
          }).total
        : Math.max(0, subtotalBeforeDiscount - saleDiscount);

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
        due: Math.max(0, netOwed - paid - paymentDiscount),
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
    const grossTotal = toNumber(sale.subtotalBeforeDiscount) > 0
      ? toNumber(sale.subtotalBeforeDiscount)
      : toNumber(sale.total) + toNumber(sale.saleDiscount);
    totals[code].total += grossTotal;
    totals[code].paid += toNumber(sale.paid);
    totals[code].discount += toNumber(sale.discount);
    totals[code].due += toNumber(sale.due);
  });
  return totals;
}

// PDF-aligned pooled settlement: sum gross sale totals, subtract deposits and all discounts.
export function computePooledLaybyTotalsByCurrency(statement) {
  const normalized = normalizeLaybyStatement(statement || {});
  const saleFinancials = buildLaybySaleFinancials(normalized);
  const totals = {};
  const saleDiscountByCurrency = {};

  saleFinancials.forEach((sale) => {
    const code = sale.currency || 'K';
    if (!totals[code]) totals[code] = { total: 0, paid: 0, discount: 0, due: 0 };
    const grossTotal = toNumber(sale.subtotalBeforeDiscount) > 0
      ? toNumber(sale.subtotalBeforeDiscount)
      : toNumber(sale.total) + toNumber(sale.saleDiscount);
    totals[code].total += grossTotal;
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
    bucket.due = Math.max(0, roundLaybyMoney(bucket.total - bucket.paid - bucket.discount, code));
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