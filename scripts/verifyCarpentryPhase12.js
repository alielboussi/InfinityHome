/**
 * Static regression checks for Carpentry production Phase 1–2 (web + mobile ops + Expo SDK).
 * Usage: node scripts/verifyCarpentryPhase12.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function includesAll(haystack, needles, label) {
  for (const n of needles) {
    assert(haystack.includes(n), `${label} missing: ${n}`);
  }
}

try {
  const pkg = JSON.parse(read('mobile-apps/carpentry-workshop/package.json'));
  assert(String(pkg.dependencies?.expo || '').includes('58'), 'carpentry-workshop must use Expo SDK 58');

  includesAll(read('server/handlers/warehouse-mobile.js'), [
    "case 'carpentry-access-self'",
    "case 'carpentry-catalog-list'",
    "case 'carpentry-manufacture'",
    'executeCarpentryFloorManufacture',
    'evaluateCarpentryWorkshopAppAccess',
  ], 'warehouse-mobile');

  includesAll(read('server/handlers/carpentry-catalog.js'), [
    'requireBearerUser',
    'listCarpentryFloorRunsEnriched',
  ], 'carpentry-catalog handler');

  includesAll(read('src/mobile/mobileAccessManifest.js'), [
    'carpentry_workshop_app',
    'evaluateCarpentryWorkshopAppAccess',
  ], 'mobile access manifest');

  includesAll(read('src/App.js'), ['/carpentry', 'WarehouseFloor2Page'], 'web routes');
  includesAll(read('api/admin.js'), ["'upholstery-catalog'", "'carpentry-catalog'"], 'admin dispatcher');

  includesAll(read('server/lib/firestoreServerClient.js'), [
    'carpentry_production_runs',
    'carpentry_production_material_usage',
  ], 'firestore tables');

  assert(fs.existsSync(path.join(root, 'scripts/seedCarpentryWarehouseLocations.js')), 'seed script missing');
  assert(fs.existsSync(path.join(root, 'scripts/applyCarpentryProductionSchema.js')), 'apply schema script missing');

  includesAll(read('mobile-apps/carpentry-workshop/services/carpentryApi.js'), [
    'carpentry-access-self',
    'carpentry-catalog-list',
    'carpentry-manufacture',
    'runCarpentryManufacture',
  ], 'carpentry app api');

  const manufactureLib = read('server/lib/carpentryManufacture.js');
  assert(
    manufactureLib.includes('deductStoreroomBomMaterials'),
    'carpentry manufacture must deduct catalog storeroom BOM',
  );
  assert(
    manufactureLib.includes('floor2_wip_only'),
    'carpentry manufacture must credit Floor 2 WIP',
  );

  const jobsLib = read('server/lib/carpentryProductionJobs.js');
  assert(
    !jobsLib.includes('deductStoreroomBomMaterials'),
    'carpentry job start must not auto-deduct storeroom BOM',
  );

  assert(
    !fs.existsSync(path.join(root, 'mobile-apps/carpentry-workshop/screens/FinishingScreen.js')),
    'FinishingScreen should be removed — WIP moves to Floor 1 via Painting or Upholstery only',
  );

  console.log('verifyCarpentryPhase12: ok');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(e.message || e);
}
