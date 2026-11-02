import { warehouseCategoryNameForProductionPreset } from '../../src/utils/productionPresetCategory.js';
import { createCategoryForMobile } from './warehouseCatalogMobile.js';

export async function ensureCategoryIdForProductionPreset(sb, preset) {
  const categoryName = warehouseCategoryNameForProductionPreset(preset);
  if (!categoryName) return null;
  const row = await createCategoryForMobile(sb, categoryName);
  return row?.id ? String(row.id) : null;
}
