/** Optional Color: row on warehouse production labels (before date/time). */
export function normalizeProductionLabelColor(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 72);
}

export function productionLabelIncludesColorRow(colorValue) {
  return Boolean(normalizeProductionLabelColor(colorValue));
}
