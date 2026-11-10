/**
 * One grid card per catalog product (no family-base merge).
 */
export function catalogProductMatchesSearch(row, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return String(row?.name || '').toLowerCase().includes(q)
    || String(row?.family_sku || '').toLowerCase().includes(q);
}

export function filterCatalogProductsForSearch(products, search) {
  const q = String(search || '').trim();
  if (!q) return products || [];
  return (products || []).filter((row) => catalogProductMatchesSearch(row, q));
}

export function catalogProductsAsFlatGroups(products, { nameKey = 'name' } = {}) {
  return (products || [])
    .map((row) => {
      const id = String(row?.id || '').trim();
      if (!id) return null;
      const label = String(row?.[nameKey] || row?.name || id).trim();
      return {
        key: id,
        familyBase: label,
        items: [row],
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.familyBase.localeCompare(b.familyBase));
}
