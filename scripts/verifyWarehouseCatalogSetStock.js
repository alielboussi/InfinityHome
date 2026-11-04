import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../src/constants/warehouseShowroomLocations.js';
import { attachWarehouseStockTotals } from '../src/utils/warehouseCatalogStock.js';
import {
  buildWarehouseAssemblyLeftoverQtyMap,
  computeSetComponentUnitsReserved,
  computeWarehouseFactorySetBuildableQty,
  computeWarehouseComponentLeftoverQty,
  formatWarehouseSetStockCount,
} from '../src/utils/warehouseSetMath.js';

const setId = 'set-1';
const threeSeater = 'prod-3';
const single = 'prod-1';

const setItems = [
  {
    set_assembly_id: setId,
    component_assembly_id: threeSeater,
    quantity: 2,
    location_id: WAREHOUSE_FACTORY_LOCATION_ID,
  },
  {
    set_assembly_id: setId,
    component_assembly_id: single,
    quantity: 2,
    location_id: WAREHOUSE_FACTORY_LOCATION_ID,
  },
];

const buildable = computeWarehouseFactorySetBuildableQty(
  setId,
  setItems,
  (id) => (String(id) === threeSeater || String(id) === single ? 18 : 0),
);

if (buildable !== 9) {
  console.error('[verifyWarehouseCatalogSetStock] expected 9 buildable sets, got', buildable);
  process.exit(1);
}

const catalog = attachWarehouseStockTotals({
  warehouseLocationId: WAREHOUSE_FACTORY_LOCATION_ID,
  setItems,
  assemblies: [
    { id: setId, name: 'Test Set', item_kind: 'set', inventory_mode: 'finished' },
    { id: threeSeater, name: '3 Seater', inventory_mode: 'finished' },
    { id: single, name: 'Single', inventory_mode: 'finished' },
  ],
  packets: [],
  assemblyPackets: [],
  inventory: [],
  assemblyInventory: [
    { assembly_id: threeSeater, location_id: WAREHOUSE_FACTORY_LOCATION_ID, quantity: 18 },
    { assembly_id: single, location_id: WAREHOUSE_FACTORY_LOCATION_ID, quantity: 18 },
  ],
});

if (catalog.assemblyWarehouseQty[setId] !== 9) {
  console.error('[verifyWarehouseCatalogSetStock] attachWarehouseStockTotals set qty wrong');
  process.exit(1);
}

if (formatWarehouseSetStockCount(1) !== '1 Set' || formatWarehouseSetStockCount(4) !== '4 Sets') {
  console.error('[verifyWarehouseCatalogSetStock] formatWarehouseSetStockCount failed');
  process.exit(1);
}

const setA = 'set-a';
const productB = 'prod-b';
const productC = 'prod-c';
const excessSetItems = [
  {
    set_assembly_id: setA,
    component_assembly_id: productB,
    quantity: 2,
    location_id: WAREHOUSE_FACTORY_LOCATION_ID,
  },
  {
    set_assembly_id: setA,
    component_assembly_id: productC,
    quantity: 2,
    location_id: WAREHOUSE_FACTORY_LOCATION_ID,
  },
];

const excessCatalog = attachWarehouseStockTotals({
  warehouseLocationId: WAREHOUSE_FACTORY_LOCATION_ID,
  setItems: excessSetItems,
  assemblies: [
    { id: setA, name: 'Set A', item_kind: 'set', inventory_mode: 'finished' },
    { id: productB, name: 'Product B', inventory_mode: 'finished' },
    { id: productC, name: 'Product C', inventory_mode: 'finished' },
  ],
  packets: [],
  assemblyPackets: [],
  inventory: [],
  assemblyInventory: [
    { assembly_id: productB, location_id: WAREHOUSE_FACTORY_LOCATION_ID, quantity: 3 },
    { assembly_id: productC, location_id: WAREHOUSE_FACTORY_LOCATION_ID, quantity: 2 },
  ],
});

if (excessCatalog.assemblyWarehouseQty[setA] !== 1) {
  console.error('[verifyWarehouseCatalogSetStock] expected 1 buildable set, got', excessCatalog.assemblyWarehouseQty[setA]);
  process.exit(1);
}

const leftoverB = excessCatalog.assemblyWarehouseLeftoverQty?.[productB];
const leftoverC = excessCatalog.assemblyWarehouseLeftoverQty?.[productC];
if (leftoverB !== 1 || leftoverC !== 0) {
  console.error('[verifyWarehouseCatalogSetStock] leftover wrong', { leftoverB, leftoverC });
  process.exit(1);
}

const reserved = computeSetComponentUnitsReserved(excessSetItems, () => 1);
if (computeWarehouseComponentLeftoverQty(3, reserved.get(productB)) !== 1) {
  console.error('[verifyWarehouseCatalogSetStock] reservation math failed for B');
  process.exit(1);
}

const leftoverMap = buildWarehouseAssemblyLeftoverQtyMap(
  excessCatalog.assemblyWarehouseQty,
  excessSetItems,
  excessCatalog.assemblies,
);
if (leftoverMap[productB] !== 1) {
  console.error('[verifyWarehouseCatalogSetStock] buildWarehouseAssemblyLeftoverQtyMap failed');
  process.exit(1);
}

console.log('[verifyWarehouseCatalogSetStock] ok');

const portalPage = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/WarehouseProductsPage.js'), 'utf8');
if (!portalPage.includes('buildWarehouseAssemblyLeftoverQtyMap')) {
  console.error('[verifyWarehouseCatalogSetStock] web portal must compute set component leftovers');
  process.exit(1);
}
if (!portalPage.includes('catalogDisplayStockByAssembly')) {
  console.error('[verifyWarehouseCatalogSetStock] web portal must display leftover qty on complete view');
  process.exit(1);
}
if (!portalPage.includes('collectSetComponentAssemblyIds')) {
  console.error('[verifyWarehouseCatalogSetStock] web portal must hide zero-leftover set components');
  process.exit(1);
}
console.log('[verifyWarehouseCatalogSetStock] web portal parity ok');
