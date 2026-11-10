import { PRODUCTION_PRESET_WAREHOUSE_CATEGORY_BY_PRESET } from './productionPresetCategory.js';

const CATEGORY_TO_PRESET_LOWER = Object.freeze(
  Object.fromEntries(
    Object.entries(PRODUCTION_PRESET_WAREHOUSE_CATEGORY_BY_PRESET).map(([preset, category]) => [
      String(category).toLowerCase(),
      String(preset).toLowerCase(),
    ]),
  ),
);

function singularizeCategoryName(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return '';
  if (CATEGORY_TO_PRESET_LOWER[s]) return CATEGORY_TO_PRESET_LOWER[s];
  if (s.endsWith('s') && s.length > 3) return s.slice(0, -1);
  return s;
}

/**
 * Matches a product candidate or set component to a warehouse category by:
 * 1) direct `category_id` match, OR
 * 2) product name ending with / containing the category's preset suffix (e.g. "3 Seater" for "3 Seaters").
 */
export function productMatchesWarehouseCategory(item, category) {
  if (!item || !category) return false;
  const catId = String(category.id || '').trim();
  if (catId && String(item.category_id || '').trim() === catId) {
    return true;
  }
  const catName = String(category.name || '').trim().toLowerCase();
  const singular = singularizeCategoryName(catName);
  const nameLower = String(item.name || '').trim().toLowerCase();
  if (!nameLower) return false;
  if (singular && (nameLower.endsWith(` ${singular}`) || nameLower === singular)) {
    return true;
  }
  if (catName && (nameLower.endsWith(` ${catName}`) || nameLower === catName)) {
    return true;
  }
  return false;
}

/**
 * Collects all unique product/component candidates belonging to `category`
 * from both standalone Floor 1 `candidates` and `setCandidates` components.
 */
export function collectCategoryProductComponents({
  category,
  candidates = [],
  setCandidates = [],
}) {
  if (!category) return [];
  const byId = new Map();

  for (const c of candidates || []) {
    if (!c?.id) continue;
    if (productMatchesWarehouseCategory(c, category)) {
      byId.set(String(c.id), {
        id: String(c.id),
        name: c.name,
        family_sku: c.family_sku,
        category_id: c.category_id || null,
      });
    }
  }

  for (const set of setCandidates || []) {
    const setMatchesCategory = String(set?.category_id || '') === String(category.id || '');
    for (const comp of set?.components || []) {
      if (!comp?.id) continue;
      if (setMatchesCategory || productMatchesWarehouseCategory(comp, category)) {
        const key = String(comp.id);
        if (!byId.has(key)) {
          byId.set(key, {
            id: key,
            name: comp.name,
            family_sku: comp.family_sku,
            category_id: comp.category_id || null,
          });
        }
      }
    }
  }

  return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}
