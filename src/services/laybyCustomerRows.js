import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { fetchCanonicalFinancials } from '../utils/financials';
import { normalizeLaybyStatement } from '../utils/laybyStatementNormalize';
import { buildLaybyCurrencyBucket } from '../utils/laybyColumnTotals';
import { computePooledLaybyTotalsByCurrency, filterFahmePooledStatementPayments, filterStatementToOutstandingSales, resolveNegotiatedGrossSubtotal } from '../utils/laybyRollup';
import { computeQuotationDisplayTotal, computeSaleLaybyTotalDue, resolveQuoteVatApply } from '../utils/quotationDisplay';
import { fetchMergedLaybyPayments, buildLaybyPaymentLooseKey, dedupeLaybyPaymentRows } from './laybyPayments';
import { isFahme, isFahmeAcc2, resolveFahmeFallbackKey, FAHME_ID, FAHME_PLACEHOLDER_HOLD, shouldUseFahmeLiveStatementOnly } from '../laybyRules';
import { filterCustomerSalesForLaybyStatement } from '../utils/laybyStatementSales';
import { applyFahmeStatementLock, filterLockedFahmePayments, filterLockedFahmeSales, isFahmeStatementLocked } from '../utils/fahmeStatementLock';
import laybyPdfSettlementFallbacks from '../data/laybyPdfSettlementFallbacks.json';

const CLOSED_LAYBY_STATUSES = new Set(['completed', 'cancelled', 'voided', 'closed', 'settled', 'paid', 'refunded']);

const normalizeCurrency = (value, fallback = 'K') => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return fallback;
  if (raw === '$' || raw === 'USD') return 'USD';
  if (raw === 'K' || raw === 'ZMW') return 'K';
  return raw;
};

const isActiveLaybyStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return true;
  return !CLOSED_LAYBY_STATUSES.has(normalized);
};

const chunkArray = (list, size) => {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
};

const toTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sumDue = (totalsByCurrency) => Object.values(totalsByCurrency || {})
  .reduce((sum, totals) => sum + Number(totals?.due || 0), 0);

const LAYBY_SALE_OR_FILTER = 'status.eq.layby,status.eq.active,layby_id.not.is.null';

function filterCustomerSalesForStatement(customerId, laybys, salesByCustomer) {
  return filterCustomerSalesForLaybyStatement(
    (salesByCustomer.get(customerId) || []).slice(),
    laybys,
  );
}

function laybyHasOutstandingBalance(layby, financialsBySale) {
  const saleId = String(layby?.sale_id || '').trim();
  if (!saleId) return false;
  const fin = financialsBySale.get(saleId) || {};
  const outstanding = Number(fin?.outstanding_amount);
  if (Number.isFinite(outstanding)) return outstanding > 0.009;
  const total = Number(fin?.total_due || layby?.total_amount || 0);
  const paid = Number(fin?.paid_amount || layby?.paid_amount || 0);
  return Math.max(0, total - paid) > 0.009;
}

function laybysForCustomerTotals(laybys, financialsBySale) {
  return (laybys || []).filter(
    (layby) => isActiveLaybyStatus(layby?.status) || laybyHasOutstandingBalance(layby, financialsBySale),
  );
}

function isLaybyLinkedSale(sale, laybyBySaleId) {
  const status = String(sale?.status || '').trim().toLowerCase();
  const saleId = String(sale?.id || '').trim();
  return status === 'layby'
    || status === 'active'
    || sale?.layby_id != null
    || (saleId && laybyBySaleId?.has(saleId));
}

/** Match All Sales outstanding: max(fin, anchor layby paid, payments) with stale-fin guard. */
function computeAllSalesStyleOutstanding({ sale, layby, fin, paymentAgg }) {
  const saleKey = String(sale?.id || '').trim();
  const total = fin ? Number(fin.total_due || 0) : Number(sale?.total_amount || 0);
  const finPaid = fin ? Number(fin.paid_amount || 0) : 0;
  const laybyPaid = isLaybyAnchorSale(layby, saleKey) ? Number(layby?.paid_amount || 0) : 0;
  const paymentPaid = Number(paymentAgg?.paid || 0);
  const paymentDiscount = Number(paymentAgg?.paymentDiscount || 0);
  const discount = fin ? Number(fin.discount_amount || 0) : Number(sale?.discount || 0);
  const paid = Math.max(finPaid, laybyPaid, paymentPaid);
  const dueFallback = Math.max(0, total - paid - Math.max(0, discount) - Math.max(0, paymentDiscount));
  const finOutstanding = Number(fin?.outstanding_amount);
  const finLooksStale = Number.isFinite(finOutstanding)
    && paymentPaid > 0
    && finOutstanding > dueFallback + 0.009;
  return (Number.isFinite(finOutstanding) && !finLooksStale)
    ? Math.max(0, finOutstanding)
    : dueFallback;
}

function buildLaybyBySaleId(laybys) {
  const map = new Map();
  (laybys || []).forEach((layby) => {
    const saleId = String(layby?.sale_id || '').trim();
    if (saleId) map.set(saleId, layby);
  });
  return map;
}

function buildLaybyById(laybys) {
  const map = new Map();
  (laybys || []).forEach((layby) => {
    const laybyId = String(layby?.id || '').trim();
    if (laybyId) map.set(laybyId, layby);
  });
  return map;
}

function resolveLinkedLaybyForSale({ sale, saleKey, laybyBySaleId, laybyById }) {
  const anchorLayby = laybyBySaleId.get(saleKey);
  if (anchorLayby) return anchorLayby;
  const laybyId = String(sale?.layby_id || '').trim();
  if (laybyId && laybyById.has(laybyId)) return laybyById.get(laybyId);
  return null;
}

function isLaybyAnchorSale(layby, saleKey) {
  return Boolean(layby) && String(layby?.sale_id || '').trim() === String(saleKey || '').trim();
}

/** One layby row backing many sales (Fahme pooled) — use layby contract + payment sum. */
function buildSinglePooledLaybyTotals({
  layby,
  statementSales,
  statementPayments,
  saleCurrencyById,
  customer,
}) {
  if (!layby) return null;
  const currency = normalizeCurrency(
    saleCurrencyById.get(String(layby?.sale_id || '')),
    normalizeCurrency(customer?.currency || 'K', 'K'),
  );
  const paid = (statementPayments || []).reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
  const paymentDiscount = (statementPayments || []).reduce(
    (sum, payment) => sum + Number(payment?.discount_amount || 0),
    0,
  );
  const saleDiscount = (statementSales || []).reduce(
    (sum, sale) => sum + Number(sale?.discount_amount || 0),
    0,
  );
  const salesTotal = (statementSales || []).reduce(
    (sum, sale) => sum + Number(sale?.total_due || sale?.total_amount || 0),
    0,
  );
  const contractTotal = Math.max(Number(layby?.total_amount || 0), salesTotal);
  return {
    [currency]: buildLaybyCurrencyBucket({
      contractTotal,
      paid,
      saleDiscount,
      paymentDiscount,
    }),
  };
}

function isLaybyActivitySale(sale, laybyBySaleId) {
  const saleId = String(sale?.id || '').trim();
  return isLaybyLinkedSale(sale, laybyBySaleId) || (saleId && laybyBySaleId.has(saleId));
}

function rebuildCandidateSales({ salesById, laybyIdSet, laybySaleIds, paymentSaleIdSet, laybyBySaleId }) {
  const candidateSales = Array.from(salesById.values()).filter((sale) => {
    const saleId = String(sale?.id || '').trim();
    const laybyId = String(sale?.layby_id || '').trim();
    const status = String(sale?.status || '').trim().toLowerCase();
    return laybyIdSet.has(laybyId)
      || status === 'layby'
      || status === 'active'
      || laybySaleIds.some((id) => String(id) === saleId)
      || paymentSaleIdSet.has(saleId)
      || laybyBySaleId.has(saleId);
  });

  const salesByCustomer = new Map();
  candidateSales.forEach((sale) => {
    const customerId = String(sale?.customer_id || '').trim();
    if (!customerId) return;
    if (!salesByCustomer.has(customerId)) salesByCustomer.set(customerId, []);
    salesByCustomer.get(customerId).push(sale);
  });

  return { candidateSales, salesByCustomer };
}

function patchTotalsFromOutstandingSales(totalsByCurrency, statementSales, customer) {
  const patched = { ...totalsByCurrency };
  (statementSales || []).forEach((sale) => {
    const outstanding = Math.max(0, Number(sale.outstanding_amount || 0));
    if (outstanding <= 0.009) return;
    const cur = normalizeCurrency(sale.currency, normalizeCurrency(customer?.currency || 'K', 'K'));
    if (!patched[cur]) patched[cur] = { total: 0, paid: 0, discount: 0, due: 0 };
    const totalDue = Number(sale.total_due || sale.total_amount || 0);
    const paid = Number(sale.paid_amount || 0);
    const discount = Number(sale.discount_amount || 0) + Number(sale.payment_discount_amount || 0);
    patched[cur].due += outstanding;
    patched[cur].total = Math.max(patched[cur].total, totalDue);
    patched[cur].paid = Math.max(patched[cur].paid, paid);
    patched[cur].discount = Math.max(patched[cur].discount, discount);
  });
  return patched;
}

function resolveLinkedQuote({ saleId, laybyId, quotationBySaleId, quotationByLaybyId }) {
  const saleKey = String(saleId || '').trim();
  if (saleKey && quotationBySaleId.has(saleKey)) {
    return quotationBySaleId.get(saleKey);
  }
  const laybyKey = String(laybyId || '').trim();
  if (laybyKey && quotationByLaybyId.has(laybyKey)) {
    return quotationByLaybyId.get(laybyKey);
  }
  return null;
}

function resolveCustomerLinkedQuote({
  customerId,
  laybys,
  statementSales,
  quotationBySaleId,
  quotationByLaybyId,
  quotationsByCustomerId,
}) {
  const tryResolve = (saleId, laybyId) => resolveLinkedQuote({
    saleId,
    laybyId,
    quotationBySaleId,
    quotationByLaybyId,
  });

  for (const layby of laybys || []) {
    const quote = tryResolve(layby?.sale_id, layby?.id);
    if (quote?.id) return quote;
  }

  for (const sale of statementSales || []) {
    const quote = tryResolve(sale?.sale_id ?? sale?.id, sale?.layby_id);
    if (quote?.id) return quote;
  }

  const laybyIdSet = new Set((laybys || []).map((layby) => String(layby?.id || '').trim()).filter(Boolean));
  const saleIdSet = new Set((laybys || []).map((layby) => String(layby?.sale_id || '').trim()).filter(Boolean));
  (statementSales || []).forEach((sale) => {
    const saleKey = String(sale?.sale_id ?? sale?.id ?? '').trim();
    if (saleKey) saleIdSet.add(saleKey);
    const laybyKey = String(sale?.layby_id || '').trim();
    if (laybyKey) laybyIdSet.add(laybyKey);
  });

  const customerQuotes = (quotationsByCustomerId.get(String(customerId || '').trim()) || [])
    .filter((quote) => {
      const status = String(quote?.status || '').toLowerCase();
      return status === 'converted' || status === 'invoice' || quote?.sale_id || quote?.layby_id;
    })
    .sort((left, right) => toTime(right?.created_at) - toTime(left?.created_at));

  for (const quote of customerQuotes) {
    const laybyKey = String(quote?.layby_id || '').trim();
    const saleKey = String(quote?.sale_id || '').trim();
    if ((laybyKey && laybyIdSet.has(laybyKey)) || (saleKey && saleIdSet.has(saleKey))) {
      return quote;
    }
  }

  return customerQuotes[0] || null;
}

export async function fetchLaybyCustomerRows() {
  const [
    { data: laybyRowsSeed, error: laybyErr },
    { data: paymentSeedRows, error: paymentSeedErr },
    { data: salesSeedRows, error: salesSeedErr },
  ] = await Promise.all([
    db
      .from('laybys')
      .select('id, sale_id, customer_id, total_amount, paid_amount, status, updated_at, created_at, origin, notes')
      .not('sale_id', 'is', null),
    fromPublic('layby_payments')
      .select('customer_id, sale_id')
      .not('customer_id', 'is', null),
    fromPublic('sales')
      .select('id, sale_id, customer_id, status, layby_id, sale_date, created_at, currency, total_amount, vat_apply, vat_rate, vat_inclusive, discount, receipt_number')
      .not('customer_id', 'is', null)
      .or(LAYBY_SALE_OR_FILTER),
  ]);
  if (laybyErr) throw laybyErr;
  if (paymentSeedErr) throw paymentSeedErr;
  if (salesSeedErr) throw salesSeedErr;

  const byCustomer = new Map();
  const customerIds = new Set();
  (laybyRowsSeed || []).forEach((layby) => {
    const customerId = String(layby?.customer_id || '').trim();
    if (!customerId) return;
    customerIds.add(customerId);
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    byCustomer.get(customerId).push(layby);
  });
  (paymentSeedRows || []).forEach((payment) => {
    const customerId = String(payment?.customer_id || '').trim();
    if (!customerId) return;
    customerIds.add(customerId);
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
  });
  (salesSeedRows || []).forEach((sale) => {
    const customerId = String(sale?.customer_id || '').trim();
    if (!customerId) return;
    customerIds.add(customerId);
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
  });

  const idsAfterSeed = Array.from(customerIds);
  if (!idsAfterSeed.length) return [];

  const paymentSaleIdSet = new Set(
    (paymentSeedRows || [])
      .map((row) => row?.sale_id)
      .filter((saleId) => saleId != null)
      .map((saleId) => String(saleId))
  );

  const laybySaleIds = Array.from(
    new Set(
      (laybyRowsSeed || [])
        .map((row) => row?.sale_id)
        .filter((saleId) => saleId != null)
    )
  );

  const saleCurrencyById = new Map();
  if (laybySaleIds.length) {
    const chunks = chunkArray(laybySaleIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await fromPublic('sales')
        .select('id, currency')
        .in('id', chunk);
      if (error) throw error;
      (data || []).forEach((sale) => {
        saleCurrencyById.set(String(sale.id), normalizeCurrency(sale.currency, 'K'));
      });
    }
  }

  const laybyIdSet = new Set(
    (laybyRowsSeed || [])
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean)
  );

  const laybyBySaleId = buildLaybyBySaleId(laybyRowsSeed);

  const salesById = new Map();
  (salesSeedRows || []).forEach((sale) => {
    const saleId = String(sale?.id || '').trim();
    if (!saleId) return;
    salesById.set(saleId, sale);
  });

  const referencedSaleIds = Array.from(
    new Set([
      ...laybySaleIds.map((saleId) => String(saleId)),
      ...paymentSaleIdSet,
    ]),
  ).filter((saleId) => saleId && !salesById.has(saleId));

  if (referencedSaleIds.length) {
    const chunks = chunkArray(referencedSaleIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await fromPublic('sales')
        .select('id, sale_id, customer_id, status, layby_id, sale_date, created_at, currency, total_amount, vat_apply, vat_rate, vat_inclusive, discount, receipt_number')
        .in('id', chunk);
      if (error) throw error;
      (data || []).forEach((sale) => {
        const saleId = String(sale?.id || '').trim();
        if (!saleId) return;
        salesById.set(saleId, sale);
        const customerId = String(sale?.customer_id || '').trim();
        if (customerId) customerIds.add(customerId);
      });
    }
  }

  (laybyRowsSeed || []).forEach((layby) => {
    let customerId = String(layby?.customer_id || '').trim();
    if (!customerId) {
      const saleId = String(layby?.sale_id || '').trim();
      const sale = saleId ? salesById.get(saleId) : null;
      customerId = String(sale?.customer_id || '').trim();
    }
    if (!customerId) return;
    customerIds.add(customerId);
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    const bucket = byCustomer.get(customerId);
    if (!bucket.some((row) => String(row?.id || '') === String(layby?.id || ''))) {
      bucket.push(layby);
    }
  });

  const saleCountByCustomer = new Map();
  salesById.forEach((sale) => {
    const customerId = String(sale?.customer_id || '').trim();
    if (!customerId) return;
    saleCountByCustomer.set(customerId, (saleCountByCustomer.get(customerId) || 0) + 1);
  });

  const customersMissingSales = Array.from(customerIds).filter((customerId) => {
    if ((byCustomer.get(customerId)?.length || 0) > 0) return true;
    if ((saleCountByCustomer.get(customerId) || 0) > 0) return false;
    return (paymentSeedRows || []).some(
      (payment) => String(payment?.customer_id || '').trim() === String(customerId),
    );
  });

  if (customersMissingSales.length) {
    const chunks = chunkArray(customersMissingSales, 80);
    for (const chunk of chunks) {
      const { data, error } = await fromPublic('sales')
        .select('id, sale_id, customer_id, status, layby_id, sale_date, created_at, currency, total_amount, vat_apply, vat_rate, vat_inclusive, discount, receipt_number')
        .in('customer_id', chunk);
      if (error) throw error;
      (data || []).forEach((sale) => {
        const saleId = String(sale?.id || '').trim();
        if (!saleId) return;
        salesById.set(saleId, sale);
        const customerId = String(sale?.customer_id || '').trim();
        if (customerId) customerIds.add(customerId);
      });
    }
  }

  const { candidateSales, salesByCustomer } = rebuildCandidateSales({
    salesById,
    laybyIdSet,
    laybySaleIds,
    paymentSaleIdSet,
    laybyBySaleId,
  });

  const candidateSaleIds = Array.from(
    new Set(candidateSales.map((sale) => sale?.id).filter((saleId) => saleId != null))
  );

  const financialsBySale = await fetchCanonicalFinancials(db, candidateSaleIds);

  // Ensure customers with an outstanding layby-linked sale are always included.
  candidateSales.forEach((sale) => {
    const customerId = String(sale?.customer_id || '').trim();
    const saleId = String(sale?.id || '').trim();
    if (!customerId || !saleId) return;
    const layby = laybyBySaleId.get(saleId);
    if (!isLaybyActivitySale(sale, laybyBySaleId)) return;
    const fin = financialsBySale.get(saleId) || {};
    const outstanding = computeAllSalesStyleOutstanding({
      sale,
      layby,
      fin,
      paymentAgg: { paid: 0, paymentDiscount: 0 },
    });
    if (outstanding > 0.009) customerIds.add(customerId);
  });
  const ids = Array.from(customerIds);
  if (!ids.length) return [];

  const { data: customerRows, error: custErr } = await fromPublic('customers')
    .select('id, name, phone, currency')
    .in('id', ids);
  if (custErr) throw custErr;

  const itemsBySale = new Map();
  if (candidateSaleIds.length) {
    const chunks = chunkArray(candidateSaleIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await fromPublic('sales_items')
        .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
        .in('sale_id', chunk);
      if (error) throw error;
      (data || []).forEach((item) => {
        const saleId = String(item?.sale_id || '').trim();
        if (!saleId) return;
        if (!itemsBySale.has(saleId)) itemsBySale.set(saleId, []);
        itemsBySale.get(saleId).push(item);
      });
    }
  }

  const paymentsBySale = new Map();
  const paymentsByCustomer = new Map();
  const paymentRowKey = (payment) => buildLaybyPaymentLooseKey({
    ...payment,
    payment_type: String(payment?.payment_type || '').toLowerCase(),
  });

  if (candidateSaleIds.length) {
    const chunks = chunkArray(candidateSaleIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await fetchMergedLaybyPayments({ saleIds: chunk });
      if (error) throw error;
      (data || []).forEach((payment) => {
        let saleId = String(payment?.sale_id || '').trim();
        if (!saleId) return;
        if (!paymentsBySale.has(saleId)) paymentsBySale.set(saleId, []);
        const bucket = paymentsBySale.get(saleId);
        const key = paymentRowKey(payment);
        if (bucket.some((row) => paymentRowKey(row) === key)) return;
        bucket.push(payment);
      });
    }
  }

  // Customer-scoped payments in bulk (not one request per customer).
  if (ids.length) {
    const customerChunks = chunkArray(ids, 100);
    for (const customerChunk of customerChunks) {
      const { data, error } = await fromPublic('layby_payments')
        .select('id, sale_id, customer_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
        .in('customer_id', customerChunk)
        .order('payment_date', { ascending: true });
      if (error) throw error;
      (data || []).forEach((payment) => {
        const cid = String(payment?.customer_id || '').trim();
        const normalizedPayment = {
          ...payment,
          payment_type: String(payment?.payment_type || '').toLowerCase(),
        };
        if (cid) {
          if (!paymentsByCustomer.has(cid)) paymentsByCustomer.set(cid, []);
          const customerBucket = paymentsByCustomer.get(cid);
          const customerKey = paymentRowKey(normalizedPayment);
          if (!customerBucket.some((row) => paymentRowKey(row) === customerKey)) {
            customerBucket.push(normalizedPayment);
          }
        }
        const saleIdsForCustomer = (salesByCustomer.get(cid) || []).map((sale) => sale?.id).filter(Boolean);
        let saleId = String(payment?.sale_id || '').trim();
        if (!saleId && saleIdsForCustomer.length) {
          saleId = String(saleIdsForCustomer[0] || '').trim();
        }
        if (!saleId) return;
        if (!paymentsBySale.has(saleId)) paymentsBySale.set(saleId, []);
        const bucket = paymentsBySale.get(saleId);
        const key = paymentRowKey(normalizedPayment);
        if (bucket.some((row) => paymentRowKey(row) === key)) return;
        bucket.push(normalizedPayment);
      });
    }
  }

  const quotationBySaleId = new Map();
  const quotationByLaybyId = new Map();
  const quotationsByCustomerId = new Map();
  const laybyIdsAll = (laybyRowsSeed || []).map((row) => row?.id).filter((id) => id != null);
  const quotationSelect = 'id, customer_id, sale_id, layby_id, subtotal, total, discount, vat_apply, vat_rate, status, created_at';

  const ingestQuotation = (quote) => {
    const saleId = String(quote?.sale_id || '').trim();
    const laybyId = String(quote?.layby_id || '').trim();
    const customerId = String(quote?.customer_id || '').trim();
    if (saleId) quotationBySaleId.set(saleId, quote);
    if (laybyId) quotationByLaybyId.set(laybyId, quote);
    if (customerId) {
      if (!quotationsByCustomerId.has(customerId)) quotationsByCustomerId.set(customerId, []);
      quotationsByCustomerId.get(customerId).push(quote);
    }
  };

  if (candidateSaleIds.length) {
    const chunks = chunkArray(candidateSaleIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await db
        .from('quotations')
        .select(quotationSelect)
        .in('sale_id', chunk);
      if (error) throw error;
      (data || []).forEach(ingestQuotation);
    }
  }

  if (laybyIdsAll.length) {
    const chunks = chunkArray(laybyIdsAll, 200);
    for (const chunk of chunks) {
      const { data, error } = await db
        .from('quotations')
        .select(quotationSelect)
        .in('layby_id', chunk);
      if (error) throw error;
      (data || []).forEach(ingestQuotation);
    }
  }

  if (ids.length) {
    const chunks = chunkArray(ids, 100);
    for (const chunk of chunks) {
      const { data, error } = await db
        .from('quotations')
        .select(quotationSelect)
        .in('customer_id', chunk)
        .neq('status', 'draft');
      if (error) throw error;
      (data || []).forEach(ingestQuotation);
    }
  }

  const paymentAggBySale = new Map();
  paymentsBySale.forEach((rows, saleId) => {
    const aggregate = (rows || []).reduce((acc, row) => {
      acc.paid += Number(row?.amount || 0);
      acc.paymentDiscount += Number(row?.discount_amount || 0);
      return acc;
    }, { paid: 0, paymentDiscount: 0 });
    paymentAggBySale.set(String(saleId), aggregate);
  });

  const customersMap = (customerRows || []).reduce((acc, customer) => {
    acc[String(customer.id)] = customer;
    return acc;
  }, {});

  const built = [];
  ids.forEach((customerId) => {
    const customer = customersMap[customerId] || { id: customerId, name: customerId, phone: '', currency: 'K' };

    if (FAHME_PLACEHOLDER_HOLD && String(customerId) === String(FAHME_ID)) {
      const laybys = byCustomer.get(customerId) || [];
      built.push({
        customerId,
        customer,
        statement: { sales: [], items: [], payments: [] },
        fullStatement: { sales: [], items: [], payments: [] },
        totalsByCurrency: { USD: { total: 0, paid: 0, discount: 0, due: 0 } },
        linkedQuoteId: null,
        totalsDebug: { source: 'placeholder_hold', saleCount: 0, outstandingSaleCount: 0 },
        laybys,
        primaryLayby: laybys[0] || null,
        lastUpdated: Date.now(),
        placeholderHold: true,
      });
      return;
    }

    const laybys = byCustomer.get(customerId) || [];
    const laybysForTotals = laybysForCustomerTotals(laybys, financialsBySale);
    const laybyById = buildLaybyById(laybys);

    const customerSales = filterCustomerSalesForStatement(customerId, laybys, salesByCustomer)
      .slice();
    customerSales.sort((left, right) => toTime(left?.sale_date || left?.created_at) - toTime(right?.sale_date || right?.created_at));

    const scopedCustomerSales = isFahmeStatementLocked(customerId)
      ? filterLockedFahmeSales(customerSales, customerId)
      : customerSales;

    const useSinglePooledLaybyTotals = laybysForTotals.length === 1
      && (scopedCustomerSales.length > 1 || shouldUseFahmeLiveStatementOnly(customerId, customer?.name));

    const tableTotalsByCurrency = {};
    if (!useSinglePooledLaybyTotals) {
      laybysForTotals.forEach((layby) => {
        const saleId = String(layby?.sale_id || '').trim();
        const sale = saleId ? salesById.get(saleId) : null;
        const linkedQuote = resolveLinkedQuote({
          saleId,
          laybyId: layby?.id,
          quotationBySaleId,
          quotationByLaybyId,
        });
        const fin = saleId ? (financialsBySale.get(saleId) || {}) : {};
        const saleItems = saleId ? (itemsBySale.get(saleId) || []) : [];
        const paymentAgg = saleId ? (paymentAggBySale.get(saleId) || { paid: 0, paymentDiscount: 0 }) : { paid: 0, paymentDiscount: 0 };
        let totalAmount = Number(layby?.total_amount || 0);
        if (sale) {
          totalAmount = computeSaleLaybyTotalDue({ sale, fin, items: saleItems, linkedQuote });
        } else if (linkedQuote) {
          totalAmount = computeQuotationDisplayTotal(linkedQuote);
        }
        const discountAmount = Number(sale?.discount ?? fin?.discount_amount ?? linkedQuote?.discount ?? 0);
        const paidAmount = Math.max(
          Number(paymentAgg?.paid || 0),
          isLaybyAnchorSale(layby, saleId) ? Number(layby?.paid_amount || 0) : 0,
        );
        const paymentDiscountAmount = Number(paymentAgg?.paymentDiscount || 0);
        const dueAmount = Math.max(0, totalAmount - paidAmount - paymentDiscountAmount);
        if (dueAmount <= 0) return;

        const currency = normalizeCurrency(
          saleCurrencyById.get(String(layby?.sale_id || '')),
          normalizeCurrency(customer?.currency || 'K', 'K')
        );

        if (!tableTotalsByCurrency[currency]) {
          tableTotalsByCurrency[currency] = { total: 0, paid: 0, discount: 0, due: 0 };
        }

        tableTotalsByCurrency[currency].total += totalAmount;
        tableTotalsByCurrency[currency].paid += paidAmount;
        tableTotalsByCurrency[currency].discount += discountAmount + paymentDiscountAmount;
        tableTotalsByCurrency[currency].due += dueAmount;
      });
    }

    const statementSales = scopedCustomerSales.map((sale) => {
      const saleId = sale?.id;
      const saleKey = String(saleId || '').trim();
      const fin = financialsBySale.get(saleKey) || {};
      const linkedQuote = resolveLinkedQuote({
        saleId: saleKey,
        laybyId: sale?.layby_id,
        quotationBySaleId,
        quotationByLaybyId,
      });
      const saleItems = itemsBySale.get(saleKey) || [];
      const paymentAgg = paymentAggBySale.get(saleKey) || { paid: 0, paymentDiscount: 0 };
      const linkedLayby = resolveLinkedLaybyForSale({
        sale,
        saleKey,
        laybyBySaleId,
        laybyById,
      });
      const totalDue = computeSaleLaybyTotalDue({ sale, fin, items: saleItems, linkedQuote });
      const finPaid = Number(fin?.paid_amount || 0);
      const laybyPaid = isLaybyAnchorSale(linkedLayby, saleKey)
        ? Number(linkedLayby?.paid_amount || 0)
        : 0;
      const paidAmount = Math.max(finPaid, laybyPaid, Number(paymentAgg?.paid || 0));
      const discountAmount = Number(sale?.discount ?? fin?.discount_amount ?? linkedQuote?.discount ?? 0);
      const paymentDiscountAmount = Number(paymentAgg?.paymentDiscount || 0);
      const dueFallback = Math.max(0, totalDue - paidAmount - Math.max(0, paymentDiscountAmount));
      const finOutstanding = Number(fin?.outstanding_amount);
      const hasFinOutstanding = Number.isFinite(finOutstanding);
      const finLooksStale = hasFinOutstanding
        && Number(paymentAgg?.paid || 0) > 0
        && finOutstanding > dueFallback + 0.009;
      const outstandingAmount = (hasFinOutstanding && !finLooksStale)
        ? Math.max(0, finOutstanding)
        : dueFallback;
      const itemSubtotal = saleItems.reduce(
        (sum, item) => sum + Number(item?.quantity || 0) * Number(item?.unit_price || 0),
        0,
      );
      const subtotalBeforeDiscount = resolveNegotiatedGrossSubtotal({
        itemSubtotal,
        subtotalBeforeDiscount: Number(fin?.subtotal_before_discount || linkedQuote?.subtotal || 0),
        saleDiscount: discountAmount,
        canonicalTotal: Number(sale?.total_amount || totalDue),
      });
      const vatApply = Boolean(linkedQuote?.vat_apply || sale?.vat_apply)
        || resolveQuoteVatApply(linkedQuote || sale, subtotalBeforeDiscount, discountAmount);
      const vatInclusive = Boolean(linkedQuote?.vat_inclusive ?? sale?.vat_inclusive);
      const vatRate = Number(linkedQuote?.vat_rate || sale?.vat_rate || 0);
      return {
        sale_id: saleId,
        sale_date: sale?.sale_date || sale?.created_at || null,
        currency: normalizeCurrency(sale?.currency, normalizeCurrency(customer?.currency || 'K', 'K')),
        layby_id: sale?.layby_id || null,
        total_due: totalDue,
        total_amount: Number(sale?.total_amount || totalDue),
        paid_amount: paidAmount,
        payment_discount_amount: Math.max(0, paymentDiscountAmount),
        outstanding_amount: Math.max(0, outstandingAmount),
        subtotal_before_discount: Math.max(0, subtotalBeforeDiscount),
        discount_amount: Math.max(0, discountAmount),
        vat_apply: vatInclusive ? false : vatApply,
        vat_inclusive: vatInclusive,
        vat_rate: vatRate,
      };
    });

    const customerItems = [];
    const customerPayments = [];
    const paymentSeen = new Set();
    const pushCustomerPayment = (payment) => {
      const key = paymentRowKey(payment);
      if (paymentSeen.has(key)) return;
      paymentSeen.add(key);
      customerPayments.push(payment);
    };
    statementSales.forEach((sale) => {
      const saleKey = String(sale?.sale_id || '').trim();
      if (!saleKey) return;
      (itemsBySale.get(saleKey) || []).forEach((item) => customerItems.push(item));
      (paymentsBySale.get(saleKey) || []).forEach((payment) => pushCustomerPayment(payment));
    });
    (paymentsByCustomer.get(String(customerId)) || []).forEach((payment) => pushCustomerPayment(payment));

    let statementPayments = dedupeLaybyPaymentRows(customerPayments);
    if (isFahmeStatementLocked(customerId)) {
      statementPayments = filterLockedFahmePayments(statementPayments, customerId);
    } else if (
      isFahme(customerId)
      && !isFahmeAcc2(customerId, customer?.name)
      && !shouldUseFahmeLiveStatementOnly(customerId, customer?.name)
    ) {
      const fallbackKey = resolveFahmeFallbackKey(customerId, customer?.name);
      const fallbackRows = laybyPdfSettlementFallbacks[fallbackKey] || [];
      statementPayments = filterFahmePooledStatementPayments(customerPayments, fallbackRows);
    }

    const normalizedStatement = normalizeLaybyStatement({
      sales: statementSales,
      items: customerItems,
      payments: statementPayments,
    });

    const statementSaleIds = new Set(
      statementSales
        .map((sale) => String(sale?.sale_id ?? sale?.id ?? '').trim())
        .filter(Boolean)
    );

    const synthesizedSales = (laybysForTotals.length ? laybysForTotals : laybys)
      .map((layby) => {
        const saleIdRaw = String(layby?.sale_id ?? '').trim();
        const sale = saleIdRaw ? salesById.get(saleIdRaw) : null;
        const linkedQuote = resolveLinkedQuote({
          saleId: saleIdRaw,
          laybyId: layby?.id,
          quotationBySaleId,
          quotationByLaybyId,
        });
        const fin = saleIdRaw ? (financialsBySale.get(saleIdRaw) || {}) : {};
        const saleItems = saleIdRaw ? (itemsBySale.get(saleIdRaw) || []) : [];
        let totalAmount = Number(layby?.total_amount || 0);
        if (sale) {
          totalAmount = computeSaleLaybyTotalDue({ sale, fin, items: saleItems, linkedQuote });
        } else if (linkedQuote) {
          totalAmount = computeQuotationDisplayTotal(linkedQuote);
        }
        const paidAmount = Number(layby?.paid_amount || 0);
        const dueAmount = Math.max(0, totalAmount - paidAmount);
        if (dueAmount <= 0) return null;

        const syntheticSaleId = saleIdRaw || `layby:${layby.id}`;
        if (statementSaleIds.has(syntheticSaleId)) return null;

        const currency = normalizeCurrency(
          saleCurrencyById.get(String(layby?.sale_id || '')),
          normalizeCurrency(customer?.currency || 'K', 'K')
        );

        return {
          sale_id: syntheticSaleId,
          sale_date: layby?.updated_at || layby?.created_at || null,
          currency,
          layby_id: layby?.id || null,
          total_due: totalAmount,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          outstanding_amount: dueAmount,
          subtotal_before_discount: totalAmount,
          discount_amount: 0,
          vat_apply: Boolean(linkedQuote?.vat_apply || sale?.vat_apply),
          vat_rate: Number(linkedQuote?.vat_rate || sale?.vat_rate || 0),
          _synthetic: true,
        };
      })
      .filter(Boolean);

    let mergedStatement = normalizeLaybyStatement({
      sales: [...statementSales, ...synthesizedSales],
      items: normalizedStatement?.items || [],
      payments: normalizedStatement?.payments || [],
    });

    const statementTotalsByCurrency = computePooledLaybyTotalsByCurrency(mergedStatement);

    const hasStatementPayments = (mergedStatement?.payments || []).length > 0;
    const hasStatementSales = (mergedStatement?.sales || []).length > 0;
    let mergedTotalsByCurrency = { ...statementTotalsByCurrency };

    if (useSinglePooledLaybyTotals) {
      const pooledTotals = buildSinglePooledLaybyTotals({
        layby: laybysForTotals[0],
        statementSales,
        statementPayments,
        saleCurrencyById,
        customer,
      });
      if (pooledTotals) mergedTotalsByCurrency = pooledTotals;
    } else if (!hasStatementPayments && !hasStatementSales) {
      Object.entries(tableTotalsByCurrency).forEach(([currency, totals]) => {
        const existing = mergedTotalsByCurrency[currency];
        if (!existing || Number(existing?.due || 0) <= 0) {
          mergedTotalsByCurrency[currency] = { ...totals };
        }
      });
    } else {
      Object.entries(tableTotalsByCurrency).forEach(([currency, tableTotals]) => {
        const existing = mergedTotalsByCurrency[currency];
        if (!existing) {
          mergedTotalsByCurrency[currency] = { ...tableTotals };
          return;
        }
        if (Number(tableTotals.total || 0) > Number(existing.total || 0) + 0.5) {
          mergedTotalsByCurrency[currency] = {
            ...existing,
            total: Number(existing.total || 0),
            due: Number(existing.due || 0),
          };
        }
      });
    }

    const totalDue = sumDue(mergedTotalsByCurrency);
    const statementOutstandingTotal = statementSales.reduce(
      (sum, sale) => sum + Math.max(0, Number(sale.outstanding_amount || 0)),
      0,
    );
    const customerLaybyBySaleId = buildLaybyBySaleId(laybys);
    const allSalesOutstandingTotal = customerSales.reduce((sum, sale) => {
      const saleKey = String(sale?.id || '').trim();
      if (!saleKey || !isLaybyActivitySale(sale, customerLaybyBySaleId)) return sum;
      const layby = resolveLinkedLaybyForSale({
        sale,
        saleKey,
        laybyBySaleId: customerLaybyBySaleId,
        laybyById,
      });
      const fin = financialsBySale.get(saleKey) || {};
      const paymentAgg = paymentAggBySale.get(saleKey) || { paid: 0, paymentDiscount: 0 };
      return sum + computeAllSalesStyleOutstanding({ sale, layby, fin, paymentAgg });
    }, 0);
    const tableFallbackDue = useSinglePooledLaybyTotals
      ? sumDue(mergedTotalsByCurrency)
      : sumDue(tableTotalsByCurrency);
    const effectiveDue = Math.max(
      totalDue,
      statementOutstandingTotal,
      allSalesOutstandingTotal,
      tableFallbackDue,
    );

    if (effectiveDue <= 0.009) return;

    if (!useSinglePooledLaybyTotals && totalDue <= 0.009 && effectiveDue > 0.009) {
      Object.assign(
        mergedTotalsByCurrency,
        patchTotalsFromOutstandingSales(mergedTotalsByCurrency, statementSales, customer),
      );
      if (sumDue(mergedTotalsByCurrency) <= 0.009 && tableFallbackDue > 0.009) {
        Object.entries(tableTotalsByCurrency).forEach(([currency, totals]) => {
          if (!mergedTotalsByCurrency[currency] || Number(mergedTotalsByCurrency[currency]?.due || 0) <= 0) {
            mergedTotalsByCurrency[currency] = { ...totals };
          }
        });
      }
    }

    let statementLocked = false;
    if (isFahmeStatementLocked(customerId)) {
      const locked = applyFahmeStatementLock(customerId, {
        sales: mergedStatement?.sales || [],
        items: mergedStatement?.items || [],
        payments: mergedStatement?.payments || [],
      });
      if (locked.statementLocked) {
        statementLocked = true;
        mergedStatement = normalizeLaybyStatement({
          sales: locked.sales,
          items: locked.items,
          payments: locked.payments,
        });
        mergedTotalsByCurrency = locked.totalsByCurrency || mergedTotalsByCurrency;
      }
    }

    const activeStatement = filterStatementToOutstandingSales(mergedStatement);
    const outstandingSales = activeStatement?.sales || [];

    const primaryLayby = laybysForTotals
      .slice()
      .sort((left, right) => toTime(right.updated_at || right.created_at) - toTime(left.updated_at || left.created_at))[0]
      || laybys
        .slice()
        .sort((left, right) => toTime(right.updated_at || right.created_at) - toTime(left.updated_at || left.created_at))[0]
      || outstandingSales
        .slice()
        .sort((left, right) => toTime(right.sale_date || right.created_at) - toTime(left.sale_date || left.created_at))
        .map((sale) => ({
          id: null,
          sale_id: sale.sale_id || sale.id || null,
          customer_id: customerId,
          status: 'layby',
          total_amount: Number(sale.total_due || sale.total_amount || 0),
          paid_amount: Number(sale.paid_amount || 0),
          updated_at: sale.sale_date || sale.created_at || null,
          created_at: sale.sale_date || sale.created_at || null,
          origin: 'statement',
        }))[0]
      || null;

    const lastUpdated = Math.max(
      0,
      ...laybys.map((layby) => toTime(layby.updated_at || layby.created_at)),
      ...statementSales.map((sale) => toTime(sale.sale_date || sale.created_at))
    );

    const linkedQuote = resolveCustomerLinkedQuote({
      customerId,
      laybys,
      statementSales,
      quotationBySaleId,
      quotationByLaybyId,
      quotationsByCustomerId,
    });

    built.push({
      customerId,
      customer,
      statement: activeStatement,
      fullStatement: mergedStatement,
      totalsByCurrency: mergedTotalsByCurrency,
      linkedQuoteId: linkedQuote?.id || null,
      totalsDebug: {
        source: statementLocked ? 'signed_off_pdf_lock' : 'bulk_statement+table_fallback',
        saleCount: mergedStatement?.sales?.length || 0,
        outstandingSaleCount: outstandingSales.length,
        groupedPayments: (mergedStatement?.payments || []).length,
        tableFallbackDue: sumDue(tableTotalsByCurrency),
        statementError: null,
        statementLocked,
      },
      laybys,
      primaryLayby,
      lastUpdated,
      statementLocked,
    });
  });

  built.sort((left, right) => {
    const leftName = String(left?.customer?.name || left?.customerId || '').trim().toLowerCase();
    const rightName = String(right?.customer?.name || right?.customerId || '').trim().toLowerCase();
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base', numeric: true });
  });
  return built;
}