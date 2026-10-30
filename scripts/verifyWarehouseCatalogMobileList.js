/**
 * Mobile catalog-list must support a fast linked-packet load (product list).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mobile = fs.readFileSync(path.join(root, 'server/lib/warehouseCatalogMobile.js'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
const store = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-catalog/shared/warehouseCatalogStore.js'),
  'utf8',
);

if (!mobile.includes('loadMobileCatalogPackets')) {
  console.error('[verifyWarehouseCatalogMobileList] missing loadMobileCatalogPackets');
  process.exit(1);
}
if (!mobile.includes("packetLoad === 'all'")) {
  console.error('[verifyWarehouseCatalogMobileList] missing packetLoad modes');
  process.exit(1);
}
if (!handler.includes('packet_load')) {
  console.error('[verifyWarehouseCatalogMobileList] handler must read packet_load');
  process.exit(1);
}
if (!store.includes('loadPersistedWarehouseCatalog')) {
  console.error('[verifyWarehouseCatalogMobileList] mobile disk cache missing');
  process.exit(1);
}
if (!store.includes('packet_load: packetLoad')) {
  console.error('[verifyWarehouseCatalogMobileList] store must pass packet_load');
  process.exit(1);
}

console.log('verifyWarehouseCatalogMobileList: ok');
