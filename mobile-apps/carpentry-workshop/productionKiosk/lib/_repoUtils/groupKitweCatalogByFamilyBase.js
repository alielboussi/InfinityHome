import { extractProductionBaseName } from './productionItemName';

/**
 * Group portal catalog products under production family base name (matches mobile Manufacture grids).
 */
export function groupKitweCatalogByFamilyBase(products, { nameKey = 'name' } = {}) {
  const map = new Map();
  (products || []).forEach((row) => {
    if (!row?.id) return;
    const rawName = String(row[nameKey] || '').trim();
    const familyBase = extractProductionBaseName(rawName) || rawName || String(row.id);
    const key = familyBase.toLowerCase();
    if (!map.has(key)) map.set(key, { key, familyBase, items: [] });
    map.get(key).items.push(row);
  });
  return [...map.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) =>
        String(a[nameKey] || '').localeCompare(String(b[nameKey] || '')),
      ),
    }))
    .sort((a, b) => a.familyBase.localeCompare(b.familyBase));
}
