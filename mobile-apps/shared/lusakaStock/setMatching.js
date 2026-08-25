export function normalizeCatalogName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeSku(sku) {
  return String(sku || '').replace(/^#/, '').trim().toLowerCase();
}

export function buildSkuCounts(rows, skuField = 'sku') {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const sku = normalizeSku(row?.[skuField]);
    if (sku) counts.set(sku, (counts.get(sku) || 0) + 1);
  });
  return counts;
}

export function findMatchingSetForProduct(product, allCombos, productSkuCounts, comboSkuCounts) {
  const sku = normalizeSku(product?.sku);
  const nameKey = normalizeCatalogName(product?.name);

  if (nameKey) {
    const byName = (allCombos || []).find(
      (combo) => normalizeCatalogName(combo.combo_name) === nameKey,
    );
    if (byName) return byName;
  }

  if (
    sku
    && comboSkuCounts.get(sku) === 1
    && productSkuCounts.get(sku) === 1
  ) {
    return (allCombos || []).find((combo) => normalizeSku(combo.sku) === sku) || null;
  }

  return null;
}

export function expandLusakaComboIds(linkedComboIds, products, allCombos) {
  const ids = new Set((linkedComboIds || []).map(String).filter(Boolean));
  const productSkuCounts = buildSkuCounts(products, 'sku');
  const comboSkuCounts = buildSkuCounts(allCombos, 'sku');

  (products || []).forEach((product) => {
    const match = findMatchingSetForProduct(product, allCombos, productSkuCounts, comboSkuCounts);
    if (match?.id) ids.add(String(match.id));
  });

  return Array.from(ids);
}

export function mergeProductIdsForSets(productIds, comboItems, comboIds) {
  const ids = new Set((productIds || []).map(String).filter(Boolean));
  const comboIdSet = new Set((comboIds || []).map(String).filter(Boolean));
  (comboItems || []).forEach((row) => {
    if (!comboIdSet.has(String(row.combo_id))) return;
    if (row?.product_id != null && row?.product_id !== '') {
      ids.add(String(row.product_id));
    }
  });
  return Array.from(ids);
}

export function filterComboItemsForCombos(comboItems, comboIds) {
  const idSet = new Set((comboIds || []).map(String));
  return (comboItems || []).filter((row) => idSet.has(String(row.combo_id)));
}

export function buildSetComponentProductIds(combos, comboItems) {
  const ids = new Set();
  const lusakaComboIds = new Set((combos || []).map((combo) => String(combo.id)));
  (comboItems || []).forEach((row) => {
    if (!lusakaComboIds.has(String(row.combo_id))) return;
    if (row?.product_id != null && row?.product_id !== '') {
      ids.add(String(row.product_id));
    }
  });
  return ids;
}
