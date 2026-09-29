const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'src/mobile/mobileAccessManifest.js');
const sharedManifestPath = path.join(root, 'mobile-apps/shared/mobileAccessManifest.js');
const appPath = path.join(root, 'mobile-apps/warehouse-catalog/App.js');

const manifestSrc = fs.readFileSync(manifestPath, 'utf8');
const sharedManifestSrc = fs.readFileSync(sharedManifestPath, 'utf8');

function extractScreensBlock(src) {
  return src.split('export const MOBILE_SCREENS')[1]?.split('export const DEFAULT')[0] || '';
}

assert(
  extractScreensBlock(manifestSrc) === extractScreensBlock(sharedManifestSrc),
  'mobile-apps/shared/mobileAccessManifest.js is out of sync with src/mobile/mobileAccessManifest.js (MOBILE_SCREENS)',
);
const screensBlock = manifestSrc.split('export const MOBILE_SCREENS')[1]?.split('export const DEFAULT')[0] || '';
const manifestIds = new Set(
  [...screensBlock.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]),
);

const routeMap = {
  Dashboard: 'dashboard',
  WarehouseProducts: 'warehouse_products',
  WarehouseScan: 'warehouse_scan',
  PacketForm: 'warehouse_packet_form',
  ProductForm: 'warehouse_product_form',
};

const appSrc = fs.readFileSync(appPath, 'utf8');
const routed = new Set();
[...appSrc.matchAll(/name="([^"]+)"/g)].forEach((m) => {
  const mapped = routeMap[m[1]];
  if (mapped) routed.add(mapped);
});

routed.forEach((id) => {
  assert(
    manifestIds.has(id),
    `Screen "${id}" is in App.js navigation but missing from MOBILE_SCREENS (mobileAccessManifest.js)`,
  );
});

assert(routed.has('dashboard'), 'Dashboard route must exist in warehouse-catalog/App.js');

console.log(`verifyMobileAccessManifest: ok (${routed.size} screens checked)`);
