/**
 * Send Delivery catalog filter — Warehouse Floor 1 (/warehouse-products) only for truck.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function firstExistingPath(relativePaths) {
  for (const rel of relativePaths) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const filterPath = firstExistingPath([
  'mobile-apps/warehouse-delivery/deliveryKit/lib/deliveryWarehouseCatalog.js',
  'mobile-apps/warehouse-upholstery/lib/deliveryWarehouseCatalog.js',
  'mobile-apps/warehouse-production/lib/deliveryWarehouseCatalog.js',
]);
const kitwePath = firstExistingPath([
  'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendHomeScreen.js',
  'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendHomeScreen.js',
]);
const flowDocPath = path.join(root, 'docs/factory-warehouse-flow.md');
const mobileCatalogPath = path.join(root, 'server/lib/warehouseCatalogMobile.js');
const printPath = firstExistingPath([
  'mobile-apps/warehouse-delivery/deliveryKit/lib/printDeliveryNoteHtml.js',
  'mobile-apps/warehouse-upholstery/lib/printDeliveryNoteHtml.js',
]);
const printModalPath = firstExistingPath([
  'mobile-apps/warehouse-delivery/deliveryKit/components/DeliveryPrintModal.js',
  'mobile-apps/warehouse-delivery/delivery-overlays/components/DeliveryPrintModal.js',
]);

assert(filterPath, 'deliveryWarehouseCatalog.js missing (delivery, upholstery, or production app lib)');
assert(kitwePath, 'KitweSendHomeScreen.js missing under warehouse-delivery');
assert(fs.existsSync(mobileCatalogPath), 'warehouseCatalogMobile.js required');
assert(printPath, 'printDeliveryNoteHtml.js missing');
assert(printModalPath, 'DeliveryPrintModal.js missing');

const filterSrc = fs.readFileSync(filterPath, 'utf8');
const kitweSrc = fs.readFileSync(kitwePath, 'utf8');
const mobileCatalogSrc = fs.readFileSync(mobileCatalogPath, 'utf8');
const printSrc = fs.readFileSync(printPath, 'utf8');
const printModalSrc = fs.readFileSync(printModalPath, 'utf8');

assert(filterSrc.includes('filterAssembliesForDeliveryWarehouse'), 'filter export missing');
assert(filterSrc.includes('isCompleteCatalogProduct'), 'must use complete catalog rule');
assert(filterSrc.includes('assemblyUsesPacketBom'), 'must allow warehouse packet BOM products');
assert(filterSrc.includes('factory-warehouse-flow'), 'must reference flow doc');
assert(filterSrc.includes('FACTORY_LOCATION_ID'), 'delivery filter must pin Floor 1 factory location');
assert(filterSrc.includes('isDeliveryCatalogBoundToFloor2'), 'delivery filter must reject Floor 2-bound catalogs');
const warehouseMobilePath = path.join(root, 'server/handlers/warehouse-mobile.js');
assert(fs.existsSync(warehouseMobilePath), 'warehouse-mobile.js required');
const warehouseMobileSrc = fs.readFileSync(warehouseMobilePath, 'utf8');
assert(
  warehouseMobileSrc.includes('repair_floor2_deliveries'),
  'catalog-list must expose repair admin-queue lines for mobile delivery',
);
assert(
  warehouseMobileSrc.includes('order_floor2_deliveries'),
  'catalog-list must expose production order delivery lines for mobile',
);
assert(
  warehouseMobileSrc.includes('listRepairFloor2DeliveriesForCatalog'),
  'repair delivery list helper required on catalog-list',
);

assert(kitweSrc.includes('filterAssembliesForDeliveryWarehouse'), 'Kitwe send must filter catalog');
assert(kitweSrc.includes('deliveryScanNotInWarehouse'), 'scan must reject off-catalog products');

assert(
  mobileCatalogSrc.includes('WAREHOUSE_FACTORY_LOCATION_ID'),
  'catalog-list must know Floor 1 factory location id',
);
assert(
  mobileCatalogSrc.includes('resolveWarehouseFloor2Location'),
  'catalog-list must identify Floor 2 so it is not used as delivery stock',
);
assert(
  /warehouseLocationId = String\(WAREHOUSE_FACTORY_LOCATION_ID\)/.test(mobileCatalogSrc),
  'catalog-list stock maps must pin Floor 1 factory location (not fuzzy warehouse name)',
);
assert(
  mobileCatalogSrc.includes('floor2LocationId'),
  'catalog-list must expose floor2LocationId for delivery Floor 2 rejection',
);

assert(printSrc.includes('DELIVERY_PRINT_TIMEOUT_MS = 60_000'), 'print must enforce 1-minute timeout');
assert(printSrc.includes('isPrintConnectivityFailure'), 'print must classify connectivity timeouts');
assert(printModalSrc.includes('deliveryPrintTimeoutError'), 'print modal must prompt retry after timeout');
assert(printModalSrc.includes('isPrintConnectivityFailure'), 'print modal must treat connectivity failures as retryable');

assert(fs.existsSync(flowDocPath), 'factory-warehouse-flow doc required');

console.log('verifyDeliveryWarehouseCatalog: ok');
