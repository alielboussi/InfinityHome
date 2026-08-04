/**
 * Single source of truth for per-sale financial totals.
 * Always computed from base tables: sales, sales_items, sales_payments.
 */

export function saleItemDedupKey(item, saleId = null) {
  const sid = saleId != null ? String(saleId) : String(item?.sale_id || '');
  return `${sid}|${String(item?.product_id || '')}|${String(item?.display_name || '')}|${Number(item?.unit_price || 0)}|${Number(item?.quantity || 0)}|${String(item?.color || '')}`;
}

export function salePaymentDedupKey(payment) {
  const type = String(payment?.payment_type || '').toLowerCase();
  return `${payment?.sale_id}|${payment?.payment_date || ''}|${Number(payment?.amount || 0)}|${String(payment?.reference || '')}|${String(payment?.notes || '')}|${type}`;
}

export function sumDedupedItemsNet(items = [], saleId = null) {
  const seen = new Set();
  let net = 0;
  (items || []).forEach((item) => {
    const key = saleItemDedupKey(item, saleId);
    if (seen.has(key)) return;
    seen.add(key);
    net += Number(item?.unit_price || 0) * Number(item?.quantity || 0);
  });
  return net;
}

export function sumDedupedPayments(payments = []) {
  const seen = new Set();
  let paid = 0;
  let paymentDiscount = 0;
  (payments || []).forEach((payment) => {
    const key = salePaymentDedupKey(payment);
    if (seen.has(key)) return;
    seen.add(key);
    paid += Number(payment?.amount || 0);
    paymentDiscount += Number(payment?.discount_amount || 0);
  });
  return { paid, paymentDiscount };
}

/**
 * Compute canonical financial fields for one sale from base rows.
 * @param {{ sale?: object, items?: object[], payments?: object[] }} input
 */
export function computeSaleFinancials({ sale = {}, items = [], payments = [] } = {}) {
  const saleId = sale?.id ?? sale?.sale_id ?? null;
  const saleDiscountRaw = Number(sale?.discount || 0);
  const itemsNet = sumDedupedItemsNet(items, saleId);
  const subtotalFromSale = Math.max(0, Number(sale?.total_amount || 0) + saleDiscountRaw);
  const subtotal_before_discount = itemsNet > 0 ? itemsNet : subtotalFromSale;
  const discount_amount = Math.min(Math.max(0, saleDiscountRaw), subtotal_before_discount);
  const total_due = Math.max(0, subtotal_before_discount - discount_amount);
  const { paid: paid_amount, paymentDiscount: payment_discount_amount } = sumDedupedPayments(payments);
  const outstanding_amount = Math.max(0, total_due - paid_amount - payment_discount_amount);

  return {
    sale_id: saleId,
    currency: sale?.currency || null,
    subtotal_before_discount,
    discount_amount,
    total_due,
    paid_amount,
    payment_discount_amount,
    outstanding_amount,
  };
}

export function groupRowsBySaleId(rows = [], saleIdField = 'sale_id') {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = String(row?.[saleIdField] ?? '');
    if (!key) return;
    const arr = map.get(key) || [];
    arr.push(row);
    map.set(key, arr);
  });
  return map;
}

export function buildFinancialsMap(sales = [], items = [], payments = []) {
  const itemsBySale = groupRowsBySaleId(items);
  const paymentsBySale = groupRowsBySaleId(payments);
  const out = new Map();
  (sales || []).forEach((sale) => {
    const key = String(sale?.id ?? '');
    if (!key) return;
    const fin = computeSaleFinancials({
      sale,
      items: itemsBySale.get(key) || [],
      payments: paymentsBySale.get(key) || [],
    });
    out.set(key, fin);
  });
  return out;
}

function normalizeCurrencyCode(raw) {
  const val = String(raw || '').trim().toUpperCase();
  if (val === '$' || val === 'USD') return 'USD';
  if (val === 'K' || val === 'ZMW') return 'K';
  return val || 'K';
}

/**
 * Roll up per-customer totals (by currency) from sale financials + payment rows.
 */
export function aggregateCustomerTotals(salesRows = [], finBySaleId = new Map(), payRows = []) {
  const saleMetaById = new Map();
  (salesRows || []).forEach((sale) => {
    const key = String(sale?.id || '');
    const fin = finBySaleId.get(key) || computeSaleFinancials({ sale, items: [], payments: [] });
    saleMetaById.set(key, {
      currency: sale?.currency || fin.currency || null,
      total_amount: Number(sale?.total_amount || 0),
      sale_discount: Number(fin.discount_amount || sale?.discount || 0),
      customer_id: sale?.customer_id || null,
      subtotal_before_discount: Number(fin.subtotal_before_discount || 0),
      total_due: Number(fin.total_due || 0),
    });
  });

  const paymentsByCustomerCurrency = new Map();
  (payRows || []).forEach((payment) => {
    const saleMeta = saleMetaById.get(String(payment?.sale_id)) || {};
    const customerId = saleMeta.customer_id || null;
    if (!customerId) return;
    const code = normalizeCurrencyCode(payment?.currency || saleMeta.currency || 'K');
    const key = `${customerId}|${code}`;
    const prev = paymentsByCustomerCurrency.get(key) || { paid: 0, discount: 0 };
    prev.paid += Number(payment?.amount || 0);
    prev.discount += Number(payment?.discount_amount || 0);
    paymentsByCustomerCurrency.set(key, prev);
  });

  const totals = {};
  (salesRows || []).forEach((sale) => {
    const customerId = String(sale?.customer_id || '');
    if (!customerId) return;
    const fin = saleMetaById.get(String(sale.id)) || {};
    const code = normalizeCurrencyCode(fin.currency || sale?.currency || 'K');
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
