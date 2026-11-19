import { normalizeCatalogNameForLabel } from './priceLabelFormatters';

export function kitweCatalogRowBulkKey(row) {
  return `${row.kind}:${row.id}`;
}

export function findRetailComboForAssembly(assembly, catalogCombos = []) {
  if (!assembly?.name) return null;
  const nameKey = normalizeCatalogNameForLabel(assembly.name);
  if (!nameKey) return null;
  return (catalogCombos || []).find(
    (combo) => normalizeCatalogNameForLabel(combo.combo_name) === nameKey,
  ) || null;
}

export function findRetailComboForKitweRow(row, catalogCombos = []) {
  if (row?.kind !== 'set') return null;
  return findRetailComboForAssembly(row, catalogCombos);
}

export function buildCombosByNormalizedName(combos = []) {
  const map = new Map();
  (combos || []).forEach((combo) => {
    const k = normalizeCatalogNameForLabel(combo.combo_name);
    if (k && !map.has(k)) map.set(k, combo);
  });
  return map;
}