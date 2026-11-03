import { lazy } from 'react';
import LusakaTransfersPage from './LusakaTransfers';

const modulePromises = new WeakMap();

/** Same import promise for lazy(), preload, and drawer prefetch (avoids duplicate / racing loads). */
function importRouteModule(factory, retriesLeft = 2) {
  const cached = modulePromises.get(factory);
  if (cached) return cached;

  const attempt = (left) => factory().catch((err) => {
    if (left <= 0) throw err;
    return new Promise((resolve) => {
      setTimeout(resolve, 400);
    }).then(() => attempt(left - 1));
  });

  const promise = attempt(retriesLeft);
  modulePromises.set(factory, promise);
  return promise;
}

/** Attach .preload for drawer hover prefetch (same chunk as lazy()). */
function lazyRoute(factory) {
  const load = () => importRouteModule(factory);
  const Component = lazy(load);
  Component.preload = load;
  return Component;
}

export const WarehouseTransfer = lazyRoute(() => import('./WarehouseTransfer'));
export const WarehouseTransferSummary = lazyRoute(() => import('./WarehouseTransferSummary'));
export const WarehouseDeliveries = lazyRoute(() => import('./WarehouseDeliveries'));
export const WarehouseReturns = lazyRoute(() => import('./WarehouseReturns'));
export const WarehouseReturnsTrackage = lazyRoute(() => import('./WarehouseReturnsTrackage'));
export const WarehouseStorage = lazyRoute(() => import('./WarehouseStorage'));
export const WarehouseDeliveriesAdmin = lazyRoute(() => import('./WarehouseDeliveriesAdmin'));
export const WarehouseRepairsAdmin = lazyRoute(() => import('./WarehouseRepairsAdmin'));
export const WarehouseSalesStorageAdmin = lazyRoute(() => import('./WarehouseSalesStorageAdmin'));
export const WarehouseDeliveryDriversPage = lazyRoute(() => import('./WarehouseDeliveryDriversPage'));
export const WarehouseProductionPresetsPage = lazyRoute(() => import('./WarehouseProductionPresetsPage'));
export const KitweProductsPage = lazyRoute(() => import('./KitweProductsPage'));
export const KitweSetsPage = lazyRoute(() => import('./KitweSetsPage'));
/** Eager-loaded: factory tablets must not depend on a lazy chunk for stock moves. */
export const LusakaTransfers = LusakaTransfersPage;
export const LoginPage = lazyRoute(() => import('./LoginPage'));
export const Dashboard = lazyRoute(() => import('./Dashboard'));
export const Products = lazyRoute(() => import('./Products'));
export const Customers = lazyRoute(() => import('./Customers'));
export const SalesReportMobile = lazyRoute(() => import('./SalesReportMobile'));
export const SalesReport = lazyRoute(() => import('./SalesReport'));
export const TransfersReport = lazyRoute(() => import('./TransfersReport'));
export const Quotationer = lazyRoute(() => import('./Quotationer'));
export const LaybyManagement = lazyRoute(() => import('./LaybyManagement'));
export const LaybyManagementMobile = lazyRoute(() => import('./LaybyManagementMobile'));
export const CompanySettings = lazyRoute(() => import('./CompanySettings'));
export const POS = lazyRoute(() => import('./POS'));
export const POSMobile = lazyRoute(() => import('./POSMobile'));
export const LedgerMobile = lazyRoute(() => import('./LedgerMobile'));
export const StockReportMobile = lazyRoute(() => import('./StockReportMobile'));
export const StockReportMobileLocked = lazyRoute(() => import('./StockReportMobileLocked'));
export const LusakaStockDisplay = lazyRoute(() => import('./LusakaStockDisplay'));
export const StockApp = lazyRoute(() => import('./StockApp'));
export const PriceLabels = lazyRoute(() => import('./PriceLabels'));
export const PriceLabelMobile = lazyRoute(() => import('./PriceLabelMobile'));
export const Sets = lazyRoute(() => import('./Sets'));
export const EditSet = lazyRoute(() => import('./EditSet'));
export const Categories = lazyRoute(() => import('./Categories'));
export const StocktakeControlPage = lazyRoute(() => import('./StocktakeControlPage'));
export const StocktakeAggregationPage = lazyRoute(() => import('./StocktakeAggregationPage'));
export const StocktakeCountRoute = lazyRoute(() => import('./StocktakeCountRoute'));
export const ProductsListPage = lazyRoute(() => import('./ProductsListPage'));
export const ProductLocationBulkPage = lazyRoute(() => import('./ProductLocationBulkPage'));
export const WarehouseProductsPage = lazyRoute(() => import('./WarehouseProductsPage'));
export const WarehousePacketsPage = lazyRoute(() => import('./WarehousePacketsPage'));
export const WarehouseProductEditPage = lazyRoute(() => import('./WarehouseProductEditPage'));
export const WarehouseProductTransferPage = lazyRoute(() => import('./WarehouseProductTransferPage'));
export const WarehousePacketEditPage = lazyRoute(() => import('./WarehousePacketEditPage'));
export const ProductionAdminPage = lazyRoute(() => import('./ProductionAdminPage'));
export const ProductionReport = lazyRoute(() => import('./ProductionReport'));
export const StockHistoryPage = lazyRoute(() => import('./StockHistoryPage'));
export const ZeroStockLocationReset = lazyRoute(() => import('./ZeroStockLocationReset'));
export const AllSales = lazyRoute(() => import('./AllSales'));
export const Reversal = lazyRoute(() => import('./Reversal'));
export const IncompleteMobileLocked = lazyRoute(() => import('./IncompleteMobileLocked'));
export const QuotesBoard = lazyRoute(() => import('./QuotesBoard.js'));
export const UserActivityLog = lazyRoute(() => import('./UserActivityLog'));
export const UserAccessManagement = lazyRoute(() => import('./UserAccessManagement'));
export const DatabaseBackupPage = lazyRoute(() => import('./DatabaseBackup.js'));
export const EcommerceSetup = lazyRoute(() => import('./EcommerceSetup'));
export const EcommerceSales = lazyRoute(() => import('./EcommerceSales'));
export const ShopRoutes = lazyRoute(() => import('./shop/ShopRoutes'));

/** Nav route → dynamic import (for prefetch on drawer hover). Uses each page's lazy preload for one shared chunk promise. */
export const routePreloadByPath = {
  '/dashboard': () => Dashboard.preload(),
  '/production': () => ProductionAdminPage.preload(),
  '/kitwe-products': () => KitweProductsPage.preload(),
  '/warehouse-products': () => WarehouseProductsPage.preload(),
  '/categories': () => Categories.preload(),
  '/reversal': () => Reversal.preload(),
  '/warehouse-delivery-drivers': () => WarehouseDeliveryDriversPage.preload(),
  '/warehouse-production-presets': () => WarehouseProductionPresetsPage.preload(),
  '/warehouse-deliveries-admin': () => WarehouseDeliveriesAdmin.preload(),
  '/warehouse-repairs-admin': () => WarehouseRepairsAdmin.preload(),
  '/warehouse-sales-storage-admin': () => WarehouseSalesStorageAdmin.preload(),
  '/customers': () => Customers.preload(),
  '/all-sales': () => AllSales.preload(),
  '/pos': () => POS.preload(),
  '/layby-management': () => LaybyManagement.preload(),
  '/quotes-board': () => QuotesBoard.preload(),
  '/ledger-mobile': () => LedgerMobile.preload(),
  '/products-list': () => ProductsListPage.preload(),
  '/stock-history': () => StockHistoryPage.preload(),
  '/price-labels': () => PriceLabels.preload(),
  '/ecommerce-setup': () => EcommerceSetup.preload(),
  '/ecommerce-sales': () => EcommerceSales.preload(),
  '/stocktake': () => StocktakeControlPage.preload(),
  '/stocktake/aggregation': () => StocktakeAggregationPage.preload(),
  '/transfers': () => Promise.resolve({ default: LusakaTransfersPage }),
  '/All-Transfers': () => WarehouseTransfer.preload(),
  '/All-Transfers-summary': () => WarehouseTransferSummary.preload(),
  '/sales-report': () => SalesReport.preload(),
  '/transfers-report': () => TransfersReport.preload(),
  '/production-report': () => ProductionReport.preload(),
  '/user-activity': () => UserActivityLog.preload(),
  '/user-access': () => UserAccessManagement.preload(),
  '/database-backup': () => DatabaseBackupPage.preload(),
  '/products-list/locations': () => ProductLocationBulkPage.preload(),
  '/sets': () => Sets.preload(),
  '/products': () => Products.preload(),
  '/warehouse-products/packets': () => WarehousePacketsPage.preload(),
  '/kitwe-products/sets': () => KitweSetsPage.preload(),
};

function scheduleIdleWork(fn) {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => fn(), { timeout: 4000 });
    return;
  }
  setTimeout(fn, 120);
}

/** Warm lazy chunks for sidebar routes when the browser is idle (smooth first click). */
export function prefetchNavRoutesOnIdle(paths, { batchSize = 2, gapMs = 40 } = {}) {
  if (typeof window === 'undefined') return;
  const list = [...new Set((paths || [])
    .map((p) => String(p || '').split('?')[0].toLowerCase())
    .filter(Boolean))];
  if (!list.length) return;

  let index = 0;
  const pump = () => {
    const end = Math.min(list.length, index + batchSize);
    for (; index < end; index += 1) {
      preloadAppRoute(list[index]);
    }
    if (index < list.length) {
      setTimeout(() => scheduleIdleWork(pump), gapMs);
    }
  };

  scheduleIdleWork(pump);
}

export function preloadAppRoute(path) {
  const key = String(path || '').split('?')[0].toLowerCase();
  const fn = routePreloadByPath[key];
  if (fn) {
    try {
      fn();
    } catch {
      /* ignore prefetch errors */
    }
  }
}
