/**
 * packets → products → sets
 * Run: node scripts/verifyWarehouseCatalogHierarchy.js
 */
import {
  isWarehouseProductAssembly,
  isWarehouseSetAssembly,
  validateSetComponentAssembly,
  WAREHOUSE_CATALOG_LEVEL,
} from '../src/utils/warehouseCatalogHierarchy.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const product = { id: 'p1', item_kind: WAREHOUSE_CATALOG_LEVEL.PRODUCT };
const set = { id: 's1', item_kind: WAREHOUSE_CATALOG_LEVEL.SET };

assert(isWarehouseProductAssembly(product), 'product kind');
assert(!isWarehouseProductAssembly(set), 'set is not product');
assert(isWarehouseSetAssembly(set), 'set kind');

validateSetComponentAssembly(product, { setAssemblyId: 's1' });

let threw = false;
try {
  validateSetComponentAssembly(set, { setAssemblyId: 's1' });
} catch (e) {
  threw = true;
  assert(String(e.message).toLowerCase().includes('set'), 'set-in-set message');
}
assert(threw, 'rejects set component');

threw = false;
try {
  validateSetComponentAssembly(product, { setAssemblyId: 'p1' });
} catch (e) {
  threw = true;
}
assert(threw, 'rejects self');

console.log('verifyWarehouseCatalogHierarchy: ok');
