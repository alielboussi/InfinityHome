import { quoteLineOrderDisplayName } from '../../src/utils/quoteProductionItemFields.js';

export function formatQuoteOrderLinesTitle(lines) {
  const parts = (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const name = String(line?.name || '').trim();
      if (!name) return '';
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      return qty > 1 ? `${name} ×${qty}` : name;
    })
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts.join(' · ');
}

async function attachQuoteProducts(sb, items) {
  const list = Array.isArray(items) ? items : [];
  const qpIds = [...new Set(
    list.map((it) => String(it?.quote_product_id || '').trim()).filter(Boolean),
  )];
  if (!qpIds.length) return new Map();
  const { data: qps } = await sb
    .from('quotation_products')
    .select('id, name')
    .in('id', qpIds);
  return new Map((qps || []).map((p) => [String(p.id), p]));
}

export function mapQuoteItemsToOrderDisplayLines(items, productById = new Map()) {
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const name = quoteLineOrderDisplayName(
        it,
        productById.get(String(it?.quote_product_id || '')),
      );
      if (!name) return null;
      return {
        id: it.id || null,
        name,
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      };
    })
    .filter(Boolean);
}

export async function loadQuoteOrderDisplayLines(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  if (!qid) return { quote_id: '', quote_number: null, lines: [], title: '' };
  const [{ data: quote }, { data: items }] = await Promise.all([
    sb.from('quotations').select('id, quote_number').eq('id', qid).maybeSingle(),
    sb.from('quotation_items').select('*').eq('quotation_id', qid).order('sort_order'),
  ]);
  const productById = await attachQuoteProducts(sb, items || []);
  const lines = mapQuoteItemsToOrderDisplayLines(items || [], productById);
  return {
    quote_id: qid,
    quote_number: quote?.quote_number || null,
    lines,
    title: formatQuoteOrderLinesTitle(lines),
  };
}

export async function loadQuoteOrderDisplayLinesByIds(sb, quoteIds) {
  const ids = [...new Set((quoteIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const [{ data: quotes }, { data: items }] = await Promise.all([
    sb.from('quotations').select('id, quote_number').in('id', ids),
    sb.from('quotation_items').select('*').in('quotation_id', ids).order('sort_order'),
  ]);
  const productById = await attachQuoteProducts(sb, items || []);
  const itemsByQuote = new Map();
  for (const it of items || []) {
    const qid = String(it.quotation_id || '').trim();
    if (!qid) continue;
    if (!itemsByQuote.has(qid)) itemsByQuote.set(qid, []);
    itemsByQuote.get(qid).push(it);
  }
  const quoteById = new Map((quotes || []).map((q) => [String(q.id), q]));
  for (const qid of ids) {
    const lines = mapQuoteItemsToOrderDisplayLines(itemsByQuote.get(qid) || [], productById);
    out.set(qid, {
      quote_id: qid,
      quote_number: quoteById.get(qid)?.quote_number || null,
      lines,
      title: formatQuoteOrderLinesTitle(lines),
    });
  }
  return out;
}
