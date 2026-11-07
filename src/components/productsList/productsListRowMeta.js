import {
  PRODUCTS_LIST_HIDDEN_LOCATION_ID,
  PRODUCTS_LIST_ROW_BASE_HEIGHT,
  PRODUCTS_LIST_ROW_LOC_LINE_HEIGHT,
} from './productsListConstants';

export function estimateProductsListRowHeight(locationCount = 0) {
  return PRODUCTS_LIST_ROW_BASE_HEIGHT + Math.max(0, Number(locationCount) || 0) * PRODUCTS_LIST_ROW_LOC_LINE_HEIGHT;
}

export function buildProductsListRowMeta(item, ctx) {
  const {
    getStockForProductAcrossSelected,
    inventory,
    selectedLocationIds,
    isLocationSelected,
    showDuplicateNamesOnly,
    getAssignedLocationIdsForItem,
    normalizeLocationId,
    locations,
    computeComboMaxQty,
    getStockForProduct,
    categories,
  } = ctx;

  const isCombo = !!item.__isCombo;
  const aggregateQty = !isCombo ? getStockForProductAcrossSelected(item.id) : null;
  let hasNegativeEntry = false;
  if (!isCombo) {
    if (selectedLocationIds.length > 0) {
      hasNegativeEntry = (inventory || []).some(
        (inv) => String(inv.product_id) === String(item.id)
          && Number(inv.quantity) < 0
          && isLocationSelected(inv.location),
      );
    } else {
      hasNegativeEntry = (inventory || []).some(
        (inv) => String(inv.product_id) === String(item.id) && Number(inv.quantity) < 0,
      );
    }
  }
  const highlightRow = !isCombo && (
    showDuplicateNamesOnly
    || (selectedLocationIds.length > 0
      ? Number(aggregateQty) < 0
      : hasNegativeEntry)
  );
  const rowKey = `${isCombo ? 'combo' : 'prod'}-${item.id}`;
  const bulkKey = `${isCombo ? 'combo' : 'prod'}:${item.id}`;
  const categoryName = categories.find((c) => String(c.id) === String(item.category_id))?.name;
  const hasCategoryId = item.category_id !== null && item.category_id !== undefined && String(item.category_id) !== '';
  const categoryMissing = hasCategoryId && !categoryName;

  const assignedIdSet = new Set(
    getAssignedLocationIdsForItem(item)
      .map((id) => normalizeLocationId(id))
      .filter(Boolean),
  );
  const locationQtyRows = (locations || [])
    .filter((loc) => String(loc.id) !== PRODUCTS_LIST_HIDDEN_LOCATION_ID)
    .filter((loc) => assignedIdSet.has(normalizeLocationId(loc.id)))
    .map((loc) => {
      const qty = isCombo
        ? computeComboMaxQty(item.id, loc.id)
        : getStockForProduct(item.id, loc.id);
      return {
        id: loc.id,
        name: loc.name,
        qty: Number(qty || 0),
      };
    });

  return {
    isCombo,
    highlightRow,
    rowKey,
    bulkKey,
    categoryName,
    categoryMissing,
    locationQtyRows,
    estimatedHeight: estimateProductsListRowHeight(locationQtyRows.length),
  };
}
