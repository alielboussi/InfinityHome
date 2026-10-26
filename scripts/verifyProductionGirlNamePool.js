/**
 * Ensures production name suggest uses girl-name pool only (no place names in suggest path).
 */
import {
  PRODUCTION_GIRL_NAME_POOL,
  matchProductionGirlNameFromPool,
  pickRandomProductionBaseName,
} from '../src/utils/productionItemName.js';

const PLACE_SAMPLES = ['St Tropez', 'Capri', 'Monaco', 'Santorini', 'Maldives'];

let failed = false;

for (const place of PLACE_SAMPLES) {
  if (matchProductionGirlNameFromPool(place)) {
    console.error(`[verifyProductionGirlNamePool] place name must not match pool: ${place}`);
    failed = true;
  }
}

for (let i = 0; i < 50; i += 1) {
  const name = pickRandomProductionBaseName();
  if (!matchProductionGirlNameFromPool(name)) {
    console.error(`[verifyProductionGirlNamePool] pickRandom returned non-pool name: ${name}`);
    failed = true;
    break;
  }
}

if (!PRODUCTION_GIRL_NAME_POOL.length) {
  console.error('[verifyProductionGirlNamePool] pool is empty');
  failed = true;
}

if (failed) process.exit(1);
console.log(`[verifyProductionGirlNamePool] ok (${PRODUCTION_GIRL_NAME_POOL.length} names)`);
