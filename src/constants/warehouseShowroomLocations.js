/** Central factory warehouse (Factory → Kitwe deliveries). */
export const WAREHOUSE_FACTORY_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';

/** Showrooms where warehouse sets are kitted (not at central Warehouse). */
export const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
export const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';

export const WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS = [
  KITWE_LOCATION_ID,
  LUSAKA_LOCATION_ID,
];

export function isWarehouseKitShowroomLocation(locationId) {
  return WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS.some(
    (id) => String(id) === String(locationId),
  );
}

export function defaultWarehouseKitShowroomLocationId() {
  return KITWE_LOCATION_ID;
}

export function isWarehouseSetRecipeLocation(locationId, { portal } = {}) {
  if (isWarehouseKitShowroomLocation(locationId)) return true;
  const p = String(portal || '').trim();
  if (p === 'warehouse-products' || p === 'warehouse-catalog-mobile') {
    return String(locationId) === WAREHOUSE_FACTORY_LOCATION_ID;
  }
  return false;
}

/**
 * Kitwe Products portal and Warehouse catalog (web + mobile) may define set recipes.
 */
export function warehouseCatalogAllowsSetCreate(portalOrOptions) {
  const portal = typeof portalOrOptions === 'string'
    ? portalOrOptions
    : portalOrOptions?.create_portal || portalOrOptions?.portal;
  return portal === 'kitwe-products'
    || portal === 'warehouse-products'
    || portal === 'warehouse-catalog-mobile';
}
