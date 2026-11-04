import { WAREHOUSE_FACTORY_LOCATION_ID } from '../src/constants/warehouseShowroomLocations.js';
import { attachWarehouseStockTotals } from '../src/utils/warehouseCatalogStock.js';
import { computeWarehouseFactorySetBuildableQty, formatWarehouseSetStockCount } from '../src/utils/warehouseSetMath.js';

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

console.log('[verifyWarehouseCatalogSetStock] ok');
