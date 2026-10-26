import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';

export const KITWE_PRICE_LABELS_QUEUE_KEY = 'price-labels:kitwe-queue:v1';

/**
 * Queue retail product ids for Price Labels (Kitwe location pre-selected).
 */
export function queueKitwePriceLabels({ productIds = [], locationId = KITWE_LOCATION_ID } = {}) {
  const ids = [...new Set((productIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return false;
  try {
    sessionStorage.setItem(KITWE_PRICE_LABELS_QUEUE_KEY, JSON.stringify({
      locationId: String(locationId || KITWE_LOCATION_ID),
      productIds: ids,
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
    if (!parsed?.productIds?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
