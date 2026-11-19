import { expandArabicPhraseVariants, translateStringsToArabicServer } from './quoteArabicTranslate.js';

const CATALOG_TTL_MS = 5 * 60 * 1000;

let catalogCache = {
  expiresAt: 0,
  map: {},
};

export function invalidateQuotationProductArabicCache() {
  catalogCache = { expiresAt: 0, map: {} };
}

async function loadQuotationProductPhrases(sb) {
  const { data, error } = await sb
    .from('quotation_products')
    .select('name, description')
    .order('name');
  if (error) throw new Error(error.message || 'Failed to load quotation products');
  const raw = [];
  for (const row of data || []) {
    if (row?.name) raw.push(String(row.name).trim());
    if (row?.description) raw.push(String(row.description).trim());
  }
  return expandArabicPhraseVariants(raw);
}

/**
 * Pre-translate every Hassan quotationer catalog product (Products tab) for factory PDF / translate-arabic.
 */
export async function getQuotationProductArabicMap(sb, { force = false } = {}) {
  if (!sb) return {};
  const now = Date.now();
  if (!force && catalogCache.expiresAt > now && Object.keys(catalogCache.map).length > 0) {
    return catalogCache.map;
  }
  const phrases = await loadQuotationProductPhrases(sb);
  if (!phrases.length) {
    catalogCache = { expiresAt: now + CATALOG_TTL_MS, map: {} };
    return {};
  }
  const map = await translateStringsToArabicServer(phrases, {
    maxGeminiRounds: 3,
    skipCatalogMerge: true,
  });
  catalogCache = { expiresAt: now + CATALOG_TTL_MS, map };
  return map;
}

export async function mergeQuotationCatalogIntoTranslationMap(sb, requestMap = {}) {
  const catalog = await getQuotationProductArabicMap(sb);
  return { ...catalog, ...requestMap };
}