import fs from 'fs';
import path from 'path';
import {
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_SEATER_PRESETS,
} from '../src/utils/productionItemName.js';
import {
  PRODUCTION_PRESET_WAREHOUSE_CATEGORY_BY_PRESET,
  warehouseCategoryNameForProductionPreset,
} from '../src/utils/productionPresetCategory.js';

const handlerPath = path.join(process.cwd(), 'server/handlers/warehouse-mobile.js');
const src = fs.readFileSync(handlerPath, 'utf8');

const fnMatch = src.match(/async function opProductionPacketCreate[\s\S]*?^}/m);
if (!fnMatch) {
  console.error('[verifyProductionPresetCategory] opProductionPacketCreate not found');
  process.exit(1);
}
const fn = fnMatch[0];

if (!fn.includes('ensureCategoryIdForProductionPreset')) {
  console.error('[verifyProductionPresetCategory] production create must resolve category from preset');
  process.exit(1);
}
if (!fn.includes('category_id: categoryId')) {
  console.error('[verifyProductionPresetCategory] production create must pass category_id to saveAssemblyForMobile');
  process.exit(1);
}

const allDefaults = [...PRODUCTION_SEATER_PRESETS, ...PRODUCTION_CARPENTRY_PRESETS];
for (const preset of allDefaults) {
  const categoryName = warehouseCategoryNameForProductionPreset(preset);
  if (!categoryName) {
    console.error('[verifyProductionPresetCategory] missing category name for preset', preset);
    process.exit(1);
  }
  if (!PRODUCTION_PRESET_WAREHOUSE_CATEGORY_BY_PRESET[preset]) {
    console.error('[verifyProductionPresetCategory] default preset must be in map:', preset);
    process.exit(1);
  }
}

console.log('[verifyProductionPresetCategory] ok');
