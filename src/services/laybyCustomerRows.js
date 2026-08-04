import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { fetchCanonicalFinancials } from '../utils/financials';
import { normalizeLaybyStatement } from '../utils/laybyStatementNormalize';
import { computePooledLaybyTotalsByCurrency, filterFahmePooledStatementPayments, filterStatementToOutstandingSales, resolveNegotiatedGrossSubtotal } from '../utils/laybyRollup';
import { computeQuotationDisplayTotal, computeSaleLaybyTotalDue, resolveQuoteVatApply } from '../utils/quotationDisplay';
import { fetchMergedLaybyPayments } from './laybyPayments';
import { isFahme } from '../laybyRules';
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
      .not('customer_id', 'is', null),
    fromPublic('layby_payments')
      .select('customer_id, sale_id')
      .not('customer_id', 'is', null),
    fromPublic('sales')
      .select('id, sale_id, customer_id, status, layby_id, sale_date, created_at, currency, total_amount, vat_apply, vat_rate, discount')
      .not('customer_id', 'is', null)
      .or('status.eq.layby,layby_id.not.is.null'),
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

  const ids = Array.from(customerIds);
  if (!ids.length) return [];

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

  const { data: customerRows, error: custErr } = await fromPublic('customers')
    .select('id, name, phone, currency')
    .in('id', ids);
  if (custErr) throw custErr;

  const laybyIdSet = new Set(
    (laybyRowsSeed || [])
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean)
  );

  const salesById = new Map();
  (salesSeedRows || []).forEach((sale) => {
    const saleId = String(sale?.id || '').trim();
    if (!saleId) return;
    salesById.set(saleId, sale);
  });

  const missingSaleIds = laybySaleIds.filter((saleId) => !salesById.has(String(saleId)));
  if (missingSaleIds.length) {
    const chunks = chunkArray(missingSaleIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await fromPublic('sales')
        .select('id, sale_id, customer_id, status, layby_id, sale_date, created_at, currency, total_amount, vat_apply, vat_rate, discount')
        .in('id', chunk);
      if (error) throw error;
      (data || []).forEach((sale) => {
        const saleId = String(sale?.id || '').trim();
        if (!saleId) return;
        salesById.set(saleId, sale);
      });
    }
  }

  const candidateSales = Array.from(salesById.values()).filter((sale) => {
    const saleId = String(sale?.id || '').trim();
    const laybyId = String(sale?.layby_id || '').trim();
    const status = String(sale?.status || '').trim().toLowerCase();
    return laybyIdSet.has(laybyId)
      || status === 'layby'
      || laybySaleIds.includes(sale?.id)
      || paymentSaleIdSet.has(saleId);
  });

  const salesByCustomer = new Map();
  candidateSales.forEach((sale) => {
    const customerId = String(sale?.customer_id || '').trim();
    if (!customerId) return;
    if (!salesByCustomer.has(customerId)) salesByCustomer.set(customerId, []);
    salesByCustomer.get(customerId).push(sale);
  });

  const candidateSaleIds = Array.from(
    new Set(candidateSales.map((sale) => sale?.id).filter((saleId) => saleId != null))
  );

  const financialsBySale = await fetchCanonicalFinancials(db, candidateSaleIds);

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
  const paymentRowKey = (payment) => [
    payment?.sale_id || '',
    payment?.payment_date || '',
    Number(payment?.amount || 0),
    Number(payment?.discount_amount || 0),
    String(payment?.payment_type || '').toLowerCase(),
    String(payment?.reference || ''),
    String(payment?.notes || ''),
    String(payment?.allocation_batch_uuid || ''),
  ].join('|');

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
        const saleIdsForCustomer = (salesByCustomer.get(cid) || []).map((sale) => sale?.id).filter(Boolean);
        let saleId = String(payment?.sale_id || '').trim();
        if (!saleId && saleIdsForCustomer.length) {
          saleId = String(saleIdsForCustomer[0] || '').trim();
        }
        if (!saleId) return;
        if (!paymentsBySale.has(saleId)) paymentsBySale.set(saleId, []);
        const bucket = paymentsBySale.get(saleId);
        const key = paymentRowKey(payment);
        if (bucket.some((row) => paymentRowKey(row) === key)) return;
        bucket.push({ ...payment, payment_type: String(payment?.payment_type || '').toLowerCase() });
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
    const laybys = byCustomer.get(customerId) || [];
    const activeLaybys = laybys.filter((layby) => isActiveLaybyStatus(layby?.status));
    const pdfTaggedSaleIds = new Set(
      (laybys || [])
        .filter((layby) => String(layby?.notes || '').toUpperCase().includes('PDF_ITEM_RESTORE_20260610'))
        .map((layby) => String(layby?.sale_id || '').trim())
        .filter(Boolean)
    );

    const tableTotalsByCurrency = {};
    activeLaybys.forEach((layby) => {
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
      const itemSubtotal = saleItems.reduce(
        (sum, item) => sum + Number(item?.quantity || 0) * Number(item?.unit_price || 0),
        0,
      );
      const grossTotal = resolveNegotiatedGrossSubtotal({
        itemSubtotal,
        subtotalBeforeDiscount: Number(fin?.subtotal_before_discount || linkedQuote?.subtotal || 0),
        saleDiscount: discountAmount,
        canonicalTotal: Number(sale?.total_amount || totalAmount),
      });
      const paidAmount = Number(layby?.paid_amount || 0);
      const paymentDiscountAmount = Number(paymentAgg?.paymentDiscount || 0);
      const dueAmount = Math.max(0, grossTotal - discountAmount - paidAmount - paymentDiscountAmount);
      if (dueAmount <= 0) return;

      const currency = normalizeCurrency(
        saleCurrencyById.get(String(layby?.sale_id || '')),
        normalizeCurrency(customer?.currency || 'K', 'K')
      );

      if (!tableTotalsByCurrency[currency]) {
        tableTotalsByCurrency[currency] = { total: 0, paid: 0, discount: 0, due: 0 };
      }

      tableTotalsByCurrency[currency].total += grossTotal;
      tableTotalsByCurrency[currency].paid += paidAmount;
      tableTotalsByCurrency[currency].discount += discountAmount + paymentDiscountAmount;
      tableTotalsByCurrency[currency].due += dueAmount;
    });

    const customerSalesRaw = (salesByCustomer.get(customerId) || [])
      .filter((sale) => {
        if (!pdfTaggedSaleIds.size) return true;
        return pdfTaggedSaleIds.has(String(sale?.id || '').trim());
      })
      .slice();
    const hasPdfBusinessSales = customerSalesRaw.some((sale) => String(sale?.sale_id || '').toUpperCase().startsWith('PDF-'));
    const customerSales = (hasPdfBusinessSales
      ? customerSalesRaw.filter((sale) => String(sale?.sale_id || '').toUpperCase().startsWith('PDF-'))
      : customerSalesRaw)
      .slice();
    customerSales.sort((left, right) => toTime(left?.sale_date || left?.created_at) - toTime(right?.sale_date || right?.created_at));

    const customerLaybyPaymentTotal = customerSales.reduce((sum, sale) => {
      const saleKey = String(sale?.id || '').trim();
      if (!saleKey) return sum;
      return sum + (paymentsBySale.get(saleKey) || []).reduce((saleSum, payment) => (
        saleSum + Number(payment?.amount || 0)
      ), 0);
    }, 0);

    const statementSales = customerSales.map((sale) => {
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
      const totalDue = computeSaleLaybyTotalDue({ sale, fin, items: saleItems, linkedQuote });
      const finPaid = Number(fin?.paid_amount || 0);
      const paidAmount = Math.max(finPaid, Number(paymentAgg?.paid || 0));
      const discountAmount = Number(sale?.discount ?? fin?.discount_amount ?? linkedQuote?.discount ?? 0);
      const paymentDiscountAmount = Number(paymentAgg?.paymentDiscount || 0);
      const dueFallback = Math.max(0, totalDue - paidAmount - Math.max(0, paymentDiscountAmount));
      const finOutstanding = Number(fin?.outstanding_amount);
      const hasFinOutstanding = Number.isFinite(finOutstanding);
      const finLooksStale = hasFinOutstanding
        && customerLaybyPaymentTotal > 0
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
        vat_apply: vatApply,
        vat_rate: vatRate,
      };
    });

    const customerItems = [];
    const customerPayments = [];
    statementSales.forEach((sale) => {
      const saleKey = String(sale?.sale_id || '').trim();
      if (!saleKey) return;
      (itemsBySale.get(saleKey) || []).forEach((item) => customerItems.push(item));
      (paymentsBySale.get(saleKey) || []).forEach((payment) => customerPayments.push(payment));
    });

    let statementPayments = customerPayments;
    if (isFahme(customerId)) {
      const fallbackRows = [
        ...(laybyPdfSettlementFallbacks['mohammad fahme'] || []),
        ...(laybyPdfSettlementFallbacks['mohammad fahme acc(2)'] || []),
      ];
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

    const activeLaybysForSynthesis = (pdfTaggedSaleIds.size
      ? activeLaybys.filter((layby) => pdfTaggedSaleIds.has(String(layby?.sale_id || '').trim()))
      : activeLaybys);

    const synthesizedSales = activeLaybysForSynthesis
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

    const mergedStatement = normalizeLaybyStatement({
      sales: [...statementSales, ...synthesizedSales],
      items: normalizedStatement?.items || [],
      payments: normalizedStatement?.payments || [],
    });

    const statementTotalsByCurrency = computePooledLaybyTotalsByCurrency(mergedStatement);

    const hasStatementPayments = (mergedStatement?.payments || []).length > 0;
    const hasStatementSales = (mergedStatement?.sales || []).length > 0;
    const mergedTotalsByCurrency = { ...statementTotalsByCurrency };
    if (!hasStatementPayments && !hasStatementSales) {
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
    if (totalDue <= 0) return;

    const activeStatement = filterStatementToOutstandingSales(mergedStatement);
    const outstandingSales = activeStatement?.sales || [];

    const primaryLayby = activeLaybys
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
        source: 'bulk_statement+table_fallback',
        saleCount: mergedStatement?.sales?.length || 0,
        outstandingSaleCount: outstandingSales.length,
        groupedPayments: (normalizedStatement?.payments || []).length,
        tableFallbackDue: sumDue(tableTotalsByCurrency),
        statementError: null,
      },
      laybys,
      primaryLayby,
      lastUpdated,
    });
  });

  built.sort((left, right) => {
    const leftName = String(left?.customer?.name || left?.customerId || '').trim().toLowerCase();
    const rightName = String(right?.customer?.name || right?.customerId || '').trim().toLowerCase();
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base', numeric: true });
  });
  return built;
}