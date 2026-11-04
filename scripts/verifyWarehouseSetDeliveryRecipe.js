/**
 * Warehouse set → Kitwe: mirror factory recipe on delivery; resolve components from Kitwe or factory.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  resolveSetComponentsForDelivery,
  resolveSetDeliveryRecipeLocationId,
  factorySetRecipeComponentLines,
} from '../src/utils/warehouseSetDeliveryRecipe.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../src/constants/warehouseShowroomLocations.js';
import { WAREHOUSE_TO_LOCATION_ID } from '../src/utils/warehouseDelivery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const factorySetId = 'set-1';
const tableId = 'table-1';
const chairId = 'chair-1';
const setItems = [
  {
    set_assembly_id: factorySetId,
    location_id: WAREHOUSE_FACTORY_LOCATION_ID,
    component_assembly_id: tableId,
    quantity: 1,
  },
  {
    set_assembly_id: factorySetId,
    location_id: WAREHOUSE_FACTORY_LOCATION_ID,
    component_assembly_id: chairId,
    quantity: 6,
  },
];
const assemblies = [
  { id: factorySetId, name: 'Dining Set', item_kind: 'set' },
  { id: tableId, name: 'Table', item_kind: 'product' },
  { id: chairId, name: 'Chair', item_kind: 'product' },
];

assert(
  resolveSetDeliveryRecipeLocationId(factorySetId, setItems) === WAREHOUSE_FACTORY_LOCATION_ID,
  'factory recipe used when Kitwe missing',
);

const components = resolveSetComponentsForDelivery(factorySetId, 2, setItems, assemblies);
assert(components.length === 2, 'two components from factory recipe');
assert(components[0].product_qty === 2, 'table qty 2 sets');
assert(components.find((c) => c.assembly_id === chairId).product_qty === 12, '6 chairs × 2 sets');

const kitweItems = [
  ...setItems,
  {
    set_assembly_id: factorySetId,
    location_id: WAREHOUSE_TO_LOCATION_ID,
    component_assembly_id: tableId,
    quantity: 1,
  },
];
assert(
  resolveSetDeliveryRecipeLocationId(factorySetId, kitweItems) === WAREHOUSE_TO_LOCATION_ID,
  'Kitwe recipe wins when present',
);

const factoryLines = factorySetRecipeComponentLines(factorySetId, setItems);
assert(factoryLines.length === 2, 'factory lines export');

const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
assert(mobile.includes('ensureKitweSetRecipeFromFactory'), 'submit must mirror Kitwe set recipe');

const accept = fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAccept.js'), 'utf8');
assert(accept.includes('ensureKitweSetRecipesForDeliverySession'), 'accept must ensure Kitwe set recipe');

const setCart = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/lib/deliverySetCart.js'),
  'utf8',
);
assert(setCart.includes('warehouseSetDeliveryRecipe'), 'production app must use shared set recipe resolver');

console.log('verifyWarehouseSetDeliveryRecipe: ok');
