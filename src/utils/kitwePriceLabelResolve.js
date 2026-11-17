import { normalizeCatalogNameForLabel } from './priceLabelFormatters';

export function kitweCatalogRowBulkKey(row) {
  return `${row.kind}:${row.id}`;
}

export function findRetailComboForKitweRow(row, catalogCombos = []) {
  if (row?.kind !== 'set') return null;
  const nameKey = normalizeCatalogNameForLabel(row.name);
  if (!nameKey) return null;
  return (catalogCombos || []).find(
    (combo) => normalizeCatalogNameForLabel(combo.combo_name) === nameKey,
  ) || null;
}