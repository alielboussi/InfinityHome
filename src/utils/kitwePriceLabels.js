import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';

export const KITWE_PRICE_LABELS_QUEUE_KEY = 'price-labels:kitwe-queue:v1';

/**
 * Queue retail product ids for Price Labels (Kitwe location pre-selected).
 */
export function queueKitwePriceLabels({
  productIds = [],
  items = [],
  locationId = KITWE_LOCATION_ID,
} = {}) {
  const normalizedItems = (items || []).length
    ? (items || [])
      .map((row) => ({
        productId: String(row.productId || row.retailProductId || row.id || '').trim(),
        qty: Math.max(1, Math.floor(Number(row.qty) || 1)),
        printStandardOnly: Boolean(row.printStandardOnly),
      }))
      .filter((row) => row.productId)
    : [...new Set((productIds || []).map((id) => String(id)).filter(Boolean))]
      .map((id) => ({ productId: id, qty: 1, printStandardOnly: false }));

  if (!normalizedItems.length) return false;
  try {
    sessionStorage.setItem(KITWE_PRICE_LABELS_QUEUE_KEY, JSON.stringify({
      locationId: String(locationId || KITWE_LOCATION_ID),
      items: normalizedItems,
      at: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function consumeKitwePriceLabelsQueue() {
  try {
    const raw = sessionStorage.getItem(KITWE_PRICE_LABELS_QUEUE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KITWE_PRICE_LABELS_QUEUE_KEY);
    const parsed = JSON.parse(raw);
    const items = (parsed?.items || []).filter((row) => row?.productId);
    const legacyIds = (parsed?.productIds || []).map((id) => String(id)).filter(Boolean);
    if (!items.length && !legacyIds.length) return null;
    return {
      ...parsed,
      items: items.length
        ? items
        : legacyIds.map((productId) => ({
          productId,
          qty: 1,
          printStandardOnly: false,
        })),
    };
  } catch {
    return null;
  }
}
