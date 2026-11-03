/** Color line for warehouse Zebra labels when product has variant colors. */
export function formatWarehouseProductionLabelColor(assembly, colorRecords) {
  const names = (colorRecords || [])
    .map((c) => String(c?.name || '').trim())
    .filter(Boolean);
  if (names.length) {
    return names.join(', ').slice(0, 72);
  }
  if (!assembly?.has_color_variants) return '';
  return '';
}
