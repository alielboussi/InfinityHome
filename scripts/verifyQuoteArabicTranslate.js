/**
 * Factory order Arabic: server translator export + filling-cabinet fallback.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  phraseStillHasEnglishWords,
  translateTermToArabic,
} from '../src/utils/quoteArabicTranslate.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverLib = readFileSync(path.join(root, 'server/lib/quoteArabicTranslate.js'), 'utf8');
const gateLib = readFileSync(path.join(root, 'server/lib/quoteFactoryOrderArabicGate.js'), 'utf8');
const notify = readFileSync(path.join(root, 'api/notify.js'), 'utf8');
const quoteProd = readFileSync(path.join(root, 'server/handlers/quote-production.js'), 'utf8');
const factoryPdf = readFileSync(path.join(root, 'src/utils/quoteFactoryOrderPdf.js'), 'utf8');

if (!serverLib.includes('export async function translateStringsToArabicServer')) {
  console.error('[verifyQuoteArabicTranslate] missing translateStringsToArabicServer');
  process.exit(1);
}
if (!gateLib.includes('assertQuoteArabicReadyForFactoryPdfWhatsApp')) {
  console.error('[verifyQuoteArabicTranslate] missing factory PDF Arabic gate');
  process.exit(1);
}
if (notify.includes('assertQuoteArabicReadyForFactoryPdfWhatsApp')) {
  console.error('[verifyQuoteArabicTranslate] WhatsApp factory send must not block on Arabic translation');
  process.exit(1);
}
if (quoteProd.includes('assertQuoteArabicReadyForFactoryPdfWhatsApp')) {
  console.error('[verifyQuoteArabicTranslate] deliver-factory-order must not block on Arabic translation');
  process.exit(1);
}
if (!factoryPdf.includes('translateQuoteStringsToArabicComplete')) {
  console.error('[verifyQuoteArabicTranslate] factory PDF must use complete Arabic translation');
  process.exit(1);
}

const catalog = readFileSync(path.join(root, 'server/lib/quoteQuotationProductArabicCatalog.js'), 'utf8');
if (!catalog.includes('getQuotationProductArabicMap')) {
  console.error('[verifyQuoteArabicTranslate] missing quotation product Arabic catalog');
  process.exit(1);
}

import {
  translateProductLineNameToArabic,
  translateSlashDimensionDescriptionToArabic,
} from '../src/utils/quoteArabicTranslate.js';

const sample = 'Filling cabinet sliding door (with vineer)';
const titled = sample.charAt(0).toUpperCase() + sample.slice(1);
const ar = translateTermToArabic(titled, {});
if (!ar || phraseStillHasEnglishWords(ar)) {
  console.error('[verifyQuoteArabicTranslate] static/fallback must fully translate sample line:', ar);
  process.exit(1);
}

const book = translateProductLineNameToArabic('Book shelf (rosewood)', {});
if (!book || phraseStillHasEnglishWords(book)) {
  console.error('[verifyQuoteArabicTranslate] book shelf rosewood:', book);
  process.exit(1);
}

const dim = translateSlashDimensionDescriptionToArabic('Length 313 Cm/ Height 78cm/ Depth 60cm', {});
if (!dim || phraseStillHasEnglishWords(dim)) {
  console.error('[verifyQuoteArabicTranslate] slash dimensions:', dim);
  process.exit(1);
}

console.log('[verifyQuoteArabicTranslate] ok');