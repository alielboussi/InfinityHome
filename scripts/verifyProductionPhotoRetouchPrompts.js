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
if (!/top sleeping surface/i.test(mattressPrompt) || !/quilted/i.test(mattressPrompt)) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress orientation prompt missing');
  process.exit(1);
}
if (
  !mattressPrompt.includes('UPRIGHT')
  || !mattressPrompt.includes('faces the camera')
  || !mattressPrompt.includes('NOT lying horizontal')
) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress must stand upright facing forward');
  process.exit(1);
}
if (!mattressPrompt.includes('HERO FRAMING') || !mattressPrompt.includes('70–90%')) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress zoomed hero framing prompt missing');
  process.exit(1);
}
if (mattressPrompt.includes('straight-down flat-lay') || mattressPrompt.includes('TEXTURE CLOSE-UP')) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress prompt must not use flat-lay texture crop');
  process.exit(1);
}
if (mattressPrompt.includes('full item visible')) {
  console.error('[verifyProductionPhotoRetouchPrompts] mattress prompt must not use distant full-item framing');
  process.exit(1);
}

console.log('verifyProductionPhotoRetouchPrompts: ok');
