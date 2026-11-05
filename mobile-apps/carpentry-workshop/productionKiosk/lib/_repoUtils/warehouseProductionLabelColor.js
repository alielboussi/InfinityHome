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

/** Product picker label: name, optional color, family SKU. */
export function formatWarehouseAssemblySelectLabel(assembly, colorRecords) {
  const name = String(assembly?.name || '').trim() || 'Product';
  const sku = String(assembly?.family_sku || '').trim();
  const color = formatWarehouseProductionLabelColor(assembly, colorRecords);
  const skuPart = sku ? ` (${sku})` : '';
  if (color) {
    return `${name} — ${color}${skuPart}`;
  }
  return `${name}${skuPart}`;
}
