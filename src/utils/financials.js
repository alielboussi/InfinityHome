// Canonical financials: always computed from base tables via computeSaleFinancials().
import { fromPublic } from '../dbSchema';
import {
  aggregateCustomerTotals,
  buildFinancialsMap,
  computeSaleFinancials,
  groupRowsBySaleId,
  salePaymentDedupKey,
} from './saleFinancials';

export { computeSaleFinancials, aggregateCustomerTotals, buildFinancialsMap } from './saleFinancials';

async function fetchSalesBundle(db, saleIds) {
  const ids = Array.from(new Set((saleIds || []).filter((v) => v !== undefined && v !== null)));
  if (!ids.length) {
    return { sales: [], items: [], payments: [] };
  }

  const [salesRes, itemsRes, paymentsRes] = await Promise.all([
    db.schema('public').from('sales').select('id, customer_id, sale_date, created_at, currency, total_amount, discount, layby_id, status').in('id', ids),
    fromPublic('sales_items').select('sale_id, product_id, display_name, quantity, unit_price, currency, color').in('sale_id', ids),
    fromPublic('sales_payments').select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes, currency').in('sale_id', ids),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  return {
    sales: salesRes.data || [],
    items: itemsRes.data || [],
    payments: paymentsRes.data || [],
  };
}

export async function fetchCanonicalFinancials(db, saleIds) {
  const ids = Array.from(new Set((saleIds || []).filter((v) => v !== undefined && v !== null)));
  if (!ids.length) return new Map();

  try {
    const { sales, items, payments } = await fetchSalesBundle(db, ids);
    return buildFinancialsMap(sales, items, payments);
  } catch {
    return new Map();
  }
}

export async function fetchCanonicalFinancialForSale(db, saleId) {
  const map = await fetchCanonicalFinancials(db, [saleId]);
  return map.get(String(saleId)) || computeSaleFinancials({ sale: { id: saleId }, items: [], payments: [] });
}

export async function fetchCustomerTotalsFromBaseTables(db, salesRows, payRows) {
  const saleIds = (salesRows || []).map((sale) => sale.id).filter((value) => value != null);
  const finMap = await fetchCanonicalFinancials(db, saleIds);
  return aggregateCustomerTotals(salesRows, finMap, payRows);
}

export async function computeCustomerOutstandingCanonical(db, customerId, currencyFilter) {
  if (!customerId) return 0;
  const { data: salesRows } = await db
    .schema('public')
    .from('sales')
    .select('id, sale_date, created_at, currency')
    .eq('customer_id', customerId);
  const sales = Array.isArray(salesRows) ? salesRows : [];
  if (!sales.length) return 0;

  const curCode = (currencyFilter || '').toString().trim();
  const salesFiltered = curCode
    ? sales.filter((s) => {
      const raw = (s.currency || '').toString().trim();
      const norm = (raw === '$' || raw.toUpperCase() === 'USD') ? 'USD' : (raw.toUpperCase() === 'K' ? 'K' : raw.toUpperCase());
      const want = (curCode === '$' || curCode.toUpperCase() === 'USD') ? 'USD' : (curCode.toUpperCase() === 'K' ? 'K' : curCode.toUpperCase());
      return norm === want;
    })
    : sales;
  const saleIds = salesFiltered.map((s) => s.id).filter((v) => v != null);
  const finMap = await fetchCanonicalFinancials(db, saleIds);

  const { data: payRows } = await fromPublic('sales_payments')
    .select('sale_id, amount, payment_type, payment_date, reference, notes')
    .in('sale_id', saleIds);
  const payments = Array.isArray(payRows) ? payRows : [];
  const seen = new Set();
  const nonCredit = [];
  payments.forEach((p) => {
    const key = salePaymentDedupKey(p);
    if (seen.has(key)) return;
    seen.add(key);
    nonCredit.push({
      sale_id: p.sale_id,
      amount: Number(p.amount || 0) || 0,
      ts: (() => { try { return new Date(p.payment_date || 0).getTime() || 0; } catch { return 0; } })(),
    });
  });

  const normalizeYYYYMMDD = (raw) => {
    const str = String(raw || '');
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    try {
      const dt = new Date(str);
      if (isNaN(dt.getTime())) return '';
      const y = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, '0');
      const da = String(dt.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    } catch { return ''; }
  };

  const salesSorted = salesFiltered
    .map((s) => ({ id: s.id, dateKey: normalizeYYYYMMDD(s.sale_date || s.created_at || '') }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  let pool = nonCredit.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  let outstanding = 0;
  salesSorted.forEach((s) => {
    const fin = finMap.get(String(s.id));
    const total = Number(fin?.total_due || 0);
    const applied = Math.min(pool, total);
    pool -= applied;
    outstanding += Math.max(0, total - applied);
  });
  return Math.max(0, outstanding);
}

export async function computeCustomerDueRemainingLikePdf(db, customerId) {
  if (!customerId) return 0;
  try {
    const { data: salesRows } = await db
      .schema('public')
      .from('sales')
      .select('id, sale_date, created_at, total_amount, discount, currency')
      .eq('customer_id', customerId);
    const sales = Array.isArray(salesRows) ? salesRows : [];
    if (!sales.length) return 0;
    const saleIds = sales.map((s) => s.id).filter((v) => v != null);

    const { items, payments } = await fetchSalesBundle(db, saleIds);
    const itemsBySale = groupRowsBySaleId(items);

    let sumTotals = 0;
    sales.forEach((sale) => {
      const fin = computeSaleFinancials({
        sale,
        items: itemsBySale.get(String(sale.id)) || [],
        payments: [],
      });
      sumTotals += Number(fin.total_due || 0);
    });

    const seen = new Set();
    let nonCreditPaid = 0;
    (payments || []).forEach((p) => {
      const type = String(p.payment_type || '').toLowerCase();
      const key = salePaymentDedupKey(p);
      if (seen.has(key)) return;
      seen.add(key);
      if (type === 'credit') return;
      const amt = Number(p.amount || 0);
      if (!isNaN(amt) && amt > 0) nonCreditPaid += amt;
    });

    return Math.max(0, Number(sumTotals || 0) - Number(nonCreditPaid || 0));
  } catch {
    return 0;
  }
}

export async function computeCustomerOutstandingLikeLaybyPage(db, customerId) {
  const { computeCustomerLaybyDueTotal } = await import('./customerLaybyDue');
  return computeCustomerLaybyDueTotal(customerId);
}
