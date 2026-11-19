/**
 * Hassan Awad quotationer dashboard — web portal sidebar and Orders Android tiles stay in lockstep.
 * ORDERS_APP_DASHBOARD_PARITY_LOCKED (scripts/verifyOrdersApp.js)
 *
 * Web: AppChrome QUOTATIONER_ONLY_NAV_GROUPS (Hassan / quotationer-only UX).
 * App: mobile-apps/orders DashboardScreen — `ORDERS_APP_HOME_TILES`; stack still exposes all parity routes.
 */

/** Orders APK home dashboard. Web Hassan sidebar stays full `ORDERS_APP_DASHBOARD_PARITY`. */
export const ORDERS_APP_HOME_TILES = Object.freeze([
  {
    screenId: 'orders_new_order',
    mobileStack: 'NewOrder',
    i18nKey: 'tileNewOrder',
    mciIcon: 'plus-box-outline',
  },
  {
    screenId: 'orders_list',
    mobileStack: 'Orders',
    i18nKey: 'tileFactoryOrders',
    mciIcon: 'clipboard-text-outline',
  },
  {
    screenId: 'orders_showroom_new',
    mobileStack: 'ShowroomOrderCreate',
    i18nKey: 'tileNewShowroomOrder',
    mciIcon: 'store-plus',
  },
  {
    screenId: 'orders_showroom_list',
    mobileStack: 'ShowroomOrders',
    i18nKey: 'tileShowroomOrders',
    mciIcon: 'store-outline',
  },
  {
    screenId: 'orders_floor2',
    mobileStack: 'Floor2',
    i18nKey: 'tileFloor2',
    mciIcon: 'floor-plan',
  },
  {
    screenId: 'orders_deliveries',
    mobileStack: 'Deliveries',
    i18nKey: 'tileWarehouseDeliveries',
    mciIcon: 'truck-delivery-outline',
  },
  {
    screenId: 'orders_tracking',
    mobileStack: 'Tracking',
    i18nKey: 'tileProductionTracking',
    mciIcon: 'map-marker-path',
  },
]);

/** Web-only Hassan landing; Orders APK uses the tile dashboard instead. */
export const HASSAN_WEB_DASHBOARD_HOME = Object.freeze({
  label: 'Layby Dashboard',
  route: '/quotationer',
  exact: true,
});

/**
 * @typedef {Object} OrdersDashboardParityRow
 * @property {string} screenId — ORDERS_APP_SCREENS id (`orders_*`)
 * @property {'quotationer'|'warehouse'} navGroup — AppChrome group id
 * @property {string} webLabel — Sidebar label on Hassan web portal
 * @property {string} webRoute — React Router path (must be under HASSAN_AWAD.allowedRoutes)
 * @property {string} [webSearch] — e.g. `?view=customers`
 * @property {string} mobileStack — React Navigation screen name in orders App.js
 * @property {string} i18nKey — productionKioskI18n UI_STRINGS key
 * @property {string} mciIcon — MaterialCommunityIcons name on mobile dashboard
 */

/** @type {Readonly<OrdersDashboardParityRow[]>} */
export const ORDERS_APP_DASHBOARD_PARITY = Object.freeze([
  {
    screenId: 'orders_customers',
    navGroup: 'quotationer',
    webLabel: 'Manage Customers',
    webRoute: '/quotationer',
    webSearch: '?view=customers',
    mobileStack: 'Customers',
    i18nKey: 'tileCustomers',
    mciIcon: 'account-group',
  },
  {
    screenId: 'orders_products',
    navGroup: 'quotationer',
    webLabel: 'Manage Products',
    webRoute: '/quotationer',
    webSearch: '?view=products',
    mobileStack: 'Products',
    i18nKey: 'tileProducts',
    mciIcon: 'cube-outline',
  },
  {
    screenId: 'orders_new_order',
    navGroup: 'quotationer',
    webLabel: 'Create Factory Order',
    webRoute: '/quotationer',
    webSearch: '?view=create',
    mobileStack: 'NewOrder',
    i18nKey: 'tileNewOrder',
    mciIcon: 'plus-box-outline',
  },
  {
    screenId: 'orders_list',
    navGroup: 'quotationer',
    webLabel: 'Factory Orders',
    webRoute: '/factory-orders',
    webSearch: '',
    mobileStack: 'Orders',
    i18nKey: 'tileFactoryOrders',
    mciIcon: 'clipboard-text-outline',
  },
  {
    screenId: 'orders_showroom_new',
    navGroup: 'quotationer',
    webLabel: 'Create Showroom Order',
    webRoute: '/showroom-orders/create',
    webSearch: '',
    mobileStack: 'ShowroomOrderCreate',
    i18nKey: 'tileNewShowroomOrder',
    mciIcon: 'store-plus',
  },
  {
    screenId: 'orders_showroom_list',
    navGroup: 'quotationer',
    webLabel: 'Showroom Orders',
    webRoute: '/showroom-orders',
    webSearch: '',
    mobileStack: 'ShowroomOrders',
    i18nKey: 'tileShowroomOrders',
    mciIcon: 'store-outline',
  },
  {
    screenId: 'orders_floor2',
    navGroup: 'quotationer',
    webLabel: 'Floor 2 Products',
    webRoute: '/hassan-floor-2',
    webSearch: '',
    mobileStack: 'Floor2',
    i18nKey: 'tileFloor2',
    mciIcon: 'floor-plan',
  },
  {
    screenId: 'orders_deliveries',
    navGroup: 'warehouse',
    webLabel: 'Warehouse Deliveries',
    webRoute: '/warehouse-deliveries',
    webSearch: '',
    mobileStack: 'Deliveries',
    i18nKey: 'tileDeliveries',
    mciIcon: 'truck-delivery-outline',
  },
  {
    screenId: 'orders_repairs',
    navGroup: 'warehouse',
    webLabel: 'Repairs',
    webRoute: '/warehouse-returns',
    webSearch: '',
    mobileStack: 'Repairs',
    i18nKey: 'tileRepairs',
    mciIcon: 'wrench-clock',
  },
  {
    screenId: 'orders_storage',
    navGroup: 'warehouse',
    webLabel: 'Warehouse Storage',
    webRoute: '/warehouse-storage',
    webSearch: '',
    mobileStack: 'Storage',
    i18nKey: 'tileStorage',
    mciIcon: 'warehouse',
  },
  {
    screenId: 'orders_tracking',
    navGroup: 'warehouse',
    webLabel: 'Production tracking',
    webRoute: '/warehouse-returns-trackage',
    webSearch: '',
    mobileStack: 'Tracking',
    i18nKey: 'tileTracking',
    mciIcon: 'map-marker-path',
  },
]);

export function buildQuotationerOnlyNavGroups() {
  const mapItem = (row) => ({
    label: row.webLabel,
    route: row.webRoute,
    ...(row.webSearch ? { search: row.webSearch } : {}),
    ...(row.webRoute === '/quotationer' && !row.webSearch ? { exact: true } : {}),
  });

  const quotationerItems = ORDERS_APP_DASHBOARD_PARITY.filter((r) => r.navGroup === 'quotationer').map(mapItem);
  const warehouseItems = ORDERS_APP_DASHBOARD_PARITY.filter((r) => r.navGroup === 'warehouse').map(mapItem);

  return [
    {
      id: 'dashboard',
      title: 'Dashboard',
      items: [HASSAN_WEB_DASHBOARD_HOME],
    },
    {
      id: 'quotationer',
      title: 'Quotationer',
      items: quotationerItems,
    },
    {
      id: 'warehouse',
      title: 'Warehouse',
      items: warehouseItems,
    },
  ];
}

/** Pre-built nav groups for `AppChrome` (quotationer-only sidebar). */
export const QUOTATIONER_ONLY_NAV_GROUPS = buildQuotationerOnlyNavGroups();

export function hassanParityWebPaths() {
  const paths = new Set(['/quotationer']);
  for (const row of ORDERS_APP_DASHBOARD_PARITY) {
    paths.add(row.webRoute);
  }
  return [...paths];
}
