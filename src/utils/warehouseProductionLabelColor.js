/** Color line for warehouse Zebra labels when product has variant colors. */
export function formatWarehouseProductionLabelColor(assembly, colorRecords) {
  if (!assembly?.has_color_variants) return '';
  const names = (colorRecords || [])
    .map((c) => String(c?.name || '').trim())
    .filter(Boolean);
  return names.join(', ').slice(0, 72);
}
