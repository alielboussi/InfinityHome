/**
 * Every Production create preset must have a dedicated AI retouch subject line.
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

const mattressPrompt = buildProductionPhotoRetouchPrompt({
  productName: 'Grand Luxury Mattress 200*200',
});
if (!mattressPrompt.includes('shrink wrap') || !mattressPrompt.includes('nylon')) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress wrap removal prompt missing');
  process.exit(1);
}
if (!mattressPrompt.includes('facing forward') || !mattressPrompt.includes('top sleeping surface')) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress forward-facing prompt missing');
  process.exit(1);
}

console.log('verifyProductionPhotoRetouchPrompts: ok');
