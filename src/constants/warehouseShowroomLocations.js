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

/**
 * Sets are kitted at showrooms only — not from central Warehouse catalog UI.
 * Kitwe Products portal may create sets from Kitwe assembly stock.
 */
export function warehouseCatalogAllowsSetCreate(portalOrOptions) {
  const portal = typeof portalOrOptions === 'string'
    ? portalOrOptions
    : portalOrOptions?.create_portal || portalOrOptions?.portal;
  return portal === 'kitwe-products';
}
