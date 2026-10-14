/**
 * Warehouse Catalog mobile app — screens and permission axes.
 * Keep in sync with src/mobile/mobileAccessManifest.js (web /user-access + CI).
 *
 * Permission values: 'allow' | 'deny' (default deny until admin enables).
 */

/** Stored per screen; admin UI only exposes Yes/No (maps to full allow vs full deny). */
export function buildMobileScreenAccessRow(allowed) {
  if (allowed) {
    return {
      view: 'allow',
      hide: 'deny',
      insert: 'allow',
      edit: 'allow',
      delete: 'allow',
    };
  }
  return {
    view: 'deny',
    hide: 'deny',
    insert: 'deny',
    edit: 'deny',
    delete: 'deny',
  };
}

export function isMobileScreenAccessAllowed(grant, screenId) {
  return grant?.screens?.[screenId]?.view === 'allow';
}

/** /user-access — edit finished product qty (increments only; scales linked packet cartons). */
export function isWarehouseProductStockQtyEditAllowed(grant) {
  return grant?.warehouse_product_stock_qty === 'allow';
}

/** Screens that can appear as buttons on the mobile dashboard. */
export const MOBILE_DASHBOARD_NAV_SCREEN_IDS = Object.freeze([
  'warehouse_products',
  'warehouse_packets',
  'warehouse_unassigned_packets',
  'warehouse_unused_packets',
  'warehouse_incomplete_products',
  'warehouse_floor_count',
]);

/** Every navigable screen (CI + defaults). */
export const MOBILE_SCREENS = Object.freeze([
  {
    id: 'dashboard',
    label: 'Dashboard (landing)',
    description: 'Home after login',
    defaultLanding: true,
    permissionMatrix: false,
  },
  {
    id: 'warehouse_products',
    label: 'Warehouse Products',
    description: 'Finished-only products and packet-BOM products with complete cartons',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_incomplete_products',
    label: 'Warehouse Incomplete Products',
    description: 'Packet-BOM products missing links or carton totals ≠ packet count',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_packets',
    label: 'Warehouse Packets',
    description: 'Search packets and adjust warehouse carton qty',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_unassigned_packets',
    label: 'Warehouse Unassigned Packets',
    description: 'Carton SKUs not linked to any warehouse product',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_unused_packets',
    label: 'Warehouse Unused Packets',
    description: 'Carton on-hand minus cartons allocated to BOM-complete products',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_floor_count',
    label: 'Stock count',
    description: 'Floor checklist — scan packets (not linked to web stocktake)',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_scan',
    label: 'Barcode scan',
    description: 'Scan Code 128 or QR (inside warehouse products)',
    permissionMatrix: false,
  },
  {
    id: 'warehouse_ocr_sku',
    label: 'Label SKU (OCR)',
    description: 'Read printed finished-product unit code from label',
    permissionMatrix: false,
  },
  {
    id: 'warehouse_product_detail',
    label: 'Product info',
    description: 'Photo, dimensions, warehouse stock (from SKU lookup)',
    permissionMatrix: false,
  },
  {
    id: 'warehouse_packet_form',
    label: 'Add / edit packet',
    description: 'Packet form (inside warehouse products)',
    permissionMatrix: false,
  },
  {
    id: 'warehouse_product_form',
    label: 'Add / edit product',
    description: 'Product form (inside warehouse products)',
    permissionMatrix: false,
  },
]);

export const DEFAULT_MOBILE_LANDING_SCREEN = 'dashboard';

const SCREEN_NAV_ROUTE = Object.freeze({
  warehouse_products: 'WarehouseProducts',
  warehouse_incomplete_products: 'WarehouseIncompleteProducts',
  warehouse_packets: 'WarehousePackets',
  warehouse_unassigned_packets: 'WarehouseUnassignedPackets',
  warehouse_unused_packets: 'WarehouseUnusedPackets',
  warehouse_floor_count: 'WarehouseStockCount',
});

const WAREHOUSE_PRODUCTS_CHILD_SCREENS = Object.freeze([
  'warehouse_scan',
  'warehouse_ocr_sku',
  'warehouse_product_detail',
  'warehouse_packet_form',
  'warehouse_product_form',
]);

export function normalizeMobileUserEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Screens shown in /user-access permission table for this user. */
export function getMobilePermissionMatrixScreens(_userEmail) {
  return MOBILE_SCREENS.filter((screen) => screen.permissionMatrix);
}

export function defaultMobileAccessGrant() {
  const screens = {};
  MOBILE_SCREENS.forEach((screen) => {
    screens[screen.id] = {
      view: screen.id === 'dashboard' ? 'allow' : 'deny',
      hide: 'deny',
      insert: 'deny',
      edit: 'deny',
      delete: 'deny',
    };
  });
  return {
    app: 'warehouse-catalog',
    landing_screen: DEFAULT_MOBILE_LANDING_SCREEN,
    screens,
  };
}

/**
 * @param {object} grant
 * @param {string} screenId
 */
export function canMobileScreenView(grant, screenId) {
  if (screenId === 'dashboard') return true;

  if (WAREHOUSE_PRODUCTS_CHILD_SCREENS.includes(screenId)) {
    return isMobileScreenAccessAllowed(grant, 'warehouse_products')
      || isMobileScreenAccessAllowed(grant, 'warehouse_incomplete_products');
  }

  if (screenId === 'warehouse_incomplete_products') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_incomplete_products');
  }

  if (screenId === 'warehouse_packet_form') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_products')
      || isMobileScreenAccessAllowed(grant, 'warehouse_packets')
      || isMobileScreenAccessAllowed(grant, 'warehouse_unassigned_packets')
      || isMobileScreenAccessAllowed(grant, 'warehouse_unused_packets');
  }

  if (screenId === 'warehouse_packets') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_packets');
  }

  if (screenId === 'warehouse_unassigned_packets') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_unassigned_packets');
  }

  if (screenId === 'warehouse_unused_packets') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_unused_packets');
  }

  if (screenId === 'warehouse_floor_count') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_floor_count');
  }

  return isMobileScreenAccessAllowed(grant, screenId);
}

/** Dashboard buttons — each tile requires its own Yes on /user-access (no implied grants). */
export function getMobileDashboardNavItems(grant, userEmail) {
  return MOBILE_DASHBOARD_NAV_SCREEN_IDS
    .map((id) => MOBILE_SCREENS.find((s) => s.id === id))
    .filter(Boolean)
    .filter((screen) => isMobileScreenAccessAllowed(grant, screen.id))
    .map((screen) => ({
      screenId: screen.id,
      label: screen.label,
      routeName: SCREEN_NAV_ROUTE[screen.id] || null,
    }))
    .filter((item) => item.routeName);
}

export function sanitizeMobileAccessGrantForUser(grant, _userEmail) {
  const base = defaultMobileAccessGrant();
  const merged = {
    ...base,
    ...grant,
    landing_screen: DEFAULT_MOBILE_LANDING_SCREEN,
    screens: { ...base.screens, ...(grant?.screens || {}) },
  };
  delete merged.dashboard_actions;

  const legacyCatalogScreenIds = [
    'scan',
    'packet_form',
    'product_form',
    'kitwe_transfer_scan',
    'hassan_delivery_checklist',
  ];
  if (
    legacyCatalogScreenIds.some((id) => isMobileScreenAccessAllowed(merged, id))
    && !isMobileScreenAccessAllowed(merged, 'warehouse_products')
  ) {
    merged.screens.warehouse_products = buildMobileScreenAccessRow(true);
  }

  MOBILE_SCREENS.forEach((screen) => {
    if (screen.id === 'dashboard') {
      merged.screens.dashboard = buildMobileScreenAccessRow(true);
      return;
    }
    const allowed = isMobileScreenAccessAllowed(merged, screen.id);
    merged.screens[screen.id] = buildMobileScreenAccessRow(allowed);
  });

  const productsAllowed = isMobileScreenAccessAllowed(merged, 'warehouse_products');
  const incompleteProductsAllowed = isMobileScreenAccessAllowed(merged, 'warehouse_incomplete_products');
  WAREHOUSE_PRODUCTS_CHILD_SCREENS.forEach((childId) => {
    merged.screens[childId] = buildMobileScreenAccessRow(productsAllowed || incompleteProductsAllowed);
  });

  merged.screens.warehouse_incomplete_products = buildMobileScreenAccessRow(incompleteProductsAllowed);

  const legacyPacketsList = isMobileScreenAccessAllowed(merged, 'warehouse_packets_list');
  const packetsAllowed =
    isMobileScreenAccessAllowed(merged, 'warehouse_packets') || legacyPacketsList;
  merged.screens.warehouse_packets = buildMobileScreenAccessRow(packetsAllowed);

  const unassignedPacketsAllowed = isMobileScreenAccessAllowed(merged, 'warehouse_unassigned_packets');
  merged.screens.warehouse_unassigned_packets = buildMobileScreenAccessRow(unassignedPacketsAllowed);

  const unusedPacketsAllowed = isMobileScreenAccessAllowed(merged, 'warehouse_unused_packets');
  merged.screens.warehouse_unused_packets = buildMobileScreenAccessRow(unusedPacketsAllowed);

  merged.screens.warehouse_floor_count = buildMobileScreenAccessRow(
    isMobileScreenAccessAllowed(merged, 'warehouse_floor_count'),
  );

  const packetsAllowedForForms = packetsAllowed || unassignedPacketsAllowed || unusedPacketsAllowed;
  if (packetsAllowedForForms && !productsAllowed) {
    merged.screens.warehouse_packet_form = buildMobileScreenAccessRow(true);
  }

  return merged;
}
