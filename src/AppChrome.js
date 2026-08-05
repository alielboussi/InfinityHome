import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCashRegister, FaReceipt, FaQuoteRight, FaChartLine,
  FaUsers, FaWallet, FaClipboardList, FaTags, FaLayerGroup,
  FaThLarge, FaPrint, FaBoxes, FaExchangeAlt,
  FaTruckLoading, FaHistory, FaTachometerAlt, FaBoxOpen, FaPlus, FaDatabase, FaUndo, FaUserShield
} from 'react-icons/fa';
import { getCurrentUser, getHomeDashboardPath, isPathAllowed, canViewStocktakeFlow, canViewStocktakeAggregation, isQuotationerOnlyUser, isPublicAppRoute } from './accessControl';

// Functional groupings for the slide-out navigation drawer.
const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', route: '/dashboard', icon: FaTachometerAlt },
      { label: 'Warehouse Deliveries', route: '/warehouse-deliveries-admin', icon: FaTruckLoading },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'POS', route: '/pos', icon: FaCashRegister },
      { label: 'All Sales', route: '/all-sales', icon: FaReceipt },
      { label: 'Quotes', route: '/quotes-board', icon: FaQuoteRight },
      { label: 'Reversal', route: '/reversal', icon: FaUndo },
    ],
  },
  {
    title: 'Customers & Laybys',
    items: [
      { label: 'Customers', route: '/customers', icon: FaUsers },
      { label: 'Laybys', route: '/layby-management', icon: FaClipboardList },
      { label: 'Ledger', route: '/ledger-mobile', icon: FaWallet },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Products', route: '/products-list', icon: FaTags },
      { label: 'Categories', route: '/categories', icon: FaThLarge },
      { label: 'Sets', route: '/sets', icon: FaLayerGroup },
      { label: 'Incomplete Packages', route: '/incomplete-packages', icon: FaBoxOpen },
      { label: 'Price Labels', route: '/price-labels', icon: FaPrint },
    ],
  },
  {
    title: 'Stocktake Flow',
    items: [
      { label: 'Stocktake', route: '/stocktake', icon: FaBoxes },
      { label: 'Stocktake Aggregation', route: '/stocktake/aggregation', icon: FaClipboardList, adminOnly: true },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Sales Report', route: '/sales-report', icon: FaChartLine },
      { label: 'Transfers Report', route: '/transfers-report', icon: FaExchangeAlt },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'User Activity', route: '/user-activity', icon: FaHistory },
      { label: 'User Login Access', route: '/user-access', icon: FaUserShield },
      { label: 'Database Backup', route: '/database-backup', icon: FaDatabase },
    ],
  },
];

const QUOTATIONER_ONLY_NAV_GROUPS = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [
      { label: 'Layby Dashboard', route: '/quotationer', icon: FaTachometerAlt, exact: true },
    ],
  },
  {
    id: 'quotationer',
    title: 'Quotationer',
    items: [
      { label: 'Manage Customers', route: '/quotationer', search: '?view=customers', icon: FaUsers },
      { label: 'Manage Products', route: '/quotationer', search: '?view=products', icon: FaTags },
      { label: 'New Quote', route: '/quotationer', search: '?view=create', icon: FaPlus },
      { label: 'View Quotes', route: '/quotes-board', icon: FaClipboardList },
    ],
  },
  {
    id: 'warehouse',
    title: 'Warehouse',
    items: [
      { label: 'Warehouse Deliveries', route: '/warehouse-deliveries', icon: FaTruckLoading },
    ],
  },
  {
    id: 'transfers',
    title: 'Transfers',
    items: [
      { label: 'Lusaka Transfers', route: '/lusaka-transfers', icon: FaExchangeAlt },
    ],
  },
  {
    id: 'layby',
    title: 'Layby',
    items: [
      { label: 'Laybys', route: '/layby-management', icon: FaClipboardList },
    ],
  },
];

function dedupeNavGroups(groups) {
  const seenItems = new Set();
  return (groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        const itemKey = `${item.route}|${item.search || ''}|${item.label}`;
        if (seenItems.has(itemKey)) return false;
        seenItems.add(itemKey);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

// Map a pathname to a human-friendly page title for the banner.
const TITLE_MAP = {
  '/dashboard': 'Dashboard',
  '/pos': 'Point of Sale',
  '/pos-mobile': 'Point of Sale',
  '/all-sales': 'All Sales',
  '/reversal': 'Reversal',
  '/quotes-board': 'Quotes',
  '/quotationer': 'Create Quote',
  '/sales-report': 'Sales Report',
  '/sales-report-mobile': 'Sales Report',
  '/customers': 'Customers',
  '/layby-management': 'Layby Management',
  '/layby-management-mobile': 'Layby Management',
  '/ledger-mobile': 'Ledger',
  '/products': 'Products',
  '/products-list': 'Products',
  '/categories': 'Categories',
  '/sets': 'Sets',
  '/price-labels': 'Price Labels',
  '/price-label-mobile': 'Price Labels',
  '/stocktake': 'Stocktake',
  '/stocktake/aggregation': 'Stocktake Aggregation',
  '/stocktake-periods': 'Stocktake',
  '/stock-periods': 'Stock Periods',
  '/stock-count': 'Stock Count',
  '/stock-report-mobile': 'Stock Report',
  '/All-Transfers': 'Transfers',
  '/All-Transfers-summary': 'Transfers Summary',
  '/transfers-report': 'Transfers Report',
  '/warehouse-deliveries': 'Warehouse Deliveries',
  '/warehouse-deliveries-admin': 'Warehouse Deliveries',
  '/lusaka-transfers': 'Lusaka Transfers',
  '/company-settings': 'Company Settings',
  '/user-activity': 'User Activity',
  '/user-access': 'User Login Access',
  '/database-backup': 'Database Backup',
  '/incomplete-packages': 'Incomplete Packages',
};

function titleForPath(path, user, search = '') {
  if (!path) return 'Infinity Home';
  if (isQuotationerOnlyUser(user) && path === '/quotationer') {
    const params = new URLSearchParams(search || '');
    const view = params.get('view');
    if (view === 'customers') return 'Quote Customers';
    if (view === 'products') return 'Quote Products';
    if (view === 'create') return 'Create Quote';
    if (view === 'list') return 'View Quotes';
    return 'Dashboard';
  }
  if (TITLE_MAP[path]) return TITLE_MAP[path];
  const match = Object.keys(TITLE_MAP).find(key => path.toLowerCase().startsWith(key.toLowerCase()));
  if (match) return TITLE_MAP[match];
  return 'Infinity Home';
}

export default function AppChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname || '';

  const user = getCurrentUser();
  const isLogin = /^\/login(\b|\/|\?|#)/i.test(path);
  const isPublicCount = isPublicAppRoute(path);
  const isKioskStock = path.toLowerCase() === '/lusaka-stock';
  const hasUser = Boolean(user);
  const quotationerOnly = isQuotationerOnlyUser(user);
  const homePath = getHomeDashboardPath(user);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    // Count page is a standalone mobile surface — no pinned sidebar.
    const pinned = hasUser && !isLogin && !isPublicCount && !isKioskStock;
    document.body.classList.toggle('ent-sidebar-pinned', pinned);
    return () => {
      try { document.body.classList.remove('ent-sidebar-pinned'); } catch {}
    };
  }, [isLogin, isPublicCount, isKioskStock, hasUser, user]);

  if (isLogin || isPublicCount || isKioskStock || !user) return null;

  const isDashboard = path === homePath || (quotationerOnly && path === '/quotationer' && !location.search);
  const title = titleForPath(path, user, location.search);

  const go = (route, search = '') => {
    if (search) navigate({ pathname: route, search });
    else navigate(route);
  };

  const isItemActive = (item) => {
    const routeMatch = path.toLowerCase() === String(item.route || '').toLowerCase();
    if (!routeMatch) return false;
    if (item.search) return location.search === item.search;
    if (item.exact) return !location.search;
    return true;
  };

  const visibleGroups = dedupeNavGroups((quotationerOnly ? QUOTATIONER_ONLY_NAV_GROUPS : NAV_GROUPS)
    .map(group => {
      if (group.title === 'Stocktake Flow' && !canViewStocktakeFlow(user)) {
        return { ...group, items: [] };
      }
      return group;
    })
    .map(group => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && !canViewStocktakeAggregation(user)) return false;
        return isPathAllowed(user, item.route);
      }),
    }))
    .filter(group => group.items.length > 0));

  return (
    <>
      <header className="ent-banner">
        {!isDashboard && (
          <button
            type="button"
            className="ent-back-btn"
            onClick={() => navigate(homePath)}
            aria-label="Back to Dashboard"
            title="Back to Dashboard"
          >
            <FaArrowLeft />
          </button>
        )}
        <h1 className="ent-banner-title">{title}</h1>
        <span className="ent-banner-spacer" />
      </header>

      <div
        className="ent-drawer-overlay"
        aria-hidden="true"
      />
      <nav className="ent-drawer open permanent" aria-label="Main navigation">
        <div className="ent-drawer-head">
          <span className="ent-drawer-brand">Infinity Home</span>
        </div>
        {visibleGroups.map((group, groupIndex) => (
          <div className="ent-drawer-group" key={group.id || `${group.title}-${groupIndex}`}>
            <div className="ent-drawer-group-title">{group.title}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              const active = isItemActive(item);
              return (
                <button
                  type="button"
                  key={`${item.route}${item.search || ''}`}
                  className={`ent-drawer-link${active ? ' active' : ''}`}
                  onClick={() => go(item.route, item.search || '')}
                >
                  <span className="ent-drawer-ico"><Icon /></span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
