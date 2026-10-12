import {
  assemblyUsesFinishedBoxReceiving,
  finishedUnitsFromBoxCount,
  formatWarehouseBoxAndUnitStock,
} from '../src/utils/warehouseUnitsPerCarton.js';
import { WAREHOUSE_INVENTORY_MODE } from '../src/utils/warehouseAssemblyMath.js';

const chair = { inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED, units_per_carton: 2 };
const pkt = { id: 'p1', qty_per_unit: 1 };

if (!assemblyUsesFinishedBoxReceiving(chair, [pkt])) throw new Error('box receiving');
if (assemblyUsesFinishedBoxReceiving(chair, [])) throw new Error('needs packet');
if (finishedUnitsFromBoxCount(3, 2) !== 6) throw new Error('3 boxes = 6 units');
if (formatWarehouseBoxAndUnitStock(6, 2).text !== '3 boxes · 6 units') {
  throw new Error(`format: ${formatWarehouseBoxAndUnitStock(6, 2).text}`);
}

console.log('verifyWarehouseUnitsPerCarton: ok');
