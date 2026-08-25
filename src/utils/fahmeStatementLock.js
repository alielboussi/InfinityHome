import { buildLaybyCurrencyBucket } from './laybyColumnTotals';
import laybyPdfSettlementFallbacks from '../data/laybyPdfSettlementFallbacks.json';
import fahmeStatementLocks from '../data/fahmeStatementLocks.json';

const LOCK_BY_CUSTOMER_ID = new Map(
  Object.entries(fahmeStatementLocks || {}).map(([id, config]) => [
    String(id).trim().toLowerCase(),
    { ...config, customerId: id },
  ]),
);

const toTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

function dmySlashToIso(dmy) {
  const parts = String(dmy || '').trim().split('/');
  if (parts.length !== 3) return '';
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function resolveSettlementFallbackKey(customerId, config) {
  if (config?.settlementFallbackKey) return config.settlementFallbackKey;
  const id = String(customerId || '').trim().toLowerCase();
  if (id === 'efb21cad-1a8d-4d64-9487-51e816fcb429') return 'mohammad fahme acc(2)';
  return 'mohammad fahme';
}

export function getFahmeStatementLockConfig(customerId) {
  const key = String(customerId || '').trim().toLowerCase();
  return LOCK_BY_CUSTOMER_ID.get(key) || null;
}

export function isFahmeStatementLocked(customerId) {
  return Boolean(getFahmeStatementLockConfig(customerId));
}

export function fahmeStatementLockedMessage(customerId) {
  const config = getFahmeStatementLockConfig(customerId);
  if (!config) return '';
  const pdf = config.referencePdf || 'signed-off PDF';
  return `${config.label || 'This account'} is locked to ${pdf}. New sales or deposits will not change the statement totals.`;
}

function buildAllowedPaymentMatchers(customerId, config) {
  const fallbackKey = resolveSettlementFallbackKey(customerId, config);
  const fallbackRows = fallbackKey ? laybyPdfSettlementFallbacks?.[fallbackKey] : null;
  if (Array.isArray(fallbackRows) && fallbackRows.length) {
    return fallbackRows.map((row) => ({
      amount: Number(row.amount || 0),
      day: dmySlashToIso(row.date),
    }));
  }
  return (config?.allowedPayments || []).map((row) => ({
    amount: Number(row.amount || 0),
    day: row.date ? String(row.date).slice(0, 10) : null,
  }));
}

export function filterLockedFahmeSales(sales, customerId) {
  const config = getFahmeStatementLockConfig(customerId);
  if (!config) return Array.isArray(sales) ? sales.slice() : [];

  const prefix = String(config.receiptPrefix || '').trim().toUpperCase();
  let list = (sales || []).slice();
  if (prefix) {
    const prefixed = list.filter((sale) => {
      const receipt = String(sale?.receipt_number || '').trim().toUpperCase();
      return receipt.startsWith(prefix);
    });
    if (prefixed.length) list = prefixed;
  }

  list.sort((left, right) => toTime(left?.sale_date || left?.created_at) - toTime(right?.sale_date || right?.created_at));
  if (config.maxSales > 0 && list.length > config.maxSales) {
    list = list.slice(0, config.maxSales);
  }
  return list;
}

export function filterLockedFahmePayments(payments, customerId) {
  const config = getFahmeStatementLockConfig(customerId);
  if (!config) return Array.isArray(payments) ? payments.slice() : [];

  const matchers = buildAllowedPaymentMatchers(customerId, config);
  if (!matchers.length) {
    const max = Number(config.maxPayments || 0);
    const sorted = (payments || []).slice().sort(
      (left, right) => toTime(left?.payment_date) - toTime(right?.payment_date),
    );
    return max > 0 ? sorted.slice(0, max) : sorted;
  }

  const pool = (payments || []).slice();
  const matched = [];
  const used = new Set();

  matchers.forEach((matcher) => {
    const index = pool.findIndex((payment, idx) => {
      if (used.has(idx)) return false;
      const amount = Number(payment?.amount || 0);
      if (Math.abs(amount - matcher.amount) > 0.01) return false;
      if (matcher.day) {
        const day = String(payment?.payment_date || '').slice(0, 10);
        if (day && day !== matcher.day) return false;
      }
      return true;
    });
    if (index < 0) return;
    used.add(index);
    matched.push(pool[index]);
  });

  if (config.maxPayments > 0 && matched.length > config.maxPayments) {
    return matched.slice(0, config.maxPayments);
  }
  return matched;
}

export function buildLockedFahmeTotalsByCurrency(customerId) {
  const config = getFahmeStatementLockConfig(customerId);
  if (!config?.totals) return null;

  const currency = config.currency || 'USD';
  const totals = config.totals;
  return {
    [currency]: buildLaybyCurrencyBucket({
      contractTotal: Number(totals.totalSale || 0),
      paid: Number(totals.totalDeposit || 0),
      saleDiscount: Number(totals.saleDiscount || 0),
      paymentDiscount: Number(totals.paymentDiscount || 0),
    }),
  };
}

export function applyFahmeStatementLock(customerId, statement = {}) {
  if (!isFahmeStatementLocked(customerId)) {
    return {
      ...statement,
      totalsByCurrency: null,
      statementLocked: false,
    };
  }

  const lockedSales = filterLockedFahmeSales(statement.sales || [], customerId);
  const saleIds = new Set(
    lockedSales
      .map((sale) => String(sale?.sale_id ?? sale?.id ?? '').trim())
      .filter(Boolean),
  );
  const lockedItems = (statement.items || []).filter(
    (item) => saleIds.has(String(item?.sale_id || '').trim()),
  );
  const lockedPayments = filterLockedFahmePayments(statement.payments || [], customerId);

  return {
    sales: lockedSales,
    items: lockedItems,
    payments: lockedPayments,
    totalsByCurrency: buildLockedFahmeTotalsByCurrency(customerId),
    statementLocked: true,
  };
}

export const FAHME_LOCKED_CUSTOMER_IDS = Object.keys(fahmeStatementLocks || {});
