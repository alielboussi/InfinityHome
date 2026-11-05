/**
 * Production must use Gemini; catalog must use direct upload only.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const prodAttach = fs.readFileSync(
  path.join(root, 'server/lib/warehouseProductionPhotoAttach.js'),
  'utf8',
);
const catalogAttach = fs.readFileSync(
  path.join(root, 'server/lib/warehouseCatalogPhotoAttach.js'),
  'utf8',
);
const packetPhoto = fs.readFileSync(
  path.join(root, 'server/lib/productionPacketCatalogPhoto.js'),
  'utf8',
);
const prodPhotoApiPath = [
  'mobile-apps/warehouse-upholstery/services/productionPhotoApi.js',
  'mobile-apps/warehouse-production/services/productionPhotoApi.js',
].map((rel) => path.join(root, rel)).find((p) => fs.existsSync(p));
const prodPhotoApi = fs.readFileSync(prodPhotoApiPath, 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[verifyProductionPhotoAiPath] ${msg}`);
    process.exit(1);
  }
}

assert(
  prodAttach.includes('const requireAi = true'),
  'warehouse-production-photo must always require AI retouch',
);
assert(
  prodAttach.includes('directCatalogUpload: false'),
  'production photo attach must not use direct catalog upload',
);
assert(
  catalogAttach.includes('directCatalogUpload: true'),
  'catalog photo attach must use direct upload',
);
assert(
  catalogAttach.includes('requireAiRetouch: false'),
  'catalog photo attach must not require AI',
);
assert(
  prodPhotoApi.includes('/api/warehouse-production-photo'),
  'Production app must call warehouse-production-photo API',
);
assert(
  !prodPhotoApi.includes('warehouse-catalog-photo'),
  'Production app must not call warehouse-catalog-photo API',
);
assert(
  prodAttach.includes('runPendingPortalSetup'),
  'production photo attach must apply deferred portal stock after AI retouch',
);
assert(
  packetPhoto.includes('directCatalogUpload && requireAiRetouch'),
  'must block direct upload combined with required AI',
);

console.log('[verifyProductionPhotoAiPath] ok');
