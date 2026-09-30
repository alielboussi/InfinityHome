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

/** Screens that can appear as buttons on the mobile dashboard. */
export const MOBILE_DASHBOARD_NAV_SCREEN_IDS = Object.freeze([
  'warehouse_products',
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
    description: 'Browse products and packets; add via scan or forms',
    permissionMatrix: true,
  },
  {
    id: 'warehouse_scan',
    label: 'Barcode scan',
    description: 'Scan Code 128 or QR (inside warehouse products)',
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
});

const WAREHOUSE_PRODUCTS_CHILD_SCREENS = Object.freeze([
  'warehouse_scan',
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
    return isMobileScreenAccessAllowed(grant, 'warehouse_products');
  }

  return isMobileScreenAccessAllowed(grant, screenId);
}

/** Dashboard buttons derived from Page — View on each navigable screen. */
export function getMobileDashboardNavItems(grant, userEmail) {
  return MOBILE_DASHBOARD_NAV_SCREEN_IDS
    .map((id) => MOBILE_SCREENS.find((s) => s.id === id))
    .filter(Boolean)
    .filter((screen) => canMobileScreenView(grant, screen.id))
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
  WAREHOUSE_PRODUCTS_CHILD_SCREENS.forEach((childId) => {
    merged.screens[childId] = buildMobileScreenAccessRow(productsAllowed);
  });

  return merged;
}
