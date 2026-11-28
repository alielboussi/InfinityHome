import { formatWarehouseProductionLabelColor } from './warehouseProductionLabelColor.js';

/** Catalog line: `{name} - {color}` when variant colors exist. */
export function formatWarehouseDeliveryDisplayName(name, variantColor) {
  const base = String(name || '').trim() || '—';
  const color = String(variantColor || '').trim();
  if (!color) return base;
  const suffix = ` - ${color}`;
  if (base.endsWith(suffix) || base.includes(`${suffix} (`)) return base;
  return `${base}${suffix}`;
}

export function formatWarehouseDeliveryAssemblyLine(assembly, colorRecords) {
  const name = String(assembly?.name || '').trim() || 'Product';
  const color = formatWarehouseProductionLabelColor(assembly, colorRecords);
  return formatWarehouseDeliveryDisplayName(name, color);
}

/**
 * @param {{ assemblies?: Array, assemblyColors?: Array, colors?: Array }} catalogSlice
 */
export function createWarehouseDeliveryNameFormatter(catalogSlice = {}) {
  const assemblyById = new Map(
    (catalogSlice.assemblies || []).map((a) => [String(a.id), a]),
  );
  const colorCatalogById = new Map(
    (catalogSlice.colors || []).map((c) => [String(c.id), c]),
  );
  const colorsByAssembly = new Map();
  for (const row of catalogSlice.assemblyColors || []) {
    const color = colorCatalogById.get(String(row.color_id));
    if (!color) continue;
    const key = String(row.assembly_id);
    if (!colorsByAssembly.has(key)) colorsByAssembly.set(key, []);
    colorsByAssembly.get(key).push(color);
  }

  return {
    displayName(rawName, assemblyId) {
      const id = String(assemblyId || '').trim();
      const asm = id ? assemblyById.get(id) : null;
      const base = String(rawName || asm?.name || '').trim() || 'Product';
      const colorRecords = id ? (colorsByAssembly.get(id) || []) : [];
      return formatWarehouseDeliveryAssemblyLine(
        asm || { name: base, has_color_variants: colorRecords.length > 0 },
        colorRecords,
      );
    },
  };
}

export function warehouseDeliveryColorContextFromCatalog(catalog) {
  if (!catalog) return null;
  return {
    assemblies: catalog.assemblies || [],
    assemblyColors: catalog.assemblyColors || [],
    colors: catalog.colors || [],
  };
}

export function deliveryDisplayNameWithFormatter(formatter, rawName, assemblyId) {
  const raw = String(rawName || '').trim() || 'Product';
  if (!formatter?.displayName) return raw;
  return formatter.displayName(raw, assemblyId);
}
