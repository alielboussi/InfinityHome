import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import {
  getCurrentUser,
  getHomeDashboardPath,
  HASSAN_AWAD,
  isPathAllowed,
  canViewStocktakeFlow,
  canViewStocktakeAggregation,
  isQuotationerOnlyExperience,
  isPublicAppRoute,
  canManageCatalog,
  isHassanAwadUser,
  isHassanQuotationerPreviewForDisplay,
  clearHassanQuotationerPreviewSession,
} from './accessControl';
import { preloadAppRoute, prefetchNavRoutesOnIdle } from './lazyPages';
import { performPortalLogout } from './utils/portalLogout';

const NAV_STORAGE_KEY = 'ent-nav-open';

/** Business-flow order: overview → sales → fulfillment → warehouse → production → inventory → stocktake → admin */
const NAV_GROUPS = [
  {
    id: 'overview',
    title: 'Overview',
    items: [{ label: 'Dashboard', route: '/dashboard' }],
  },
  {
    id: 'commercial',
    title: 'Sales & customers',
    items: [
      { label: 'Customers', route: '/customers' },
      { label: 'POS', route: '/all-sales' },
      { label: 'Laybys', route: '/layby-management' },
      { label: 'Orders', route: '/quotes-board' },
      { label: 'Ledger', route: '/ledger-mobile' },
    ],
  },
  {
    id: 'fulfillment',
    title: 'Fulfillment',
    items: [
      { label: 'Deliveries', route: '/warehouse-deliveries-admin', catalogOnly: true },
      { label: 'Repairs', route: '/warehouse-repairs-admin', catalogOnly: true },
      { label: 'Transfers', route: '/transfers' },
    ],
  },
  {
    id: 'warehouse',
    title: 'Warehouse',
    items: [
      { label: 'Warehouses', route: '/warehouse-floors?floor=1' },
      { label: 'Storerooms', route: '/warehouse-storerooms?room=1', catalogOnly: true },
      { label: 'Units of measure', route: '/materials-uom', catalogOnly: true },
    ],
  },
  {
    id: 'production',
    title: 'Production',
    items: [
      { label: 'Catalogs', route: '/production-catalogs?view=upholstery-catalog', catalogOnly: true },
      { label: 'Jobs', route: '/production-jobs?view=upholstery-jobs', catalogOnly: true },
      { label: 'Production intake', route: '/production-intake', catalogOnly: true },
    ],
  },
  {
    id: 'inventory',
    title: 'Products & inventory',
    items: [
      { label: 'Categories', route: '/categories' },
      { label: 'Kitwe', route: '/kitwe-products' },
      { label: 'Product master', route: '/products-list' },
      { label: 'Labels', route: '/price-labels' },
    ],
  },
  {
    id: 'stocktake',
    title: 'Stocktake',
    items: [
      { label: 'Stocktake', route: '/stocktake' },
    ],
  },
  {
    id: 'admin',
    title: 'Reports & admin',
    items: [
      { label: 'Reports', route: '/reports?report=sales' },
      { label: 'Drivers', route: '/warehouse-delivery-drivers', catalogOnly: true },
      { label: 'Presets', route: '/warehouse-production-presets', catalogOnly: true },
      { label: 'User activity', route: '/user-activity' },
      { label: 'User access', route: '/user-access' },
    ],
  },
];

const QUOTATIONER_ONLY_NAV_GROUPS = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [
      { label: 'Layby Dashboard', route: '/quotationer', exact: true },
    ],
  },
  {
    id: 'quotationer',
    title: 'Quotationer',
    items: [
      { label: 'Manage Customers', route: '/quotationer', search: '?view=customers' },
      { label: 'Manage Products', route: '/quotationer', search: '?view=products' },
      { label: 'New Quote', route: '/quotationer', search: '?view=create' },
      { label: 'Factory Orders', route: '/factory-orders' },
    ],
  },
  {
    id: 'warehouse',
    title: 'Warehouse',
    items: [
      { label: 'Warehouse Deliveries', route: '/warehouse-deliveries' },
      { label: 'Returns', route: '/warehouse-returns' },
      { label: 'Returns Trackage', route: '/warehouse-returns-trackage' },
      { label: 'Warehouse Storage', route: '/warehouse-storage' },
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

const TITLE_MAP = {
  '/dashboard': 'Dashboard',
  '/pos': 'All Sales',
  '/pos-mobile': 'Point of Sale',
  '/all-sales': 'Point of Sale',
  '/quotes-board': 'Orders',
  '/factory-orders': 'Factory Orders',
  '/quotationer': 'Create Quote',
  '/sales-report': 'Sales Report',
  '/sales-report-mobile': 'Sales Report',
  '/customers': 'Customers',
  '/layby-management': 'Layby Management',
  '/layby-management-mobile': 'Layby Management',
  '/ledger-mobile': 'Ledger',
  '/products': 'Products',
  '/products-list': 'Products',
  '/products-list/locations': 'Product locations',
  '/warehouse-floors': 'Warehouses',
  '/warehouse-storerooms': 'Storerooms',
  '/production-workspace': 'Production',
  '/production-catalogs': 'Catalogs',
  '/production-jobs': 'Jobs',
  '/production-intake': 'Production intake',
  '/reports': 'Reports',
  '/warehouse-products': 'Floor 1',
  '/upholstery': 'Upholstery Products',
  '/upholstery-timer': 'Upholstery Jobs',
  '/carpentry': 'Carpentry Products',
  '/carpentry-jobs': 'Carpentry Jobs',
  '/painting-jobs': 'Painting Jobs',
  '/carpentry-warehouse/1': 'Storeroom 1',
  '/carpentry-warehouse/2': 'Storeroom 2',
  '/carpentry-warehouse/3': 'Storeroom 3',
  '/materials-uom': 'Units of measure',
  '/warehouse-floor-2': 'Floor 2',
  '/warehouse-products/packets': 'Packets (Warehouse)',
  '/production': 'New Products',
  '/production-report': 'Upholstery Report',
  '/warehouse-products/incomplete': 'Incomplete products (Warehouse)',
  '/warehouse-products/uncategorized': 'Uncategorized products (Warehouse)',
  '/warehouse-products/sets': 'Sets (Warehouse)',
  '/stock-history': 'Stock History',
  '/categories': 'Categories',
  '/sets': 'Sets',
  '/price-labels': 'Labels',
  '/price-label-mobile': 'Print Labels',
  '/stocktake': 'Stocktake',
  '/stocktake-periods': 'Stocktake',
  '/stock-periods': 'Stock Periods',
  '/stock-count': 'Stock Count',
  '/stock-report-mobile': 'Stock Report',
  '/All-Transfers': 'Transfers',
  '/All-Transfers-summary': 'Transfers Summary',
  '/transfers-report': 'Transfers Report',
  '/carpentry-production-report': 'Carpentry Production',
  '/painting-report': 'Painting Report',
  '/repair-report': 'Repair Report',
  '/warehouse-deliveries': 'Warehouse Deliveries',
  '/warehouse-returns': 'Returns',
  '/warehouse-returns-trackage': 'Returns Trackage',
  '/warehouse-storage': 'Warehouse Storage',
  '/kitwe-products': 'Kitwe',
  '/warehouse-delivery-drivers': 'Drivers',
  '/warehouse-production-presets': 'Presets',
  '/warehouse-deliveries-admin': 'Deliveries',
  '/warehouse-repairs-admin': 'Repairs',
  '/warehouse-products/sales-storage': 'Sales Storage',
  '/transfers': 'Transfers',
  '/lusaka-transfers': 'Transfers',
  '/company-settings': 'Company Settings',
  '/user-activity': 'User Activity',
  '/user-access': 'User Login Access',
};

function backTargetForPath(path, homePath) {
  const p = String(path || '');
  const keys = Object.keys(TITLE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (p === key) return homePath;
    if (p.startsWith(`${key}/`)) return key;
  }
  return homePath;
}

function titleForPath(path, user, search = '') {
  if (!path) return 'Infinity Home';
  if (isQuotationerOnlyExperience(user, path, search) && path === '/quotationer') {
    const params = new URLSearchParams(search || '');
    const view = params.get('view');
    if (view === 'customers') return 'Quote Customers';
    if (view === 'products') return 'Quote Products';
    if (view === 'create') return 'Create Quote';
    if (view === 'list') return 'Factory Orders';
    return 'Dashboard';
  }
  if (path === '/reports') {
    const report = new URLSearchParams(search || '').get('report');
    if (report === 'stock-history') return 'Stock history';
    if (report === 'transfers') return 'Transfers report';
    if (report === 'upholstery') return 'Upholstery production';
    if (report === 'carpentry') return 'Carpentry production';
    if (report === 'painting') return 'Painting jobs';
    if (report === 'repair') return 'Repair / returns';
  }
  if (TITLE_MAP[path]) return TITLE_MAP[path];
  const match = Object.keys(TITLE_MAP).find(key => path.toLowerCase().startsWith(key.toLowerCase()));
  if (match) return TITLE_MAP[match];
  return 'Infinity Home';
}

function readNavOpenDefault() {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(NAV_STORAGE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return window.matchMedia('(min-width: 920px)').matches;
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
  const quotationerOnly = isQuotationerOnlyExperience(user, path, location.search);
  const homePath = quotationerOnly ? HASSAN_AWAD.landingPath : getHomeDashboardPath(user);
  const hassanPreviewBanner = isHassanQuotationerPreviewForDisplay(user, path, location.search);

  const [navOpen, setNavOpen] = React.useState(readNavOpenDefault);

  const setNavOpenPersisted = React.useCallback((next) => {
    setNavOpen(next);
    try {
      window.localStorage.setItem(NAV_STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const chrome = hasUser && !isLogin && !isPublicCount && !isKioskStock;
    document.body.classList.toggle('ent-sidebar-pinned', chrome && navOpen);
    document.body.classList.toggle('ent-sidebar-collapsed', chrome && !navOpen);
    return () => {
      try {
        document.body.classList.remove('ent-sidebar-pinned', 'ent-sidebar-collapsed');
      } catch {
        /* ignore */
      }
    };
  }, [isLogin, isPublicCount, isKioskStock, hasUser, user, navOpen]);

  const visibleGroups = React.useMemo(() => {
    const warehouseStaffNav = !canManageCatalog(user) && !isHassanAwadUser(user);
    const staffGroupIds = ['overview', 'fulfillment', 'warehouse', 'inventory', 'stocktake'];
    const baseGroups = quotationerOnly
      ? QUOTATIONER_ONLY_NAV_GROUPS
      : (warehouseStaffNav
        ? NAV_GROUPS.filter((g) => staffGroupIds.includes(g.id))
        : NAV_GROUPS);
    return dedupeNavGroups(baseGroups
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
        if (item.catalogOnly && !canManageCatalog(user)) return false;
        return isPathAllowed(user, item.route);
      }),
    }))
    .filter(group => group.items.length > 0));
  }, [quotationerOnly, user]);

  React.useEffect(() => {
    const routes = visibleGroups.flatMap((group) => group.items.map((item) => item.route));
    if (homePath) routes.push(homePath);
    prefetchNavRoutesOnIdle(routes);
  }, [visibleGroups, homePath]);

  if (isLogin || isPublicCount || isKioskStock || !user) return null;

  const quotationerParams = new URLSearchParams(location.search || '');
  const isQuotationerHome = path === '/quotationer'
    && !quotationerParams.get('view')
    && !quotationerParams.get('quoteId')
    && !quotationerParams.get('id');
  const isDashboard = path === homePath || (quotationerOnly && isQuotationerHome);
  const title = titleForPath(path, user, location.search);
  const backTarget = backTargetForPath(path, homePath);
  const backIsHome = backTarget === homePath;

  const go = (route, search = '') => {
    if (search) navigate({ pathname: route, search });
    else navigate(route);
  };

  const isItemActive = (item) => {
    const routeSpec = String(item.route || '');
    const [itemPath, itemQs] = routeSpec.split('?');
    if (path.toLowerCase() !== itemPath.toLowerCase()) return false;
    if (item.search) return location.search === item.search;
    if (itemQs) {
      const params = new URLSearchParams(location.search || '');
      const required = new URLSearchParams(itemQs);
      for (const [key, value] of required.entries()) {
        if (params.get(key) !== value) return false;
      }
    }
    if (item.exact) return !location.search;
    return true;
  };

  const closeNavAfterNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 919px)').matches) {
      setNavOpenPersisted(false);
    }
  };

  const handleLogout = () => performPortalLogout(navigate);

  return (
    <>
      {!navOpen ? (
        <button
          type="button"
          className="ent-drawer-toggle ent-drawer-toggle--peek"
          onClick={() => setNavOpenPersisted(true)}
          aria-expanded={false}
          aria-controls="ent-main-nav"
          aria-label="Show navigation menu"
          title="Show menu"
        >
          <FaChevronDown aria-hidden />
        </button>
      ) : null}
      <header className="ent-banner">
        {!isDashboard && (
          <button
            type="button"
            className="ent-back-btn"
            onClick={() => navigate(backTarget)}
            aria-label={backIsHome ? 'Back to Dashboard' : 'Back'}
            title={backIsHome ? 'Back to Dashboard' : `Back to ${TITLE_MAP[backTarget] || 'previous page'}`}
          >
            <FaArrowLeft />
          </button>
        )}
        <h1 className="ent-banner-title">{title}</h1>
        <span className="ent-banner-spacer" aria-hidden="true" />
        <div className="ent-banner-actions">
          {hassanPreviewBanner ? (
            <button
              type="button"
              className="ent-hassan-preview-exit stock-periods-btn stock-periods-btn-secondary"
              onClick={() => {
                clearHassanQuotationerPreviewSession();
                navigate(getHomeDashboardPath(user));
              }}
            >
              Exit Hassan preview
            </button>
          ) : null}
          <button
            type="button"
            className="ent-banner-logout stock-periods-btn stock-periods-btn-secondary"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>
      {hassanPreviewBanner ? (
        <p className="ent-hassan-preview-note" role="status">
          Previewing Hassan Awad&apos;s dashboard while signed in as you.
        </p>
      ) : null}

      <div
        className={`ent-drawer-overlay${navOpen ? ' open' : ''}`}
        aria-hidden={!navOpen}
        onClick={() => setNavOpenPersisted(false)}
        onKeyDown={() => {}}
        role="presentation"
      />
      <nav
        id="ent-main-nav"
        className={`ent-drawer${navOpen ? ' open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="ent-drawer-head">
          <button
            type="button"
            className="ent-drawer-toggle ent-drawer-toggle--collapse"
            onClick={() => setNavOpenPersisted(false)}
            aria-expanded={navOpen}
            aria-controls="ent-main-nav"
            aria-label="Hide navigation menu"
            title="Hide menu"
          >
            <FaChevronUp aria-hidden />
          </button>
        </div>
        {visibleGroups.map((group, groupIndex) => (
          <div className="ent-drawer-group" key={group.id || `${group.title}-${groupIndex}`}>
            <div className="ent-drawer-group-title">{group.title}</div>
            {group.items.map(item => {
              const active = isItemActive(item);
              return (
                <button
                  type="button"
                  key={`${item.route}${item.search || ''}`}
                  className={`ent-drawer-link${active ? ' active' : ''}`}
                  onMouseEnter={() => preloadAppRoute(item.route)}
                  onFocus={() => preloadAppRoute(item.route)}
                  onClick={() => {
                    preloadAppRoute(item.route);
                    go(item.route, item.search || '');
                    closeNavAfterNav();
                  }}
                >
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
