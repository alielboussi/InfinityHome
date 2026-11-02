/**
 * Set delivery print groups — Factory → Kitwe mobile delivery.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { buildDeliveryPrintGroupsFromEntries } from '../src/utils/warehouseDeliveryPrintGroups.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const setEntries = [
  {
    id: 'p1',
    kind: 'set-parent',
    name: 'Demo Set',
    quantity: 2,
    combo_id: 'grp1',
    metadata: { delivery_set_group_id: 'grp1', units: 2 },
  },
  {
    id: 'c1',
    kind: 'set-component',
    name: 'Sofa',
    quantity: 2,
    parent_combo_id: 'grp1',
    metadata: { delivery_set_group_id: 'grp1', assembly_id: 'prod1', assembly_name: 'Sofa' },
  },
  {
    id: 'pk1',
    kind: 'packet',
    name: 'Carton A',
    quantity: 4,
    metadata: {
      delivery_set_group_id: 'grp1',
      assembly_id: 'prod1',
      packet_number: 1,
    },
  },
];

const fromEntries = buildDeliveryPrintGroupsFromEntries(setEntries);
assert(fromEntries.length >= 1, 'set entries should produce print group');
assert(fromEntries[0].set_name === 'Demo Set', 'set_name on print group');
assert(fromEntries[0].lines.some((l) => l.depth === 1 && l.name === 'Sofa'), 'product depth 1');
assert(fromEntries[0].lines.some((l) => l.depth === 2), 'packet depth 2');

const productOnlyEntries = [
  {
    id: 'x1',
    kind: 'assembly',
    name: 'Chair',
    quantity: 3,
    metadata: { assembly_id: 'chair', assembly_name: 'Chair', finished_unit: true, units: 3 },
  },
];
const plain = buildDeliveryPrintGroupsFromEntries(productOnlyEntries);
assert(plain.length === 1 && !plain[0].set_name, 'non-set delivery unchanged shape');

const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
assert(mobile.includes('processSetDeliveryGroup'), 'delivery submit must process set groups');
assert(mobile.includes('warehouse_set_items'), 'catalog load must include set items');

const catalogMobile = fs.readFileSync(path.join(root, 'server/lib/warehouseCatalogMobile.js'), 'utf8');
assert(catalogMobile.includes('setItems'), 'mobile catalog must return setItems');
assert(catalogMobile.includes('saveSetAssemblyForMobile'), 'mobile must save sets');

console.log('verifyWarehouseDeliverySetPrint: ok');
