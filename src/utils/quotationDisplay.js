export function normalizeQuotationItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    name: row.name_override || row.name || row.product_name || '',
    description: row.description || '',
    quantity: row.quantity == null || row.quantity === '' ? '' : row.quantity,
    unit_price: row.unit_price == null || row.unit_price === '' ? '' : row.unit_price,
  };
}

/** Match edit-page totals: VAT @ 16% adds VAT on top; VAT Exclusive does not. */
export function computeQuotationTotals({ subtotal = 0, discount = 0, vatApply = false, vatRate = 0.16 } = {}) {
  const safeSubtotal = Number(subtotal || 0);
  const safeDiscount = Number(discount || 0);
  const afterDiscount = Math.max(safeSubtotal - safeDiscount, 0);

  if (!vatApply) {
    return {
      subtotal: safeSubtotal,
      discount: safeDiscount,
      vatAmount: 0,
      total: afterDiscount,
      vatInclusive: false,
    };
  }

  const rate = Number(vatRate) > 0 ? Number(vatRate) : 0.16;
  const vatAmount = afterDiscount * rate;
  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    vatAmount,
    total: afterDiscount + vatAmount,
    vatInclusive: false,
  };
}

export function computeQuotationDisplayTotal(quote) {
  if (!quote) return 0;
  const subtotal = Number(quote.subtotal);
  const discount = Number(quote.discount || 0);
  const storedTotal = Number(quote.total || 0);
  const effectiveSubtotal = Number.isFinite(subtotal) && subtotal >= 0
    ? subtotal
    : (storedTotal > 0 ? storedTotal : 0);
  const vatApply = resolveQuoteVatApply(quote, effectiveSubtotal, discount);

  if (effectiveSubtotal > 0 || storedTotal > 0) {
    return computeQuotationTotals({
      subtotal: effectiveSubtotal,
      discount,
      vatApply,
      vatRate: vatApply ? (Number(quote.vat_rate) > 0 ? Number(quote.vat_rate) : 0.16) : 0,
    }).total;
  }
  return storedTotal;
}

export function resolveQuoteVatApply(quote, subtotal, discount = 0) {
  if (Boolean(quote?.vat_apply)) return true;
  const afterDiscount = Math.max(0, Number(subtotal || 0) - Number(discount || 0));
  const storedTotal = Number(quote?.total || 0);
  const rate = Number(quote?.vat_rate) > 0 ? Number(quote.vat_rate) : 0.16;
  if (afterDiscount > 0 && storedTotal > afterDiscount + 0.009) {
    const withVat = afterDiscount * (1 + rate);
    if (Math.abs(storedTotal - withVat) < 1) return true;
  }
  return false;
}

export function computeQuoteLaybyTotal({ quote, subtotal, discount }) {
  const effectiveSubtotal = Number(subtotal || 0) > 0
    ? Number(subtotal)
    : Number(quote?.subtotal || 0);
  const effectiveDiscount = discount ?? quote?.discount ?? 0;
  const vatApply = resolveQuoteVatApply(quote, effectiveSubtotal, effectiveDiscount);

  return computeQuotationTotals({
    subtotal: effectiveSubtotal,
    discount: effectiveDiscount,
    vatApply,
    vatRate: vatApply ? (Number(quote?.vat_rate) > 0 ? Number(quote.vat_rate) : 0.16) : 0,
  }).total;
}

export function computeSaleLaybyTotalDue({ sale, fin, items, linkedQuote }) {
  const itemSubtotal = (items || []).reduce(
    (sum, item) => sum + Number(item?.quantity || 0) * Number(item?.unit_price || 0),
    0,
  );
  const subtotal = itemSubtotal > 0
    ? itemSubtotal
    : Number(fin?.subtotal_before_discount || sale?.total_amount || linkedQuote?.subtotal || 0);
  const discount = Number(sale?.discount ?? fin?.discount_amount ?? linkedQuote?.discount ?? 0);

  if (linkedQuote) {
    return computeQuotationDisplayTotal({
      ...linkedQuote,
      subtotal: subtotal > 0 ? subtotal : Number(linkedQuote.subtotal || 0),
      discount,
    });
  }

  const vatApply = Boolean(sale?.vat_apply)
    || Number(sale?.vat_rate || 0) > 0
    || resolveQuoteVatApply({
      vat_apply: sale?.vat_apply,
      vat_rate: sale?.vat_rate,
      subtotal,
      total: fin?.total_due ?? sale?.total_amount,
      discount,
    }, subtotal, discount);

  const computed = computeQuotationTotals({
    subtotal,
    discount,
    vatApply,
    vatRate: vatApply ? (Number(sale?.vat_rate) || 0.16) : 0,
  }).total;
  const reported = Number(fin?.total_due ?? sale?.total_amount ?? 0);
  if (vatApply && computed > reported + 0.009) return computed;
  if (reported > 0 && Math.abs(reported - computed) < 1) return reported;
  return computed > 0 ? computed : reported;
}

export async function resolveQuoteCustomerForSelect(hdr, quoteCustomers, db) {
  const catalog = Array.isArray(quoteCustomers) ? quoteCustomers : [];
  if (!hdr?.customer_id) return { header: hdr, customers: catalog };

  const customerId = String(hdr.customer_id);
  if (catalog.some((c) => String(c.id) === customerId)) {
    return { header: hdr, customers: catalog };
  }

  let extraCustomer = null;
  try {
    const { data: qc } = await db
      .from('quote_customers')
      .select('id, name, currency, phone')
      .eq('id', customerId)
      .maybeSingle();
    if (qc) extraCustomer = qc;
  } catch {}

  if (!extraCustomer) {
    try {
      const { data: cust } = await db
        .from('customers')
        .select('id, name, currency, phone')
        .eq('id', customerId)
        .maybeSingle();
      if (cust) {
        const match = catalog.find((c) => (
          (cust.phone && c.phone && String(c.phone) === String(cust.phone))
          || (cust.name && String(c.name || '').toLowerCase() === String(cust.name || '').toLowerCase())
        ));
        if (match) {
          return { header: { ...hdr, customer_id: match.id }, customers: catalog };
        }
        extraCustomer = {
          id: cust.id,
          name: cust.name,
          currency: cust.currency || 'K',
          phone: cust.phone || null,
        };
      }
    } catch {}
  }

  if (extraCustomer) {
    return {
      header: { ...hdr, customer_id: extraCustomer.id },
      customers: [...catalog, extraCustomer],
    };
  }

  return { header: hdr, customers: catalog };
}

function parseQuoteNumberValue(quoteNumber) {
  const match = String(quoteNumber || '').match(/^QT#(\d+)$/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** Newest quotes first; falls back to quote number then id when dates are missing. */
export function sortQuotationRows(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a.updated_at || a.created_at || '');
    const bStamp = String(b.updated_at || b.created_at || '');
    const createdCmp = bStamp.localeCompare(aStamp);
    if (createdCmp !== 0) return createdCmp;

    const numCmp = parseQuoteNumberValue(b.quote_number) - parseQuoteNumberValue(a.quote_number);
    if (numCmp !== 0) return numCmp;

    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function sumPaymentRows(payments = []) {
  return (payments || []).reduce((sum, row) => (
    sum + Number(row?.amount || 0) + Number(row?.discount_amount || 0)
  ), 0);
}

export function quotationHasOutstandingDue(quote, paidAmount = 0) {
  const total = computeQuotationDisplayTotal(quote);
  const paid = Number(paidAmount || 0);
  return Math.max(0, total - paid) > 0.009;
}
