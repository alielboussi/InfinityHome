import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import WarehouseTransfer from './WarehouseTransfer';
import WarehouseTransferSummary from './WarehouseTransferSummary';
import WarehouseDeliveries from './WarehouseDeliveries';
import WarehouseDeliveriesAdmin from './WarehouseDeliveriesAdmin';
import LusakaTransfers from './LusakaTransfers';
import LoginPage from './LoginPage';
import Dashboard from './Dashboard';
import Products from './Products';
import Customers from './Customers';
import SalesReportMobile from './SalesReportMobile';
import SalesReport from './SalesReport';
import TransfersReport from './TransfersReport';
import Quotationer from './Quotationer';
import LaybyManagement from './LaybyManagement';
import LaybyManagementMobile from './LaybyManagementMobile';
import CompanySettings from './CompanySettings';
import POS from './POS';
import POSMobile from './POSMobile';
import LedgerMobile from './LedgerMobile';
import StockReportMobile from './StockReportMobile';
import StockReportMobileLocked from './StockReportMobileLocked';
import LusakaStockDisplay from './LusakaStockDisplay';
import StockApp from './StockApp';
import PriceLabels from './PriceLabels';
import PriceLabelMobile from './PriceLabelMobile';
import Sets from './Sets';
import EditSet from './EditSet';
import Categories from './Categories';
import StocktakeControlPage from './StocktakeControlPage';
import StocktakeAggregationPage from './StocktakeAggregationPage';
import StocktakeCountRoute from './StocktakeCountRoute';
import ProductsListPage from './ProductsListPage';
import StockHistoryPage from './StockHistoryPage';
import ZeroStockLocationReset from './ZeroStockLocationReset';
import AllSales from './AllSales';
import Reversal from './Reversal';
import IncompletePackages from './IncompletePackages';
import IncompleteMobileLocked from './IncompleteMobileLocked';
import QuotesBoard from './QuotesBoard.js';
import UserActivityLog from './UserActivityLog';
import UserAccessManagement from './UserAccessManagement';
import DatabaseBackupPage from './DatabaseBackup.js';
import CustomerPrivateBalances from './CustomerPrivateBalances';
import EcommerceSetup from './EcommerceSetup';
import EcommerceSales from './EcommerceSales';
import ShopRoutes from './shop/ShopRoutes';
import AppChrome from './AppChrome';
import useRouteActivityLogger from './hooks/useRouteActivityLogger';
import { getCurrentUser, isPathAllowed, getFallbackPathForUser, getHomeDashboardPath, canViewUserActivity, canViewDatabaseBackup, canManageLoginAccess, canViewCustomerPrivateBalances, canViewStocktakeAggregation, isPublicAppRoute, isAppAuthenticated } from './accessControl';
import { isShopPublicPath } from './utils/shopConstants';
import { bootstrapAppAuth } from './utils/authSession';

function RouteActivityLogger() {
  useRouteActivityLogger();
  return null;
}

const DASHBOARD_THEME_PATHS = new Set([
      '/customers',
      '/products-list',
      '/stock-history',
      '/pos',
      '/layby-management',
      '/quotes-board',
      '/ledger-mobile',
      '/customer-private-balances',
      '/all-transfers',
      '/warehouse-deliveries-admin',
      '/stock-periods',
      '/stocktake',
      '/stocktake/aggregation',
      '/stocktake-periods',
      '/all-sales',
      '/transfers-report',
      '/sales-report',
      '/price-labels',
      '/ecommerce-setup',
      '/ecommerce-sales',
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
            if (path.startsWith('/login') || isPublicAppRoute(path) || isShopPublicPath(path)) return;
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
                  if (path.startsWith('/login') || isPublicAppRoute(path) || isShopPublicPath(path)) {
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

      if (!ready) return null;
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

// Enforce per-user route access (e.g., Hassan only sees quotes, layby-management-mobile, stock-report-mobile)
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
            if (path.startsWith('/login') || isPublicAppRoute(path) || isShopPublicPath(path)) return;

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
            const isShopRoute = isShopPublicPath(location.pathname || '');
            document.documentElement.classList.toggle('stocktake-count-route', isCountRoute);
            document.body.classList.toggle('stocktake-count-route', isCountRoute);
            document.documentElement.classList.toggle('lusaka-stock-route', isLusakaStockRoute);
            document.body.classList.toggle('lusaka-stock-route', isLusakaStockRoute);
            document.documentElement.classList.toggle('shop-route', isShopRoute);
            document.body.classList.toggle('shop-route', isShopRoute);
            return () => {
                  document.documentElement.classList.remove('stocktake-count-route');
                  document.body.classList.remove('stocktake-count-route');
                  document.documentElement.classList.remove('lusaka-stock-route');
                  document.body.classList.remove('lusaka-stock-route');
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/stocktake/count/:locationSlug" element={<StocktakeCountRoute />} />
        <Route path="/stocktake/count" element={<Navigate to="/login" replace />} />
        <Route path="/count" element={<Navigate to="/login" replace />} />
        <Route path="/shop/*" element={<ShopRoutes />} />

        <Route element={<RequireAuthLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/sales-report-mobile" element={<SalesReportMobile />} />
          <Route path="/sales-report" element={<SalesReport />} />
          <Route path="/transfers-report" element={<TransfersReport />} />
          <Route path="/ledger-mobile" element={<LedgerMobile />} />
          <Route path="/customer-private-balances" element={<RequireAdminPage check={canViewCustomerPrivateBalances}><CustomerPrivateBalances /></RequireAdminPage>} />
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
          <Route path="/pos" element={<POS />} />
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
          <Route path="/stocktake/aggregation" element={<RequireAdminPage check={canViewStocktakeAggregation}><StocktakeAggregationPage /></RequireAdminPage>} />
          <Route path="/stocktake-periods" element={<Navigate to="/stocktake" replace />} />
          <Route path="/stocktake-count" element={<Navigate to="/stocktake" replace />} />
          <Route path="/KitweStocktake" element={<Navigate to="/stocktake" replace />} />
          <Route path="/stocktake-entry" element={<Navigate to="/stocktake" replace />} />
          <Route path="/products-list" element={<ProductsListPage />} />
          <Route path="/ecommerce-setup" element={<EcommerceSetup />} />
          <Route path="/ecommerce-sales" element={<EcommerceSales />} />
          <Route path="/stock-history" element={<StockHistoryPage />} />
          <Route path="/zero-stock-location" element={<ZeroStockLocationReset />} />
          <Route path="/stock-count" element={<Navigate to="/stocktake" replace />} />
          <Route path="/all-sales" element={<AllSales />} />
          <Route path="/reversal" element={<Reversal />} />
          <Route path="/user-activity" element={<RequireAdminPage check={canViewUserActivity}><UserActivityLog /></RequireAdminPage>} />
          <Route path="/user-access" element={<RequireAdminPage check={canManageLoginAccess}><UserAccessManagement /></RequireAdminPage>} />
          <Route path="/database-backup" element={<RequireAdminPage check={canViewDatabaseBackup}><DatabaseBackupPage /></RequireAdminPage>} />
          <Route path="/incomplete-packages" element={<IncompletePackages />} />
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
          <Route path="/warehouse-deliveries-admin" element={<WarehouseDeliveriesAdmin />} />
          <Route path="/lusaka-transfers" element={<LusakaTransfers />} />
          <Route path="/Kitwe-Lusaka" element={<Navigate to="/All-Transfers" replace />} />
          <Route path="/Kitwe-Lusaka-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
          <Route path="/warehouse-transfer" element={<Navigate to="/All-Transfers" replace />} />
          <Route path="/warehouse-transfer-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
          <Route path="/outlet-transfer" element={<Navigate to="/Kitwe-Lusaka" replace />} />
          <Route path="/outlet-transfer-summary" element={<Navigate to="/Kitwe-Lusaka-summary" replace />} />
          <Route path="*" element={<FallbackRedirect />} />
        </Route>
      </Routes>
                                                                                                                                                                  </SessionBootstrap>
    </div>
  );
}

export default App;
