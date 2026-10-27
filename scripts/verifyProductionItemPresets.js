/**
 * Mobile preset groups must match src/utils/productionItemName.js
 */
import fs from 'fs';
import path from 'path';
import {
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_SEATER_PRESETS,
} from '../src/utils/productionItemName.js';

const mobilePath = path.join(process.cwd(), 'mobile-apps/warehouse-production/lib/productionItemName.js');
const mobileSrc = fs.readFileSync(mobilePath, 'utf8');

function extractList(src, constName) {
  const match = src.match(new RegExp(`export const ${constName} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const mobileSeater = extractList(mobileSrc, 'PRODUCTION_SEATER_PRESETS');
const mobileCarpentry = extractList(mobileSrc, 'PRODUCTION_CARPENTRY_PRESETS');
if (!mobileSeater || !mobileCarpentry) {
  console.error('[verifyProductionItemPresets] mobile preset lists not found');
  process.exit(1);
}

function sameLists(a, b, label) {
  if (a.length !== b.length) {
    console.error(`[verifyProductionItemPresets] ${label} length mismatch`, a.length, b.length);
    process.exit(1);
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      console.error(`[verifyProductionItemPresets] ${label} mismatch at`, i, a[i], b[i]);
      process.exit(1);
    }
  }
}

sameLists(mobileSeater, [...PRODUCTION_SEATER_PRESETS], 'seater');
sameLists(mobileCarpentry, [...PRODUCTION_CARPENTRY_PRESETS], 'carpentry');

console.log('[verifyProductionItemPresets] ok');
