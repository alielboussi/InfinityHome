#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const root = path.resolve(import.meta.dirname, '..');

const mustInclude = [
  ['src/mobile/mobileAccessManifest.js', 'warehouse_farm_1'],
  ['src/mobile/mobileAccessManifest.js', 'delivery_send_farm'],
  ['src/constants/farmWarehouseLocations.js', 'Farm Warehouse 1'],
  ['server/lib/farmWarehouseDelivery.js', 'fetchCatalogForFarmDelivery'],
  ['server/lib/ensureFarmWarehouseLocation.js', 'ensureFarmWarehouseLocation'],
  ['server/lib/warehouseFarmDeliveryNumber.js', 'FRM0000000001'],
  ['server/lib/warehouseFarmReturnNumber.js', 'WFLR0000000001'],
  ['mobile-apps/warehouse-catalog/App.js', 'FarmWarehouse'],
  ['mobile-apps/warehouse-delivery/App.js', 'FarmSendHome'],
  ['mobile-apps/warehouse-delivery/App.js', 'WarehouseFromFarmHome'],
  ['src/mobile/mobileAccessManifest.js', 'delivery_send_warehouse'],
  ['src/hubs/WarehouseFloorsHubPage.js', "label: 'Farm'"],
];

for (const [rel, needle] of mustInclude) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert(src.includes(needle), `${rel} must include ${needle}`);
}

const wm = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
['catalog-farm-list', 'farm-delivery-submit', 'farm-delivery-catalog', 'farm-return-catalog', 'farm-return-submit'].forEach((op) => {
  assert(wm.includes(`'${op}'`), `warehouse-mobile missing op ${op}`);
});

console.log('verifyFarmWarehouse: ok');
