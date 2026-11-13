/**
 * Hassan Awad quotationer dashboard — web portal sidebar and Orders Android tiles stay in lockstep.
 * ORDERS_APP_DASHBOARD_PARITY_LOCKED (scripts/verifyOrdersApp.js)
 *
 * Web: AppChrome QUOTATIONER_ONLY_NAV_GROUPS (Hassan / quotationer-only UX).
 * App: mobile-apps/orders DashboardScreen tiles + stack routes (same APIs as web routes).
 */

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
    webLabel: 'New Quote',
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
    i18nKey: 'tileOrders',
    mciIcon: 'clipboard-text-outline',
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
    webLabel: 'Repairs Trackage',
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
