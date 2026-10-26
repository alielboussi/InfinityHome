/**
 * Warehouse Catalog mobile app — screens and permission axes (web /user-access).
 * When a new screen ships in the APK, register it here AND copy to mobile-apps/shared/mobileAccessManifest.js.
 *
 * Permission values: 'allow' | 'deny' (default deny until admin enables).
 */

/** Launcher / login title (keep in sync with warehouse-catalog app.config.js `expo.name`). */
export const MOBILE_APP_DISPLAY_NAME = 'Warehouse';

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

/** /user-access — Add product (+) on warehouse products list. */
export function isWarehouseProductFormInsertAllowed(grant) {
  return grant?.screens?.warehouse_product_form?.insert === 'allow';
}

/** /user-access — edit finished product qty (increments only; scales linked packet cartons). */
/** Upload device-local Turkish names to warehouse_assemblies (bulk sync). */
export function isWarehouseProductTurkishSyncAllowed(grant) {
  if (!grant) return false;
  if (grant.warehouse_product_stock_qty === 'allow') return true;
  if (isMobileScreenAccessAllowed(grant, 'warehouse_products')) return true;
  if (isMobileScreenAccessAllowed(grant, 'warehouse_incomplete_products')) return true;
  const form = grant.screens?.warehouse_product_form;
  if (form?.insert === 'allow' || form?.edit === 'allow') return true;
  return false;
}

/** /user-access — 10″ warehouse production kiosk (create + stock-in). */
export function isWarehouseProductionKioskAllowed(grant) {
  return grant?.warehouse_production_kiosk === 'allow';
}

/** /user-access — Production Android app (create + stock-in, Zebra Weblink labels). */
export function isWarehouseProductionAppAllowed(grant) {
  return grant?.warehouse_production_app === 'allow';
}

export function isWarehouseProductionOperatorAllowed(grant) {
  return isWarehouseProductionKioskAllowed(grant) || isWarehouseProductionAppAllowed(grant);
}

/** Keep in sync with server/lib/loginAccess.js protected admin (User Access + Production app). */
export const PRODUCTION_LOGIN_ACCESS_ADMIN_EMAIL = 'alielboussi00@gmail.com';

export function isProductionLoginAccessAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === PRODUCTION_LOGIN_ACCESS_ADMIN_EMAIL;
}

/** Same rule as warehouse-mobile `production-access-self` and API enforcement. */
export function evaluateWarehouseProductionAppAccess(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  return isWarehouseProductionOperatorAllowed(grant);
}

export function isWarehouseProductStockQtyEditAllowed(grant) {
  if (!grant) return false;
  if (grant.warehouse_product_stock_qty === 'allow') return true;
  if (isMobileScreenAccessAllowed(grant, 'warehouse_products')) return true;
  if (isMobileScreenAccessAllowed(grant, 'warehouse_incomplete_products')) return true;
  const form = grant.screens?.warehouse_product_form;
  if (form?.insert === 'allow' || form?.edit === 'allow') return true;
  return false;
}

/** Screens that can appear as buttons on the mobile dashboard. */
export const MOBILE_DASHBOARD_NAV_SCREEN_IDS = Object.freeze([
  'warehouse_products',
  'warehouse_packets',
  'warehouse_unused_packets',
  'warehouse_incomplete_products',
  'kitwe_send_delivery',
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
    label: 'Products',
    description: 'Finished-only products and packet-BOM products with complete cartons',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_incomplete_products',
    label: 'Incomplete Products',
    description: 'Packet-BOM products missing links or carton totals ≠ packet count',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_packets',
    label: 'Packets',
    description: 'Search packets and adjust warehouse carton qty',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_unused_packets',
    label: 'Warehouse Unused Packets',
    description: 'Spare cartons after BOM-complete products (on hand minus allocated)',
    permissionMatrix: true,
  },
  {
    id: 'kitwe_send_delivery',
    label: 'Send to Kitwe',
    description: 'Truck delivery checklist → Hassan acceptance',
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
  warehouse_unused_packets: 'WarehouseUnusedPackets',
  kitwe_send_delivery: 'KitweSendHome',
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
    warehouse_product_stock_qty: 'deny',
    warehouse_production_kiosk: 'deny',
    warehouse_production_app: 'deny',
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
      || isMobileScreenAccessAllowed(grant, 'warehouse_unused_packets');
  }

  if (screenId === 'warehouse_packets') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_packets');
  }

  if (screenId === 'warehouse_unused_packets') {
    return isMobileScreenAccessAllowed(grant, 'warehouse_unused_packets');
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

  const unusedPacketsAllowed =
    isMobileScreenAccessAllowed(merged, 'warehouse_unused_packets')
    || isMobileScreenAccessAllowed(merged, 'warehouse_unassigned_packets');
  merged.screens.warehouse_unused_packets = buildMobileScreenAccessRow(unusedPacketsAllowed);
  delete merged.screens.warehouse_unassigned_packets;

  const packetsAllowedForForms = packetsAllowed || unusedPacketsAllowed;
  if (packetsAllowedForForms && !productsAllowed) {
    merged.screens.warehouse_packet_form = buildMobileScreenAccessRow(true);
  }

  merged.warehouse_product_stock_qty = merged.warehouse_product_stock_qty === 'allow'
    ? 'allow'
    : 'deny';

  merged.warehouse_production_kiosk = (
    merged.warehouse_production_kiosk === 'allow' || merged.warehouse_production_kiosk === true
  )
    ? 'allow'
    : 'deny';

  merged.warehouse_production_app = (
    merged.warehouse_production_app === 'allow' || merged.warehouse_production_app === true
  )
    ? 'allow'
    : 'deny';

  return merged;
}
