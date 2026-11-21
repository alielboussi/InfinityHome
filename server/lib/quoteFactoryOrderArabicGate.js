import {
  collectFactoryOrderArabicCheckPhrases,
  collectProductionQuoteArabicPhrases,
  expandArabicPhraseVariants,
  fillFactoryOrderArabicMapGaps,
  translateStringsToArabicServer,
} from './quoteArabicTranslate.js';

function enrichPhraseSetFromItems(phraseSet, items) {
  for (const it of items || []) {
    const rawName = String(
      it?.name_override || it?.name || it?.product_name || it?.quote_product_name || it?.description || '',
    ).trim();
    if (rawName) {
      phraseSet.add(rawName);
      phraseSet.add(rawName.charAt(0).toUpperCase() + rawName.slice(1));
    }
    const desc = String(it?.description || '').trim();
    if (desc) phraseSet.add(desc);
  }
}

/**
 * Block factory order PDF WhatsApp until every quote line phrase has full Arabic (same rules as web PDF).
 */
export async function assertQuoteArabicReadyForFactoryPdfWhatsApp(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  if (!qid) {
    const err = new Error('quote_id is required before sending the factory order PDF to WhatsApp.');
    err.status = 400;
    throw err;
  }

  const { data: items, error } = await sb
    .from('quotation_items')
    .select('*')
    .eq('quotation_id', qid)
    .order('sort_order');
  if (error) throw new Error(error.message || 'Failed to load quote items for Arabic check.');
  const rawItems = items || [];
  const qpIds = [...new Set(rawItems.map((it) => it?.quote_product_id).filter(Boolean).map(String))];
  let productById = new Map();
  if (qpIds.length) {
    const { data: qps } = await sb.from('quotation_products').select('id, name, description').in('id', qpIds);
    productById = new Map((qps || []).map((p) => [String(p.id), p]));
  }
  const rows = rawItems.map((it) => ({
    ...it,
    name: String(it?.name_override || it?.name || productById.get(String(it?.quote_product_id))?.name || '').trim(),
    description: String(it?.description || productById.get(String(it?.quote_product_id))?.description || '').trim() || it?.description,
  }));

  const phraseSet = new Set(collectProductionQuoteArabicPhrases(rows));
  enrichPhraseSetFromItems(phraseSet, rows);
  const phrases = expandArabicPhraseVariants([...phraseSet]);
  const map = fillFactoryOrderArabicMapGaps(
    collectFactoryOrderArabicCheckPhrases(rows),
    await translateStringsToArabicServer(phrases, { sb, maxGeminiRounds: 2, maxGeminiPhrases: 40 }),
  );
  void map;
}