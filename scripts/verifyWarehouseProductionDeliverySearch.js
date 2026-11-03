/**
 * Send Delivery (Production app) — product search must not throw on bad catalog rows.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchJs = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/lib/deliveryCatalogSearch.js'),
  'utf8',
);
const kitweHome = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/screens/KitweSendHomeScreen.js'),
  'utf8',
);
const setCart = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/lib/deliverySetCart.js'),
  'utf8',
);

assert(
  searchJs.includes('deliverySearchAssemblyRows'),
  'delivery catalog search must normalize assemblies list',
);
assert(
  searchJs.includes('Array.isArray(assemblies)'),
  'delivery catalog search must guard non-array assemblies',
);
assert(
  kitweHome.includes("isSetAssembly as isWarehouseSetAssembly"),
  'KitweSendHome must import isSetAssembly directly (avoid re-export init order)',
);
assert(
  setCart.includes('resolveSetComponentsForDelivery'),
  'deliverySetCart must resolve set components locally for mobile',
);
assert(
  !setCart.includes("from './deliveryPrintGroups'"),
  'deliverySetCart must not import deliveryPrintGroups (breaks circular init)',
);

console.log('verifyWarehouseProductionDeliverySearch: ok');
