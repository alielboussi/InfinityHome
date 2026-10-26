import { getProductionPhotoModelCandidates } from '../server/lib/productionPhotoGeminiModels.js';

const models = getProductionPhotoModelCandidates();
if (!models.length) {
  console.error('[verifyProductionPhotoGeminiModels] no models configured');
  process.exit(1);
}
console.log('[verifyProductionPhotoGeminiModels] ok — try order:', models.join(' → '));
