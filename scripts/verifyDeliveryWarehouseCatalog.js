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
  'mobile-apps/warehouse-upholstery/lib/deliveryWarehouseCatalog.js',
  'mobile-apps/warehouse-production/lib/deliveryWarehouseCatalog.js',
]);
const kitwePath = firstExistingPath([
  'mobile-apps/warehouse-delivery/delivery-screens/KitweSendHomeScreen.js',
  'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendHomeScreen.js',
]);
const flowDocPath = path.join(root, 'docs/factory-warehouse-flow.md');

assert(filterPath, 'deliveryWarehouseCatalog.js missing (upholstery or production app lib)');
assert(kitwePath, 'KitweSendHomeScreen.js missing under warehouse-delivery');

const filterSrc = fs.readFileSync(filterPath, 'utf8');
const kitweSrc = fs.readFileSync(kitwePath, 'utf8');

assert(filterSrc.includes('filterAssembliesForDeliveryWarehouse'), 'filter export missing');
assert(filterSrc.includes('isCompleteCatalogProduct'), 'must use complete catalog rule');
assert(filterSrc.includes('assemblyUsesPacketBom'), 'must allow warehouse packet BOM products');
assert(filterSrc.includes('factory-warehouse-flow'), 'must reference flow doc');
assert(!filterSrc.includes('delivery_floor2_assembly_ids'), 'Floor 2 WIP must not be deliverable');

assert(kitweSrc.includes('filterAssembliesForDeliveryWarehouse'), 'Kitwe send must filter catalog');
assert(kitweSrc.includes('deliveryScanNotInWarehouse'), 'scan must reject off-catalog products');

assert(fs.existsSync(flowDocPath), 'factory-warehouse-flow doc required');

console.log('verifyDeliveryWarehouseCatalog: ok');
