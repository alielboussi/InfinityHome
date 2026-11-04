/**
 * Every Production create preset must have a dedicated AI retouch subject line.
 * Mattresses must not use AI retouch (furniture only).
 */
import {
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_SEATER_PRESETS,
} from '../src/utils/productionItemName.js';
import {
  PRODUCTION_PHOTO_PRESET_SUBJECT,
  buildProductionPhotoRetouchPrompt,
  inferProductionPresetFromProductName,
} from '../server/lib/productionPhotoRetouchPrompt.js';
import { isMattressCatalogProductName } from '../src/utils/isMattressCatalogProductName.js';
import { isReclinerCatalogProduct } from '../src/utils/isReclinerCatalogProduct.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const retouchSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/lib/productionSeatingPhotoRetouch.js'),
  'utf8',
);
if (!retouchSrc.includes('centerTrimmedOnCatalogSquare') || !retouchSrc.includes("fit: 'contain'")) {
  console.error('[verifyProductionPhotoRetouchPrompts] catalog JPEG finalize must trim and letterbox to square (contain, no stretch)');
  process.exit(1);
}

for (const preset of [...PRODUCTION_SEATER_PRESETS, ...PRODUCTION_CARPENTRY_PRESETS]) {
  if (!PRODUCTION_PHOTO_PRESET_SUBJECT[preset]) {
    console.error('[verifyProductionPhotoRetouchPrompts] missing subject for', preset);
    process.exit(1);
  }
  const prompt = buildProductionPhotoRetouchPrompt({ preset });
  if (!prompt.includes('pure white') || !prompt.includes(preset)) {
    console.error('[verifyProductionPhotoRetouchPrompts] invalid prompt for', preset);
    process.exit(1);
  }
}

if (inferProductionPresetFromProductName('Amara Curtains') !== 'Curtains') {
  console.error('[verifyProductionPhotoRetouchPrompts] Curtains infer failed');
  process.exit(1);
}
if (inferProductionPresetFromProductName('Layla Pillows') !== 'Pillows') {
  console.error('[verifyProductionPhotoRetouchPrompts] Pillows infer failed');
  process.exit(1);
}

if (!isMattressCatalogProductName('Sleep Comfort Mattress 120*200')) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress name detect failed');
  process.exit(1);
}

try {
  buildProductionPhotoRetouchPrompt({ productName: 'Grand Luxury Mattress 200*200' });
  console.error('[verifyProductionPhotoRetouchPrompts] mattress must not build AI retouch prompt');
  process.exit(1);
} catch (err) {
  if (!/mattress/i.test(String(err?.message || ''))) {
    console.error('[verifyProductionPhotoRetouchPrompts] unexpected mattress prompt error:', err?.message);
    process.exit(1);
  }
}

const reclinerPrompt = buildProductionPhotoRetouchPrompt({
  productName: 'Layla 3 Seater',
  categoryName: '3 Seaters',
});
if (!reclinerPrompt.includes('recliner sofa') || !reclinerPrompt.includes('RECLINER CATALOG')) {
  console.error('[verifyProductionPhotoRetouchPrompts] recliner catalog prompt missing recliner block');
  process.exit(1);
}
if (!reclinerPrompt.includes('ORIENTATION') || !/parallel to the bottom edge/i.test(reclinerPrompt)) {
  console.error('[verifyProductionPhotoRetouchPrompts] recliner prompt missing orientation block');
  process.exit(1);
}
if (!reclinerPrompt.includes('landscape phone') || !/portrait or landscape/i.test(reclinerPrompt)) {
  console.error('[verifyProductionPhotoRetouchPrompts] recliner prompt missing landscape phone capture');
  process.exit(1);
}
if (!/Zoom OUT/i.test(reclinerPrompt) || !/45–60%/i.test(reclinerPrompt)) {
  console.error('[verifyProductionPhotoRetouchPrompts] recliner prompt missing zoom-out framing block');
  process.exit(1);
}

const anyFurniturePrompt = buildProductionPhotoRetouchPrompt({
  productName: 'Amara Coffee Table',
  categoryName: 'Coffee Tables',
});
if (!/portrait or landscape/i.test(anyFurniturePrompt)) {
  console.error('[verifyProductionPhotoRetouchPrompts] furniture prompt missing source phone capture block');
  process.exit(1);
}

const sofaPrompt = buildProductionPhotoRetouchPrompt({
  productName: 'Layla Coffee Table',
  categoryName: 'Coffee Tables',
});
if (sofaPrompt.includes('RECLINER CATALOG')) {
  console.error('[verifyProductionPhotoRetouchPrompts] carpentry must not use recliner block');
  process.exit(1);
}

console.log('verifyProductionPhotoRetouchPrompts: ok');
