import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import WarehouseTransfer from './WarehouseTransfer';
import WarehouseTransferSummary from './WarehouseTransferSummary';
import WarehouseDeliveries from './WarehouseDeliveries';
import WarehouseDeliveriesAdmin from './WarehouseDeliveriesAdmin';
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
import StockApp from './StockApp';
import PriceLabels from './PriceLabels';
import PriceLabelMobile from './PriceLabelMobile';
import Sets from './Sets';
import EditSet from './EditSet';
import Categories from './Categories';
import StocktakeControlPage from './StocktakeControlPage';
import StocktakeCountSessionPage from './StocktakeCountSessionPage';
import ProductsListPage from './ProductsListPage';
import ZeroStockLocationReset from './ZeroStockLocationReset';
import AllSales from './AllSales';
import IncompletePackages from './IncompletePackages';
import IncompleteMobileLocked from './IncompleteMobileLocked';
import QuotesBoard from './QuotesBoard.js';
import UserActivityLog from './UserActivityLog';
import AppChrome from './AppChrome';
import useRouteActivityLogger from './hooks/useRouteActivityLogger';
import { getCurrentUser, isPathAllowed, getFallbackPathForUser } from './accessControl';
import { bootstrapAppAuth } from './utils/authSession';

function RouteActivityLogger() {
  useRouteActivityLogger();
  return null;
}

const DASHBOARD_THEME_PATHS = new Set([
      '/customers',
      '/products-list',
      '/pos',
      '/layby-management',
      '/quotes-board',
      '/ledger-mobile',
      '/all-transfers',
      '/warehouse-deliveries-admin',
      '/stock-periods',
      '/stocktake',
      '/stocktake-periods',
      '/all-sales',
      '/transfers-report',
      '/sales-report',
      '/price-labels',
].map(path => path.toLowerCase()));

// Quotation subpages already partially imported above; ensure routing covers /quotes and nested create path

// Route guard: if the app was initially opened directly at "/quotes",
// lock navigation to that page only for this session (until tab is closed).
// Quotes lock disabled: was causing unexpected redirects. Left as a no-op to avoid breaking imports.
// Removed unused QuotesRouteGuard (no-op component) to satisfy CI lint no-unused-vars.

// Require authentication: if not logged in, redirect to /login with next=<current path>
function RequireAuth({ children }) {
      const location = useLocation();
      const user = getCurrentUser();

      if (!user) {
            const next = encodeURIComponent(location?.pathname || '/');
            return <Navigate to={`/login?next=${next}`} replace />;
      }
      return children;
}

// Global gate: redirect any unauthenticated access (except /login) to the login page with next=<path>
function GlobalAuthGate() {
      const location = useLocation();
      const navigate = useNavigate();
      const [checking, setChecking] = React.useState(true);
      const [hasLogin, setHasLogin] = React.useState(false);
      const [tabAuthed, setTabAuthed] = React.useState(false);

      React.useEffect(() => {
            const user = getCurrentUser();
            setHasLogin(Boolean(user && (user.id || user.email)));
            try {
                  setTabAuthed(sessionStorage.getItem('bestrest:tabAuthed:v1') === '1');
            } catch {
                  setTabAuthed(false);
            }
            setChecking(false);
      }, []);

      React.useEffect(() => {
            const user = getCurrentUser();
            setHasLogin(Boolean(user && (user.id || user.email)));
            try {
                  setTabAuthed(sessionStorage.getItem('bestrest:tabAuthed:v1') === '1');
            } catch {}
      }, [location.key]);

      React.useEffect(() => {
            if (checking) return;
            const path = location.pathname || '/';
            const needsLogin = !hasLogin || !tabAuthed;
            const publicPaths = ['/stocktake/count'];
            const isPublic = publicPaths.some(p => path.startsWith(p));
            if (needsLogin && !path.startsWith('/login') && !isPublic) {
                  const next = encodeURIComponent(path);
                  navigate(`/login?next=${next}` , { replace: true });
            }
      }, [checking, hasLogin, tabAuthed, location.pathname, navigate]);

      return null;
}

function SessionBootstrap({ children }) {
      const navigate = useNavigate();
      const [ready, setReady] = React.useState(false);

      React.useEffect(() => {
            let active = true;

            (async () => {
                  const path = window.location.pathname || '/';
                  // Public count page has its own Supabase login — do not force app session.
                  if (path.startsWith('/login') || path.startsWith('/stocktake/count')) {
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

// Enforce per-user route access (e.g., Hassan only sees quotes, layby-management-mobile, stock-report-mobile)
function AccessGuard() {
      const location = useLocation();
      const navigate = useNavigate();
      const [authUser, setAuthUser] = React.useState(null);

      React.useEffect(() => {
            setAuthUser(getCurrentUser());
      }, [location.key]);

      React.useEffect(() => {
            // Always allow login page
            const path = location.pathname || '';
            if (path.startsWith('/login')) return;

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
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/products" element={<Products />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/sales-report-mobile" element={<SalesReportMobile />} />
      <Route path="/sales-report" element={<SalesReport />} />
      <Route path="/transfers-report" element={<TransfersReport />} />
                        <Route path="/ledger-mobile" element={<RequireAuth><LedgerMobile /></RequireAuth>} />
      {/* Consolidated Quotationer experience */}
      <Route path="/quotationer" element={<RequireAuth><Quotationer /></RequireAuth>} />
      {/* Legacy routes → redirect to Quotationer */}
      <Route path="/QuotesDashboard" element={<Navigate to="/quotationer" replace />} />
      <Route path="/QuotesCustomers" element={<Navigate to="/quotationer" replace />} />
      <Route path="/QuotesUnits" element={<Navigate to="/quotationer" replace />} />
      <Route path="/QuoteProducts" element={<Navigate to="/quotationer" replace />} />
      <Route path="/quotations" element={<Navigate to="/quotationer" replace />} />
      <Route path="/quotation-create" element={<Navigate to="/quotationer" replace />} />
      <Route path="/quotations-list" element={<Navigate to="/quotes-board" replace />} />
                  <Route path="/quotes-board" element={<RequireAuth><QuotesBoard /></RequireAuth>} />
      <Route path="/QuotationsList" element={<Navigate to="/quotes-board" replace />} />
      <Route path="/layby-management" element={<RequireAuth><LaybyManagement /></RequireAuth>} />
  <Route path="/layby-management-mobile" element={<RequireAuth><LaybyManagementMobile /></RequireAuth>} />
        <Route path="/company-settings" element={<CompanySettings />} />
        <Route path="/pos" element={<POS />} />
  <Route path="/pos-mobile" element={<POSMobile />} />
      <Route path="/LusakaStocktake" element={<Navigate to="/stocktake" replace />} />
      {/* Stock report mobile requires login */}
      <Route path="/stock-report-mobile" element={<RequireAuth><StockReportMobile /></RequireAuth>} />
        <Route path="/stock-app" element={<StockApp />} />
      <Route path="/stock-report-mobile-locked" element={<RequireAuth><StockReportMobileLocked /></RequireAuth>} />
      <Route path="/incomplete-mobile-locked" element={<RequireAuth><IncompleteMobileLocked /></RequireAuth>} />
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
      <Route path="/stocktake" element={<RequireAuth><StocktakeControlPage /></RequireAuth>} />
      <Route path="/stocktake-periods" element={<Navigate to="/stocktake" replace />} />
      <Route path="/stocktake/count" element={<StocktakeCountSessionPage />} />
      <Route path="/stocktake/count/:eventId" element={<Navigate to="/stocktake/count" replace />} />
      <Route path="/stocktake-count" element={<Navigate to="/stocktake" replace />} />
      <Route path="/KitweStocktake" element={<Navigate to="/stocktake" replace />} />
      <Route path="/stocktake-entry" element={<Navigate to="/stocktake" replace />} />
      <Route path="/products-list" element={<RequireAuth><ProductsListPage /></RequireAuth>} />
      <Route path="/zero-stock-location" element={<ZeroStockLocationReset />} />
      <Route path="/stock-count" element={<Navigate to="/stocktake" replace />} />
      <Route path="/all-sales" element={<RequireAuth><AllSales /></RequireAuth>} />
        <Route path="/user-activity" element={<RequireAuth><UserActivityLog /></RequireAuth>} />
  <Route path="/incomplete-packages" element={<IncompletePackages />} />
      {/* Quotationer single entry */}
                  <Route path="/quotes" element={<Navigate to="/quotes-board" replace />} />
                  <Route path="/quotes/create" element={<Navigate to="/quotationer" replace />} />
                        <Route path="/quotes/view" element={<Navigate to="/quotes-board" replace />} />
      <Route path="/quotes/customers" element={<Navigate to="/quotationer" replace />} />
      <Route path="/quotes/products" element={<Navigate to="/quotationer" replace />} />
      <Route path="/quotes/units" element={<Navigate to="/quotationer" replace />} />
            <Route path="/All-Transfers" element={<WarehouseTransfer />} />
            <Route path="/All-Transfers-summary" element={<WarehouseTransferSummary />} />
            <Route path="/Factory-Kitwe" element={<Navigate to="/All-Transfers" replace />} />
            <Route path="/Factory-Kitwe-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
            <Route path="/warehouse-deliveries" element={<RequireAuth><WarehouseDeliveries /></RequireAuth>} />
            <Route path="/warehouse-deliveries-admin" element={<RequireAuth><WarehouseDeliveriesAdmin /></RequireAuth>} />
            <Route path="/Kitwe-Lusaka" element={<Navigate to="/All-Transfers" replace />} />
            <Route path="/Kitwe-Lusaka-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
            <Route path="/warehouse-transfer" element={<Navigate to="/All-Transfers" replace />} />
            <Route path="/warehouse-transfer-summary" element={<Navigate to="/All-Transfers-summary" replace />} />
            <Route path="/outlet-transfer" element={<Navigate to="/Kitwe-Lusaka" replace />} />
            <Route path="/outlet-transfer-summary" element={<Navigate to="/Kitwe-Lusaka-summary" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
                                                                                                                                                                  </SessionBootstrap>
    </div>
  );
}

export default App;
