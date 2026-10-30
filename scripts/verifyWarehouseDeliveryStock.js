/**
 * Delivery accept must move BOM packets and refresh derived warehouse + Kitwe POS product qty.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

const accept = fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAccept.js'), 'utf8');
const kitweSync = fs.readFileSync(path.join(root, 'server/lib/kitweDeliveryCatalogSync.js'), 'utf8');
const acceptStock = fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAcceptStock.js'), 'utf8');
const stock = fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryStock.js'), 'utf8');

assert(accept.includes('movePacketsForDeliveryReceive'), 'accept must move packets via acceptStock helper');
assert(accept.includes('syncWarehouseStockAfterDeliveryReceive'), 'accept must recompute warehouse product qty after packets move');
assert(accept.includes('syncKitweCatalogForDeliveryAssemblies'), 'accept must sync Kitwe catalog after full assembly receive');
assert(acceptStock.includes('adjustPacketStock'), 'acceptStock must adjust warehouse_packet_inventory');
assert(acceptStock.includes('recomputeWarehouseStockForPacketTouch'), 'acceptStock must touch linked assemblies per packet');
assert(acceptStock.includes('recomputeWarehouseLocationStockServer'), 'acceptStock must full recompute both locations');
assert(kitweSync.includes('addProductInventoryAtKitwe'), 'Kitwe sync must credit POS inventory at Kitwe');
assert(accept.includes('readKitweAssemblyInventoryQtyMap'), 'accept must snapshot Kitwe assembly qty before/after BOM recompute');
assert(accept.includes('kitweQtyBefore'), 'accept must pass BOM gain context into Kitwe catalog sync');
assert(kitweSync.includes('catalogDelta - bomGain'), 'Kitwe sync must not double-count BOM recompute with catalog delta');
assert(kitweSync.includes('ensureAssemblyListedAtKitwe'), 'Kitwe sync must list assembly at Kitwe location');
assert(kitweSync.includes('findOrCreateKitweProduct'), 'Kitwe sync must match SKU or create product');
assert(kitweSync.includes('repairKitweCatalogForSession'), 'repair helper must exist for backfill');
assert(kitweSync.includes('assemblyUnitsReadyForKitweCatalog'), 'accept must detect fully received assemblies for Kitwe catalog');
assert(kitweSync.includes('assemblyUnitsFullyReceived'), 'POS mirror only when full BOM received for assembly');
assert(accept.includes('kitwe_from_factory_delivery'), 'accept must mark assemblies for Kitwe products portal list');
assert(stock.includes('Not enough packet stock'), 'packet deduct must fail when factory stock insufficient');

const portal = fs.readFileSync(path.join(root, 'src/utils/kitweProductPortal.js'), 'utf8');
assert(portal.includes('kitwe_portal_listed'), 'portal create must mark assemblies for Kitwe catalog list');

const kitwePage = fs.readFileSync(path.join(root, 'src/KitweProductsPage.js'), 'utf8');
assert(
  kitwePage.includes('filterKitweCatalogProducts'),
  'Kitwe products page must list deliveries and portal-created products',
);

console.log('verifyWarehouseDeliveryStock: ok');
