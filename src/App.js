import React, { Suspense, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { routeSuspenseKey } from './utils/routeSuspenseKey';
import AppChrome from './AppChrome';
import RouteLoadingFallback from './components/RouteLoadingFallback';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import {
  AllSales,
  Categories,
  CompanySettings,
  Customers,
  Dashboard,
  EditSet,
  IncompleteMobileLocked,
  LaybyManagement,
  LaybyManagementMobile,
  LedgerMobile,
  LoginPage,
  LusakaStockDisplay,
  LusakaTransfers,
  POS,
  POSMobile,
  PriceLabelMobile,
  PriceLabels,
  ProductLocationBulkPage,
  Products,
  ProductsListPage,
  Quotationer,
  QuotesBoard,
  Reversal,
  SalesReportMobile,
  Sets,
  StockApp,
  StockReportMobile,
  StockReportMobileLocked,
  StocktakeControlPage,
  StocktakeCountRoute,
  UserAccessManagement,
  UserActivityLog,
  WarehouseDeliveries,
  WarehouseReturns,
  WarehouseReturnsTrackage,
  WarehouseStorage,
  WarehouseDeliveriesAdmin,
  WarehouseRepairsAdmin,
  WarehouseSalesStorageAdmin,
  WarehouseDeliveryDriversPage,
  WarehouseProductionPresetsPage,
  MaterialsUomPage,
  KitweProductsPage,
  KitweSetsPage,
  WarehousePacketEditPage,
  WarehousePacketsPage,
  WarehouseProductEditPage,
  WarehouseProductTransferPage,
  WarehouseTransfer,
  WarehouseTransferSummary,
  ZeroStockLocationReset,
  WarehouseFloorsHubPage,
  WarehouseStoreroomsHubPage,
  ProductionWorkspaceHubPage,
  ProductionCatalogsHubPage,
  ProductionJobsHubPage,
  ProductionIntakeHubPage,
  ReportsHubPage,
} from './lazyPages';
import LegacyStoreroomRedirect from './hubs/LegacyStoreroomRedirect';
import useRouteActivityLogger from './hooks/useRouteActivityLogger';
import { getCurrentUser, isPathAllowed, getFallbackPathForUser, getHomeDashboardPath, canViewUserActivity, canManageLoginAccess, isPublicAppRoute, isAppAuthenticated, isWarehouseProductionKioskPath, canManageCatalog } from './accessControl';
import { bootstrapAppAuth } from './utils/authSession';

const SalesReportMobileScreen = SalesReportMobile;
const LedgerMobileScreen = LedgerMobile;

function RouteActivityLogger() {
  useRouteActivityLogger();
  return null;
}

const DASHBOARD_THEME_PATHS = new Set([
      '/customers',
      '/products-list',
      '/products-list/locations',
      '/stock-history',
      '/pos',
      '/layby-management',
      '/quotes-board',
      '/ledger-mobile',
      '/all-transfers',
      '/warehouse-deliveries-admin',
      '/warehouse-repairs-admin',
      '/warehouse-products/sales-storage',
      '/stock-periods',
      '/stocktake',
      '/stocktake/aggregation',
      '/stocktake-periods',
      '/all-sales',
      '/transfers',
      '/lusaka-transfers',
      '/transfers-report',
      '/production-report',
      '/carpentry-production-report',
      '/painting-report',
      '/repair-report',
      '/upholstery',
      '/upholstery-timer',
      '/carpentry',
      '/carpentry-jobs',
      '/painting-jobs',
      '/warehouse-floors',
      '/warehouse-storerooms',
      '/production-workspace',
      '/production-catalogs',
      '/production-jobs',
      '/production-intake',
      '/reports',
      '/warehouse-floor-2',
      '/carpentry-warehouse/1',
      '/carpentry-warehouse/2',
      '/carpentry-warehouse/3',
      '/materials-uom',
      '/sales-report',
      '/price-labels',
].map(path => path.toLowerCase()));

// Quotation subpages already partially imported above; ensure routing covers /quotes and nested create path

// Route guard: if the app was initially opened directly at "/quotes",
// lock navigation to that page only for this session (until tab is closed).
// Quotes lock disabled: was causing unexpected redirects. Left as a no-op to avoid breaking imports.
// Removed unused QuotesRouteGuard (no-op component) to satisfy CI lint no-unused-vars.

function RequireAuthLayout() {
      const location = useLocation();
      if (!isAppAuthenticated()) {
            const next = encodeURIComponent(location?.pathname || '/');
            return <Navigate to={`/login?next=${next}`} replace />;
      }
      return <Outlet />;
}

// Admin-only pages (User Activity, Database Backup): render only for the allowed account.
function RequireAdminPage({ check, children }) {
      const user = getCurrentUser();
      if (!check(user)) {
            return <Navigate to={getFallbackPathForUser(user, null)} replace />;
      }
      return children;
}

// Global gate: redirect any unauthenticated access (except /login) to the login page with next=<path>
function GlobalAuthGate() {
      const location = useLocation();
      const navigate = useNavigate();
      const [checking, setChecking] = React.useState(true);

      React.useEffect(() => {
            setChecking(false);
      }, []);

      React.useEffect(() => {
            if (checking) return;
            const path = location.pathname || '/';
            if (path.startsWith('/login') || isPublicAppRoute(path)) return;
            if (!isAppAuthenticated()) {
                  const next = encodeURIComponent(path);
                  navigate(`/login?next=${next}`, { replace: true });
            }
      }, [checking, location.pathname, location.key, navigate]);

      return null;
}

function SessionBootstrap({ children }) {
      const navigate = useNavigate();
      const [ready, setReady] = React.useState(false);

      React.useEffect(() => {
            let active = true;

            (async () => {
                  const path = window.location.pathname || '/';
                  if (path.startsWith('/login') || isPublicAppRoute(path)) {
                        if (active) setReady(true);
                        return;
                  }
                  const result = await bootstrapAppAuth();
                  if (!active) return;

                  if (!result.ok) {
                        const next = encodeURIComponent(path);
                        navigate(`/login?next=${next}`, { replace: true });
                  }

                  if (active) setReady(true);
            })();

            return () => {
                  active = false;
            };
      }, [navigate]);

      if (!ready) {
            return (
                  <div className="app-session-loading" role="status" aria-live="polite">
                        <span className="app-route-fallback__spinner" aria-hidden="true" />
                        <span>Starting session…</span>
                  </div>
            );
      }
      return children;
}

function HomeRedirect() {
      const user = getCurrentUser();
      if (!user) return <Navigate to="/login" replace />;
      return <Navigate to={getHomeDashboardPath(user)} replace />;
}

function FallbackRedirect() {
      const user = getCurrentUser();
      return <Navigate to={user ? getHomeDashboardPath(user) : '/login'} replace />;
}

function WarehouseProductionRetiredRedirect() {
      const user = getCurrentUser();
      if (!user) return <Navigate to="/login" replace />;
      const target = canManageCatalog(user) ? '/reports?report=upholstery' : getHomeDashboardPath(user);
      return <Navigate to={target} replace />;
}

// Enforce per-user route access (e.g., Hassan quotationer routes; some users mobile-only layby)
function AccessGuard() {
      const location = useLocation();
      const navigate = useNavigate();
      const [authUser, setAuthUser] = React.useState(null);

      React.useEffect(() => {
            setAuthUser(getCurrentUser());
      }, [location.key]);

      React.useEffect(() => {
            // Always allow login and the public count page
            const path = location.pathname || '';
            if (path.startsWith('/login') || isPublicAppRoute(path)) return;
            if (isWarehouseProductionKioskPath(path)) {
                  if (!authUser) return;
                  const target = canManageCatalog(authUser)
                        ? '/reports?report=upholstery'
                        : getHomeDashboardPath(authUser);
                  navigate(target, { replace: true });
                  return;
            }

            if (!authUser) return; // no session: global gate will handle redirect to login
            if (!isPathAllowed(authUser, path)) {
                  const fb = getFallbackPathForUser(authUser, null);
                  navigate(fb, { replace: true });
            }
      }, [authUser, location.pathname, navigate]);

      return null;
}

// Minimal locked-down application exposing only the warehouse transfer flow
function App() {
      const location = useLocation();
      const suspenseKey = useMemo(
        () => routeSuspenseKey(location.pathname),
        [location.pathname],
      );
      const isDashboardTheme = DASHBOARD_THEME_PATHS.has((location.pathname || '').toLowerCase());

      React.useEffect(() => {
            if (typeof document === 'undefined') return undefined;
            document.body.classList.toggle('dashboard-theme', isDashboardTheme);
            return () => {
                  try { document.body.classList.remove('dashboard-theme'); } catch {}
            };
      }, [isDashboardTheme]);

      // Enterprise white theme applies to every page.
      React.useEffect(() => {
            if (typeof document === 'undefined') return undefined;
            document.body.classList.add('enterprise-theme');
            return () => {
                  try { document.body.classList.remove('enterprise-theme'); } catch {}
            };
      }, []);

      React.useEffect(() => {
            if (typeof document === 'undefined') return undefined;
            const isCountRoute = isPublicAppRoute(location.pathname || '');
            const isLusakaStockRoute = (location.pathname || '').toLowerCase() === '/lusaka-stock';
            const isQuotationerRoute = (location.pathname || '').toLowerCase() === '/quotationer';
            document.documentElement.classList.toggle('stocktake-count-route', isCountRoute);
            document.body.classList.toggle('stocktake-count-route', isCountRoute);
            document.documentElement.classList.toggle('lusaka-stock-route', isLusakaStockRoute);
            document.body.classList.toggle('lusaka-stock-route', isLusakaStockRoute);
            document.documentElement.classList.toggle('quotationer-route', isQuotationerRoute);
            document.body.classList.toggle('quotationer-route', isQuotationerRoute);
            return () => {
                  document.documentElement.classList.remove('stocktake-count-route');
                  document.body.classList.remove('stocktake-count-route');
                  document.documentElement.classList.remove('lusaka-stock-route');
                  document.body.classList.remove('lusaka-stock-route');
                  document.documentElement.classList.remove('quotationer-route');
                  document.body.classList.remove('quotationer-route');
            };
      }, [location.pathname]);

  return (
            <div className={`App${isDashboardTheme ? ' dashboard-theme' : ''}`}>
                                                                                                                                                                  {/* Global authentication gate: force login before any page access */}
                                                                                                                                                                  <GlobalAuthGate />
                                                                                                                                                                  <SessionBootstrap>
                                                                                                                                                                  {/* Enforce per-user route allowlist */}
                                                                                                                                                                  <AccessGuard />
                                                                                                                                                                  {/* Global chrome: page banner, back-to-dashboard, slide-out drawer */}
                                                                                                                                                                  <AppChrome />
                                                                                                                                                                  <RouteActivityLogger />
      <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteLoadingFallback />} key={suspenseKey}>
      <div className="app-route-shell">
      <Routes location={location}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/stocktake/count/:locationSlug" element={<StocktakeCountRoute />} />
        <Route path="/stocktake/count" element={<Navigate to="/login" replace />} />
        <Route path="/count" element={<Navigate to="/login" replace />} />
        <Route path="/shop/*" element={<Navigate to="/login" replace />} />
        <Route path="/warehouse-production/*" element={<WarehouseProductionRetiredRedirect />} />

        <Route element={<RequireAuthLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/sales-report-mobile" element={<SalesReportMobileScreen />} />
          <Route path="/ledger-mobile" element={<LedgerMobileScreen />} />
          <Route path="/quotationer" element={<Quotationer />} />
          <Route path="/QuotesDashboard" element={<Navigate to="/quotationer" replace />} />
          <Route path="/QuotesCustomers" element={<Navigate to="/quotationer" replace />} />
          <Route path="/QuotesUnits" element={<Navigate to="/quotationer" replace />} />
          <Route path="/QuoteProducts" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotations" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotation-create" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotations-list" element={<Navigate to="/quotes-board" replace />} />
          <Route path="/quotes-board" element={<QuotesBoard />} />
          <Route path="/QuotationsList" element={<Navigate to="/quotes-board" replace />} />
          <Route path="/layby-management" element={<LaybyManagement />} />
          <Route path="/layby-management-mobile" element={<LaybyManagementMobile />} />
          <Route path="/company-settings" element={<CompanySettings />} />
          <Route path="/pos" element={<AllSales />} />
          <Route path="/pos-mobile" element={<POSMobile />} />
          <Route path="/LusakaStocktake" element={<Navigate to="/stocktake" replace />} />
          <Route path="/stock-report-mobile" element={<StockReportMobile />} />
          <Route path="/stock-app" element={<StockApp />} />
          <Route path="/stock-report-mobile-locked" element={<StockReportMobileLocked />} />
          <Route path="/lusaka-stock" element={<LusakaStockDisplay />} />
          <Route path="/incomplete-mobile-locked" element={<IncompleteMobileLocked />} />
          <Route path="/quotes-dashboard" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotes-customers" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotes-units" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotes/view" element={<Navigate to="/quotes-board" replace />} />
          <Route path="/quote-products" element={<Navigate to="/quotationer" replace />} />
          <Route path="/price-labels" element={<PriceLabels />} />
          <Route path="/price-label-mobile" element={<PriceLabelMobile />} />
          <Route path="/sets" element={<Sets />} />
          <Route path="/edit-set/:id" element={<EditSet />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/stock-periods" element={<Navigate to="/stocktake" replace />} />
          <Route path="/stocktake" element={<StocktakeControlPage />} />
          <Route path="/stocktake/aggregation" element={<Navigate to="/stocktake#aggregation" replace />} />
          <Route path="/stocktake-periods" element={<Navigate to="/stocktake" replace />} />
          <Route path="/stocktake-count" element={<Navigate to="/stocktake" replace />} />
          <Route path="/KitweStocktake" element={<Navigate to="/stocktake" replace />} />
          <Route path="/stocktake-entry" element={<Navigate to="/stocktake" replace />} />
          <Route path="/products-list/locations" element={<ProductLocationBulkPage />} />
          <Route path="/products-list" element={<ProductsListPage />} />
          <Route path="/reports" element={<ReportsHubPage />} />
          <Route path="/sales-report" element={<Navigate to="/reports?report=sales" replace />} />
          <Route path="/transfers-report" element={<Navigate to="/reports?report=transfers" replace />} />
          <Route path="/production-report" element={<Navigate to="/reports?report=upholstery" replace />} />
          <Route path="/carpentry-production-report" element={<Navigate to="/reports?report=carpentry" replace />} />
          <Route path="/painting-report" element={<Navigate to="/reports?report=painting" replace />} />
          <Route path="/repair-report" element={<Navigate to="/reports?report=repair" replace />} />
          <Route path="/warehouse-products/packets/new" element={<WarehousePacketEditPage />} />
          <Route path="/warehouse-products/packets/:packetId/edit" element={<WarehousePacketEditPage />} />
          <Route path="/warehouse-products/packets" element={<WarehousePacketsPage />} />
          <Route path="/warehouse-products/sales-storage" element={<Navigate to="/warehouse-floors?floor=1&view=sales-storage" replace />} />
          <Route path="/warehouse-products/incomplete" element={<Navigate to="/warehouse-floors?floor=1&view=incomplete" replace />} />
          <Route path="/warehouse-products/uncategorized" element={<Navigate to="/warehouse-floors?floor=1&view=uncategorized" replace />} />
          <Route path="/warehouse-products/sets" element={<Navigate to="/warehouse-floors?floor=1&view=sets" replace />} />
          <Route path="/warehouse-products/new" element={<WarehouseProductEditPage />} />
          <Route path="/warehouse-products/:productId/transfer" element={<WarehouseProductTransferPage />} />
          <Route path="/warehouse-products/:productId/edit" element={<WarehouseProductEditPage />} />
          <Route path="/warehouse-floors" element={<WarehouseFloorsHubPage />} />
          <Route path="/warehouse-products" element={<Navigate to="/warehouse-floors?floor=1" replace />} />
          <Route path="/warehouse-floor-2" element={<Navigate to="/warehouse-floors?floor=2" replace />} />
          <Route path="/warehouse-storerooms" element={<WarehouseStoreroomsHubPage />} />
          <Route path="/carpentry-warehouse/:index" element={<LegacyStoreroomRedirect />} />
          <Route path="/production-catalogs" element={<ProductionCatalogsHubPage />} />
          <Route path="/production-jobs" element={<ProductionJobsHubPage />} />
          <Route path="/production-intake" element={<ProductionIntakeHubPage />} />
          <Route path="/production-workspace" element={<ProductionWorkspaceHubPage />} />
          <Route path="/upholstery" element={<Navigate to="/production-catalogs?view=upholstery-catalog" replace />} />
          <Route path="/carpentry" element={<Navigate to="/production-catalogs?view=carpentry-catalog" replace />} />
          <Route path="/upholstery-timer" element={<Navigate to="/production-jobs?view=upholstery-jobs" replace />} />
          <Route path="/carpentry-jobs" element={<Navigate to="/production-jobs?view=carpentry-jobs" replace />} />
          <Route path="/painting-jobs" element={<Navigate to="/production-jobs?view=painting-jobs" replace />} />
          <Route path="/production" element={<Navigate to="/production-intake" replace />} />
          <Route path="/materials-uom" element={<MaterialsUomPage />} />
          <Route path="/ecommerce-setup" element={<Navigate to="/dashboard" replace />} />
          <Route path="/ecommerce-sales" element={<Navigate to="/dashboard" replace />} />
          <Route path="/stock-history" element={<Navigate to="/reports?report=stock-history" replace />} />
          <Route path="/zero-stock-location" element={<ZeroStockLocationReset />} />
          <Route path="/stock-count" element={<Navigate to="/stocktake" replace />} />
          <Route path="/all-sales" element={<POS />} />
          <Route path="/reversal" element={<Reversal />} />
          <Route path="/user-activity" element={<RequireAdminPage check={canViewUserActivity}><UserActivityLog /></RequireAdminPage>} />
          <Route path="/user-access" element={<RequireAdminPage check={canManageLoginAccess}><UserAccessManagement /></RequireAdminPage>} />
          <Route path="/database-backup" element={<Navigate to="/dashboard" replace />} />
          <Route path="/quotes" element={<Navigate to="/quotes-board" replace />} />
          <Route path="/quotes/create" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotes/customers" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotes/products" element={<Navigate to="/quotationer" replace />} />
          <Route path="/quotes/units" element={<Navigate to="/quotationer" replace />} />
          <Route path="/All-Transfers" element={<WarehouseTransfer />} />
          <Route path="/All-Transfers-summary" element={<WarehouseTransferSummary />} />
          <Route path="/Factory-Kitwe" element={<Navigate to="/All-Transfers" replace />} />
          <Route path="/Factory-Kitwe-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
          <Route path="/warehouse-deliveries" element={<WarehouseDeliveries />} />
          <Route path="/warehouse-returns" element={<WarehouseReturns />} />
          <Route path="/warehouse-returns-trackage" element={<WarehouseReturnsTrackage />} />
          <Route path="/warehouse-storage" element={<WarehouseStorage />} />
          <Route path="/warehouse-deliveries-admin" element={<WarehouseDeliveriesAdmin />} />
          <Route
            path="/warehouse-repairs-admin"
            element={(
              <RequireAdminPage check={canManageCatalog}>
                <WarehouseRepairsAdmin />
              </RequireAdminPage>
            )}
          />
          <Route
            path="/warehouse-sales-storage-admin"
            element={(
              <RequireAdminPage check={canManageCatalog}>
                <WarehouseSalesStorageAdmin />
              </RequireAdminPage>
            )}
          />
          <Route path="/warehouse-delivery-drivers" element={<WarehouseDeliveryDriversPage />} />
          <Route path="/warehouse-production-presets" element={<WarehouseProductionPresetsPage />} />
          <Route path="/kitwe-products/sets/create" element={<KitweSetsPage mode="create" />} />
          <Route path="/kitwe-products/sets" element={<KitweSetsPage />} />
          <Route path="/kitwe-products" element={<KitweProductsPage />} />
          <Route path="/transfers" element={<LusakaTransfers />} />
          <Route path="/lusaka-transfers" element={<Navigate to="/transfers" replace />} />
          <Route path="/Kitwe-Lusaka" element={<Navigate to="/All-Transfers" replace />} />
          <Route path="/Kitwe-Lusaka-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
          <Route path="/warehouse-transfer" element={<Navigate to="/All-Transfers" replace />} />
          <Route path="/warehouse-transfer-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
          <Route path="/outlet-transfer" element={<Navigate to="/Kitwe-Lusaka" replace />} />
          <Route path="/outlet-transfer-summary" element={<Navigate to="/Kitwe-Lusaka-summary" replace />} />
          <Route path="*" element={<FallbackRedirect />} />
        </Route>
      </Routes>
      </div>
      </Suspense>
      </RouteErrorBoundary>
                                                                                                                                                                  </SessionBootstrap>
    </div>
  );
}

export default App;
