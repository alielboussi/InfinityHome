/**
 * Warehouse Catalog mobile app — screens and permission axes (web /user-access).
 * When a new screen ships in the APK, register it here AND copy to mobile-apps/shared/mobileAccessManifest.js.
 *
 * Permission values: 'allow' | 'deny' (default deny until admin enables).
 */

/** User Access panel label (warehouse catalog mobile app). Device app title may still use MOBILE_APP_DISPLAY_NAME. */
export const USER_ACCESS_CATALOG_APP_LABEL = 'Catalog';

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

/** /user-access — Add product (+) on warehouse catalog (web + app). */
export function isWarehouseCatalogAddProductAllowed(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.warehouse_catalog_add_product === 'allow';
}

/** @deprecated use isWarehouseCatalogAddProductAllowed */
export function isWarehouseProductFormInsertAllowed(grant) {
  return isWarehouseCatalogAddProductAllowed(grant);
}

/** /user-access — Zebra label print on warehouse catalog product/packet cards. */
export function isWarehouseCatalogLabelPrintAllowed(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.warehouse_catalog_label_print === 'allow';
}

/** /user-access — import/upload product photo on warehouse catalog cards and product form. */
export function isWarehouseCatalogPhotoImportAllowed(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.warehouse_catalog_photo_import === 'allow';
}

/** /user-access — edit finished product qty (increments only; scales linked packet cartons). */
/** Upload device-local Turkish names to warehouse_assemblies (bulk sync). */
export function isWarehouseProductTurkishSyncAllowed(grant) {
  if (!grant) return false;
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

/** /user-access — Upholstery app: upload Floor 2 WIP photos on Manufacture variant inlay. */
export function isWarehouseProductionPhotoUploadAllowed(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.warehouse_production_photo_upload === 'allow';
}

/** /user-access — Carpentry workshop Android app (manufacture + create/stock with carpentry presets). */
export function isCarpentryWorkshopAppAllowed(grant) {
  return grant?.carpentry_workshop_app === 'allow';
}

/** /user-access — Painting workshop Android app (timed painting jobs → Floor 1 stock). */
export function isPaintingWorkshopAppAllowed(grant) {
  return grant?.painting_workshop_app === 'allow';
}

/** /user-access — Warehouse Delivery Android app (factory truck → Kitwe). */
export function isWarehouseDeliveryAppAllowed(grant) {
  return grant?.warehouse_delivery_app === 'allow';
}

/** Production app — factory truck delivery to Kitwe (User Access → Production). */
export function isWarehouseProductionKitweDeliveryAllowed(grant) {
  if (grant?.warehouse_production_kitwe === 'allow') return true;
  return isMobileScreenAccessAllowed(grant, 'kitwe_send_delivery');
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

/** Same rule as warehouse-mobile `carpentry-access-self` and carpentry mobile ops. */
export function evaluateCarpentryWorkshopAppAccess(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  return isCarpentryWorkshopAppAllowed(grant);
}

/** Same rule as warehouse-mobile `painting-access-self` and painting mobile ops. */
export function evaluatePaintingWorkshopAppAccess(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  return isPaintingWorkshopAppAllowed(grant);
}

/** Hassan Awad — Orders app owner (every dashboard page). */
export const ORDERS_APP_OWNER_EMAIL = 'hassanawad18@gmail.com';

export function isOrdersAppOwnerEmail(email) {
  return String(email || '').trim().toLowerCase() === ORDERS_APP_OWNER_EMAIL;
}

/** /user-access — Orders Android app (Hassan quotationer dashboard). */
export function isOrdersAppAllowed(grant) {
  return grant?.orders_app === 'allow';
}

/** Same rule as warehouse-mobile `orders-access-self`. Hassan and login-access admin always allowed. */
export function evaluateOrdersAppAccess(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (isOrdersAppOwnerEmail(email)) return true;
  return isOrdersAppAllowed(grant);
}

/** Driver delivery Android app — User Access → Delivery (`warehouse_delivery_app` only). */
export function evaluateWarehouseDeliveryDriverAppAccess(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  return isWarehouseDeliveryAppAllowed(grant);
}

export function isWarehouseProductStockQtyEditAllowed(grant) {
  if (!grant) return false;
  if (isMobileScreenAccessAllowed(grant, 'warehouse_products')) return true;
  if (isMobileScreenAccessAllowed(grant, 'warehouse_incomplete_products')) return true;
  const form = grant.screens?.warehouse_product_form;
  if (form?.insert === 'allow' || form?.edit === 'allow') return true;
  return false;
}

export const FLOOR2_AND_STOREROOM_SCREEN_IDS = Object.freeze([
  'warehouse_floor_2',
  'warehouse_storeroom_1',
  'warehouse_storeroom_2',
  'warehouse_storeroom_3',
]);

export function isCatalogLocationStockIncreaseAllowed(grant, screenId, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.location_stock_increase?.[screenId] === 'allow';
}

export function isCatalogLocationPhotoUploadAllowed(grant, screenId, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.location_photo_upload?.[screenId] === 'allow';
}

/** /user-access — Floor 2 `+ Prod` button on Warehouse Catalog mobile app. */
export function isWarehouseFloor2CreateProductAllowed(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.warehouse_floor2_create_product === 'allow';
}

/** /user-access — Floor 2 `+ Set` button on Warehouse Catalog mobile app. */
export function isWarehouseFloor2CreateSetAllowed(grant, email) {
  if (isProductionLoginAccessAdminEmail(email)) return true;
  if (!grant) return false;
  return grant.warehouse_floor2_create_set === 'allow';
}

/** Screens that can appear as buttons on the mobile dashboard. */
export const MOBILE_DASHBOARD_NAV_SCREEN_IDS = Object.freeze([
  'warehouse_products',
  'warehouse_floor_2',
  'warehouse_storeroom_1',
  'warehouse_storeroom_2',
  'warehouse_storeroom_3',
  'warehouse_packets',
  'warehouse_unused_packets',
  'warehouse_incomplete_products',
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
    label: 'Floor 1',
    description: 'Warehouse Floor 1 products and sets (expand sets for component products and packets)',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_floor_2',
    label: 'Floor 2',
    description: 'Warehouse Floor 2 WIP products — grid view, stock increase, and photo import',
    permissionMatrix: true,
    supportsLocationStockAndPhoto: true,
  },
  {
    id: 'warehouse_storeroom_1',
    label: 'Storeroom 1',
    description: 'Storeroom 1 materials, UOMs, stock on hand, qty increase, and photo import',
    permissionMatrix: true,
    supportsLocationStockAndPhoto: true,
  },
  {
    id: 'warehouse_storeroom_2',
    label: 'Storeroom 2',
    description: 'Storeroom 2 materials, UOMs, stock on hand, qty increase, and photo import',
    permissionMatrix: true,
    supportsLocationStockAndPhoto: true,
  },
  {
    id: 'warehouse_storeroom_3',
    label: 'Storeroom 3',
    description: 'Storeroom 3 materials, UOMs, stock on hand, qty increase, and photo import',
    permissionMatrix: true,
    supportsLocationStockAndPhoto: true,
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
    description: 'Production app: factory truck delivery → Hassan acceptance',
    permissionMatrix: false,
  },
  {
    id: 'warehouse_scan',
    label: 'Barcode scan',
    description: 'Scan Code 128 or QR (inside warehouse products)',
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
  {
    id: 'warehouse_set_form',
    label: 'Add set',
    description: 'Create warehouse set from products',
    permissionMatrix: false,
  },
]);

export const DEFAULT_MOBILE_LANDING_SCREEN = 'dashboard';

const SCREEN_NAV_ROUTE = Object.freeze({
  warehouse_products: 'WarehouseProducts',
  warehouse_floor_2: 'WarehouseFloor2',
  warehouse_storeroom_1: 'WarehouseStoreroom1',
  warehouse_storeroom_2: 'WarehouseStoreroom2',
  warehouse_storeroom_3: 'WarehouseStoreroom3',
  warehouse_incomplete_products: 'WarehouseIncompleteProducts',
  warehouse_packets: 'WarehousePackets',
  warehouse_unused_packets: 'WarehouseUnusedPackets',
  kitwe_send_delivery: 'KitweSendHome',
});

const WAREHOUSE_PRODUCTS_CHILD_SCREENS = Object.freeze([
  'warehouse_scan',
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

/** Per-app screens shown in /user-access for Upholstery, Carpentry, Painting, and Delivery. */
export const UPHOLSTERY_APP_SCREENS = Object.freeze([
  {
    id: 'upholstery_create',
    label: 'Create / Stock-in',
    description: 'Create seating items and add warehouse stock (Zebra labels)',
  },
  {
    id: 'upholstery_manufacture',
    label: 'Manufacture',
    description: 'Start upholstery manufacture and variant inlay',
  },
  {
    id: 'upholstery_jobs',
    label: 'Jobs',
    description: 'Active upholstery production jobs',
  },
  {
    id: 'upholstery_quotes',
    label: 'Quote Orders',
    description: 'Hassan quotation orders routed to upholstery',
  },
  {
    id: 'upholstery_repairs',
    label: 'Repairs',
    description: 'Upholstery return & repair queue',
  },
  {
    id: 'upholstery_push_settings',
    label: 'Alert settings',
    description: 'Production push notification preferences',
  },
]);

export const CARPENTRY_APP_SCREENS = Object.freeze([
  {
    id: 'carpentry_create',
    label: 'Create / Stock-in',
    description: 'Create carpentry products and add stock',
  },
  {
    id: 'carpentry_manufacture',
    label: 'Manufacture',
    description: 'Floor manufacture and BOM deduction',
  },
  {
    id: 'carpentry_jobs',
    label: 'Jobs',
    description: 'Active carpentry production jobs',
  },
  {
    id: 'carpentry_painting',
    label: 'Send to Painting',
    description: 'Send finished carpentry units to painting',
  },
  {
    id: 'carpentry_quotes',
    label: 'Quote Orders',
    description: 'Hassan quotation orders routed to carpentry',
  },
  {
    id: 'carpentry_repairs',
    label: 'Repairs',
    description: 'Carpentry return & repair queue',
  },
  {
    id: 'carpentry_push_settings',
    label: 'Alert settings',
    description: 'Production push notification preferences',
  },
]);

export const PAINTING_APP_SCREENS = Object.freeze([
  {
    id: 'painting_jobs',
    label: 'Painting Jobs',
    description: 'Timed painting jobs; finishing credits Floor 1 stock',
  },
  {
    id: 'painting_repairs',
    label: 'Repairs',
    description: 'Color / painting return & repair queue',
  },
  {
    id: 'painting_push_settings',
    label: 'Alert settings',
    description: 'Production push notification preferences',
  },
]);

export const ORDERS_APP_SCREENS = Object.freeze([
  {
    id: 'orders_customers',
    label: 'Customers',
    description: 'Quote customers (Hassan quotationer)',
  },
  {
    id: 'orders_products',
    label: 'Products',
    description: 'Quote product catalog',
  },
  {
    id: 'orders_new_order',
    label: 'New Order',
    description: 'Create a quotation / factory order',
  },
  {
    id: 'orders_list',
    label: 'Orders',
    description: 'Factory orders and quotations',
  },
  {
    id: 'orders_deliveries',
    label: 'Deliveries',
    description: 'Warehouse deliveries to Kitwe',
  },
  {
    id: 'orders_repairs',
    label: 'Repairs',
    description: 'Kitwe returns and repairs',
  },
  {
    id: 'orders_storage',
    label: 'Storage',
    description: 'Warehouse storage holds',
  },
  {
    id: 'orders_tracking',
    label: 'Tracking',
    description: 'Repairs trackage (all return statuses)',
  },
]);

export const DELIVERY_APP_SCREENS = Object.freeze([
  {
    id: 'delivery_send_kitwe',
    label: 'Send Delivery',
    description: 'Scan products, driver signature, and send truck delivery to Kitwe',
  },
  {
    id: 'delivery_sent_list',
    label: 'Sent Deliveries',
    description: 'View sent deliveries and print delivery notes',
  },
  {
    id: 'delivery_sold_orders',
    label: 'Sold — warehouse storage',
    description: 'Deliver customer items held in warehouse storage (signature + delivery note)',
  },
]);

const WORKSHOP_AND_DELIVERY_SCREEN_GROUPS = Object.freeze([
  { flag: 'warehouse_production_app', screens: UPHOLSTERY_APP_SCREENS },
  { flag: 'carpentry_workshop_app', screens: CARPENTRY_APP_SCREENS },
  { flag: 'painting_workshop_app', screens: PAINTING_APP_SCREENS },
  { flag: 'warehouse_delivery_app', screens: DELIVERY_APP_SCREENS },
  { flag: 'orders_app', screens: ORDERS_APP_SCREENS },
]);

export function isWorkshopOrDeliveryScreenAllowed(grant, screenId, appFlag) {
  if (!grant) return false;
  const ids = screenId === 'delivery_send_kitwe'
    ? ['delivery_send_kitwe', 'kitwe_send_delivery']
    : screenId === 'kitwe_send_delivery'
      ? ['kitwe_send_delivery', 'delivery_send_kitwe']
      : [screenId];
  for (const id of ids) {
    const row = grant.screens?.[id];
    if (row && (row.view === 'allow' || row.view === 'deny')) {
      if (row.view === 'allow') return true;
      return false;
    }
  }
  return Boolean(appFlag && grant[appFlag] === 'allow');
}

/** Full delivery dashboard grant when profile API fails (admin email). */
export function buildDeliveryAppAdminFallbackGrant() {
  const grant = defaultMobileAccessGrant();
  grant.warehouse_delivery_app = 'allow';
  grant.warehouse_production_kitwe = 'deny';
  DELIVERY_APP_SCREENS.forEach((s) => {
    grant.screens[s.id] = buildMobileScreenAccessRow(true);
  });
  grant.screens.kitwe_send_delivery = buildMobileScreenAccessRow(true);
  return grant;
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
  WORKSHOP_AND_DELIVERY_SCREEN_GROUPS.forEach(({ screens: groupScreens }) => {
    groupScreens.forEach((screen) => {
      screens[screen.id] = buildMobileScreenAccessRow(false);
    });
  });
  const locationStockIncrease = {};
  const locationPhotoUpload = {};
  FLOOR2_AND_STOREROOM_SCREEN_IDS.forEach((id) => {
    locationStockIncrease[id] = 'deny';
    locationPhotoUpload[id] = 'deny';
  });
  return {
    app: 'warehouse-catalog',
    landing_screen: DEFAULT_MOBILE_LANDING_SCREEN,
    warehouse_product_stock_qty: 'deny',
    warehouse_catalog_add_product: 'deny',
    warehouse_catalog_label_print: 'deny',
    warehouse_catalog_photo_import: 'deny',
    warehouse_floor2_create_product: 'deny',
    warehouse_floor2_create_set: 'deny',
    warehouse_production_kiosk: 'deny',
    warehouse_production_app: 'deny',
    warehouse_production_photo_upload: 'deny',
    warehouse_production_kitwe: 'deny',
    warehouse_delivery_app: 'deny',
    carpentry_workshop_app: 'deny',
    painting_workshop_app: 'deny',
    orders_app: 'deny',
    location_stock_increase: locationStockIncrease,
    location_photo_upload: locationPhotoUpload,
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

  if (screenId === 'kitwe_send_delivery') {
    return isWarehouseDeliveryAppAllowed(grant);
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

  if (
    merged.warehouse_catalog_add_product !== 'allow'
    && merged.warehouse_catalog_add_product !== 'deny'
  ) {
    const legacyAdd = isMobileScreenAccessAllowed(merged, 'warehouse_products')
      || isMobileScreenAccessAllowed(merged, 'warehouse_incomplete_products');
    merged.warehouse_catalog_add_product = legacyAdd ? 'allow' : 'deny';
  }

  const kitweDeliveryAllowed = isMobileScreenAccessAllowed(merged, 'kitwe_send_delivery')
    || merged.warehouse_production_kitwe === 'allow';

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
    if (screen.id === 'kitwe_send_delivery') {
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

  merged.warehouse_catalog_add_product = merged.warehouse_catalog_add_product === 'allow'
    ? 'allow'
    : 'deny';

  merged.warehouse_catalog_label_print = merged.warehouse_catalog_label_print === 'allow'
    ? 'allow'
    : 'deny';

  merged.warehouse_catalog_photo_import = merged.warehouse_catalog_photo_import === 'allow'
    ? 'allow'
    : 'deny';

  merged.warehouse_floor2_create_product = (
    merged.warehouse_floor2_create_product === 'allow'
    || merged.warehouse_floor2_create_product === true
  )
    ? 'allow'
    : 'deny';

  merged.warehouse_floor2_create_set = (
    merged.warehouse_floor2_create_set === 'allow'
    || merged.warehouse_floor2_create_set === true
  )
    ? 'allow'
    : 'deny';

  const rawStockInc = grant?.location_stock_increase && typeof grant.location_stock_increase === 'object'
    ? grant.location_stock_increase
    : {};
  const rawPhotoUp = grant?.location_photo_upload && typeof grant.location_photo_upload === 'object'
    ? grant.location_photo_upload
    : {};
  merged.location_stock_increase = {};
  merged.location_photo_upload = {};
  FLOOR2_AND_STOREROOM_SCREEN_IDS.forEach((id) => {
    merged.location_stock_increase[id] = (
      rawStockInc[id] === 'allow' || rawStockInc[id] === true
    )
      ? 'allow'
      : 'deny';
    merged.location_photo_upload[id] = (
      rawPhotoUp[id] === 'allow' || rawPhotoUp[id] === true
    )
      ? 'allow'
      : 'deny';
  });

  const addProductAllowed = merged.warehouse_catalog_add_product === 'allow';
  const productFormRow = merged.screens.warehouse_product_form || buildMobileScreenAccessRow(false);
  merged.screens.warehouse_product_form = {
    ...productFormRow,
    insert: addProductAllowed ? 'allow' : 'deny',
  };

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

  merged.warehouse_production_photo_upload = (
    merged.warehouse_production_photo_upload === 'allow'
    || merged.warehouse_production_photo_upload === true
  )
    ? 'allow'
    : 'deny';

  merged.carpentry_workshop_app = (
    merged.carpentry_workshop_app === 'allow' || merged.carpentry_workshop_app === true
  )
    ? 'allow'
    : 'deny';

  merged.painting_workshop_app = (
    merged.painting_workshop_app === 'allow' || merged.painting_workshop_app === true
  )
    ? 'allow'
    : 'deny';

  merged.warehouse_delivery_app = (
    merged.warehouse_delivery_app === 'allow' || merged.warehouse_delivery_app === true
  )
    ? 'allow'
    : 'deny';

  merged.orders_app = (
    merged.orders_app === 'allow' || merged.orders_app === true
  )
    ? 'allow'
    : 'deny';

  WORKSHOP_AND_DELIVERY_SCREEN_GROUPS.forEach(({ flag, screens: groupScreens }) => {
    const rawScreens = grant?.screens || {};
    const hasExplicitGroupScreen = groupScreens.some(
      (s) => rawScreens[s.id]?.view === 'allow' || rawScreens[s.id]?.view === 'deny',
    );
    const fallbackAllowed = merged[flag] === 'allow';
    groupScreens.forEach((s) => {
      const explicitView = rawScreens[s.id]?.view;
      const allowed = explicitView === 'allow'
        ? true
        : explicitView === 'deny'
          ? false
          : fallbackAllowed;
      merged.screens[s.id] = buildMobileScreenAccessRow(allowed);
    });
    if (hasExplicitGroupScreen) {
      const anyAllowed = groupScreens.some((s) => merged.screens[s.id]?.view === 'allow');
      merged[flag] = anyAllowed ? 'allow' : 'deny';
    }
  });

  const deliverySendAllowed = isWorkshopOrDeliveryScreenAllowed(
    merged,
    'delivery_send_kitwe',
    'warehouse_delivery_app',
  );
  const kitweScreenAllowed = kitweDeliveryAllowed || deliverySendAllowed;

  merged.warehouse_production_kitwe = kitweDeliveryAllowed ? 'allow' : 'deny';
  merged.screens.kitwe_send_delivery = buildMobileScreenAccessRow(kitweScreenAllowed);

  if (deliverySendAllowed) {
    merged.warehouse_delivery_app = 'allow';
  }

  return merged;
}
