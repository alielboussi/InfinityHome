/** Re-export from web source of truth (Metro resolves repo src). */
export {
  ARABIC_TERMS,
  WORD_FALLBACKS,
  lookupStaticArabic,
  fallbackTranslatePhraseToArabic,
  translateTermToArabic,
  translateQtyUnitLabel,
  formatQuoteLineQtyLabel,
  collectProductionQuoteArabicPhrases,
  displayQuoteFieldValue,
  toArabicIndicDigits,
  formatNumeralsForLocale,
  formatQuoteDimensionsCmDisplay,
} from '../../src/utils/quoteArabicTranslate.js';
