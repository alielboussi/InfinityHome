import { isWorkshopOrDeliveryScreenAllowed } from '../mobileAccessManifest';

export const CARPENTRY_ORDERS_HUB_SCREEN_IDS = Object.freeze([
  'carpentry_orders',
  'carpentry_jobs',
  'carpentry_quotes',
  'carpentry_repairs',
]);

export const UPHOLSTERY_ORDERS_HUB_SCREEN_IDS = Object.freeze([
  'upholstery_orders',
  'upholstery_jobs',
  'upholstery_quotes',
  'upholstery_repairs',
]);

export const DELIVERY_ORDERS_HUB_SCREEN_IDS = Object.freeze([
  'delivery_production_orders',
  'delivery_send_kitwe',
  'kitwe_send_delivery',
]);

/** Dashboard tile visible when user may open any former Jobs / Quotes / Repairs screen. */
export function isWorkshopOrdersHubAllowed(grant, appFlag, screenIds = []) {
  const ids = Array.isArray(screenIds) ? screenIds : [];
  if (!ids.length) return false;
  return ids.some((id) => isWorkshopOrDeliveryScreenAllowed(grant, id, appFlag));
}

export function sumDashboardBadgeCounts(counts, keys = []) {
  const c = counts && typeof counts === 'object' ? counts : {};
  return (keys || []).reduce((sum, key) => sum + Math.max(0, Math.floor(Number(c[key]) || 0)), 0);
}