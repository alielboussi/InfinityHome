import db from '../dataClient';
import {
  applyQuotationTotalsFromItems,
  computeQuotationDisplayTotal,
} from '../utils/quotationDisplay';

const IN_CHUNK = 30;

async function loadQuotationItemsByQuoteIds(quoteIds = []) {
  const map = new Map();
  const ids = Array.from(new Set((quoteIds || []).filter(Boolean).map(String)));
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await db
      .from('quotation_items')
      .select('quotation_id, quantity, unit_price')
      .in('quotation_id', chunk);
    if (error) throw error;
    (data || []).forEach((row) => {
      const key = String(row.quotation_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
  }
  return map;
}

/** Fix quote list rows that show Total 0.00 despite priced line items. */
export async function enrichQuotationListTotals(quotes = []) {
  const rows = Array.isArray(quotes) ? quotes : [];
  const needsItems = rows.filter((q) => computeQuotationDisplayTotal(q) <= 0.009);
  if (!needsItems.length) return rows;

  const itemsByQuoteId = await loadQuotationItemsByQuoteIds(needsItems.map((q) => q.id));
  return rows.map((q) => {
    const items = itemsByQuoteId.get(String(q.id));
    if (!items?.length) return q;
    return applyQuotationTotalsFromItems(q, items);
  });
}
