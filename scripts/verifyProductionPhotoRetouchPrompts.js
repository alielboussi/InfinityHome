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

console.log('verifyProductionPhotoRetouchPrompts: ok');
