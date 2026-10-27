import { lazy } from 'react';
import LusakaTransfersPage from './LusakaTransfers';

/** Attach .preload for drawer hover prefetch (same chunk as lazy()). */
function lazyRoute(factory) {
  const Component = lazy(factory);
  Component.preload = factory;
  return Component;
}

export const WarehouseTransfer = lazyRoute(() => import('./WarehouseTransfer'));
export const WarehouseTransferSummary = lazyRoute(() => import('./WarehouseTransferSummary'));
export const WarehouseDeliveries = lazyRoute(() => import('./WarehouseDeliveries'));
export const WarehouseDeliveriesAdmin = lazyRoute(() => import('./WarehouseDeliveriesAdmin'));
export const WarehouseDeliveriesHassanTest = lazyRoute(() => import('./WarehouseDeliveriesHassanTest'));
export const WarehouseDeliveryDriversPage = lazyRoute(() => import('./WarehouseDeliveryDriversPage'));
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

/** Nav route → dynamic import (for prefetch on drawer hover). */
export const routePreloadByPath = {
  '/dashboard': () => import('./Dashboard'),
  '/warehouse-deliveries-admin': () => import('./WarehouseDeliveriesAdmin'),
  '/warehouse-deliveries-hassan-test': () => import('./WarehouseDeliveriesHassanTest'),
  '/customers': () => import('./Customers'),
  '/all-sales': () => import('./AllSales'),
  '/pos': () => import('./POS'),
  '/layby-management': () => import('./LaybyManagement'),
  '/quotes-board': () => import('./QuotesBoard.js'),
  '/reversal': () => import('./Reversal'),
  '/ledger-mobile': () => import('./LedgerMobile'),
  '/categories': () => import('./Categories'),
  '/products-list': () => import('./ProductsListPage'),
  '/warehouse-products': () => import('./WarehouseProductsPage'),
  '/stock-history': () => import('./StockHistoryPage'),
  '/price-labels': () => import('./PriceLabels'),
  '/ecommerce-setup': () => import('./EcommerceSetup'),
  '/ecommerce-sales': () => import('./EcommerceSales'),
  '/stocktake': () => import('./StocktakeControlPage'),
  '/stocktake/aggregation': () => import('./StocktakeAggregationPage'),
  '/transfers': () => Promise.resolve({ default: LusakaTransfersPage }),
  '/All-Transfers': () => import('./WarehouseTransfer'),
  '/All-Transfers-summary': () => import('./WarehouseTransferSummary'),
  '/sales-report': () => import('./SalesReport'),
  '/transfers-report': () => import('./TransfersReport'),
  '/production-report': () => import('./ProductionReport'),
  '/user-activity': () => import('./UserActivityLog'),
  '/user-access': () => import('./UserAccessManagement'),
  '/database-backup': () => import('./DatabaseBackup.js'),
  '/products-list/locations': () => import('./ProductLocationBulkPage'),
  '/sets': () => import('./Sets'),
  '/products': () => import('./Products'),
};

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
