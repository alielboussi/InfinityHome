const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

const manifestSrc = fs.readFileSync(
  path.join(root, 'src/mobile/mobileAccessManifest.js'),
  'utf8',
);
const sharedManifestSrc = fs.readFileSync(
  path.join(root, 'mobile-apps/shared/mobileAccessManifest.js'),
  'utf8',
);
const productionSharedSrc = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/shared/mobileAccessManifest.js'),
  'utf8',
);
const loginAccessSrc = fs.readFileSync(
  path.join(root, 'server/lib/loginAccess.js'),
  'utf8',
);
const warehouseMobileSrc = fs.readFileSync(
  path.join(root, 'server/handlers/warehouse-mobile.js'),
  'utf8',
);
const stocktakeSrc = fs.readFileSync(path.join(root, 'api/stocktake.js'), 'utf8');
const hookSrc = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/hooks/useProductionAccessGrant.js'),
  'utf8',
);

function extractAdminEmail(src) {
  const m = src.match(/PRODUCTION_LOGIN_ACCESS_ADMIN_EMAIL\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

const emails = [
  extractAdminEmail(manifestSrc),
  extractAdminEmail(sharedManifestSrc),
  extractAdminEmail(productionSharedSrc),
].filter(Boolean);

assert(emails.length === 3, 'PRODUCTION_LOGIN_ACCESS_ADMIN_EMAIL missing from manifests');
assert(
  new Set(emails).size === 1,
  `Admin email mismatch across manifests: ${emails.join(', ')}`,
);
assert(
  loginAccessSrc.includes('PRODUCTION_LOGIN_ACCESS_ADMIN_EMAIL'),
  'loginAccess.js must use PRODUCTION_LOGIN_ACCESS_ADMIN_EMAIL',
);

assert(
  manifestSrc.includes('export function evaluateWarehouseProductionAppAccess'),
  'evaluateWarehouseProductionAppAccess must be exported from src manifest',
);
assert(
  sharedManifestSrc.includes('evaluateWarehouseProductionAppAccess'),
  'mobile-apps/shared manifest must export evaluateWarehouseProductionAppAccess',
);
assert(
  productionSharedSrc.includes('evaluateWarehouseProductionAppAccess'),
  'warehouse-production shared manifest must export evaluateWarehouseProductionAppAccess',
);

assert(
  warehouseMobileSrc.includes('evaluateWarehouseProductionAppAccess(grant, user?.email)'),
  'warehouse-mobile production-access-self must use evaluateWarehouseProductionAppAccess',
);
assert(
  stocktakeSrc.includes('production_app_allowed'),
  'auth-profile must return production_app_allowed',
);
assert(
  hookSrc.includes('production_app_allowed'),
  'Production app hook must read production_app_allowed from auth-profile',
);
assert(
  !hookSrc.includes('fetchProductionAccess'),
  'Production app gate must not depend on warehouse-mobile production-access-self',
);

console.log('verifyProductionAppAccess: ok');
