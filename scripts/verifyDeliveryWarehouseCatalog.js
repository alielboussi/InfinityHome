/**
 * Send Delivery catalog filter — Warehouse Floor 1 (/warehouse-products) only for truck.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const filterPath = path.join(
  __dirname,
  '../mobile-apps/warehouse-production/lib/deliveryWarehouseCatalog.js',
);
const kitwePath = path.join(
  __dirname,
  '../mobile-apps/warehouse-production/screens/KitweSendHomeScreen.js',
);
const flowDocPath = path.join(__dirname, '../docs/factory-warehouse-flow.md');

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
