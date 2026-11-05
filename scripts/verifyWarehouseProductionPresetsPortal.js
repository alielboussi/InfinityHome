/**
 * Portal-managed production presets + carpentry WhatsApp routing hooks.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

assert(fs.existsSync(path.join(root, 'server/lib/warehouseProductionPresets.js')));
assert(fs.existsSync(path.join(root, 'scripts/initWarehouseProductionPresets.js')));

const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
assert(mobile.includes('production-presets-list'), 'warehouse-mobile must list production presets');
assert(mobile.includes('production-presets-save'), 'warehouse-mobile must save production presets');

const catalog = fs.readFileSync(path.join(root, 'server/lib/warehouseCatalogMobile.js'), 'utf8');
assert(catalog.includes('production_presets'), 'catalog-list must include production presets');

const notify = fs.readFileSync(path.join(root, 'api/notify.js'), 'utf8');
assert(notify.includes('WHATSAPP_PRODUCTION_CARPENTRY_GROUP_ID'), 'notify must support carpentry production group');
assert(notify.includes('productionCarpentry'), 'notify must route carpentry production alerts');

function firstExistingPath(relativePaths) {
  for (const rel of relativePaths) {
    const full = path.isAbsolute(rel) ? rel : path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const createPath = firstExistingPath([
  'mobile-apps/warehouse-upholstery/screens/CreateScreen.js',
  'mobile-apps/warehouse-production/screens/CreateScreen.js',
  'mobile-apps/carpentry-workshop/productionKiosk/screens/CreateScreen.js',
]);
assert(createPath, 'expected a production CreateScreen.js under mobile-apps');

const create = fs.readFileSync(createPath, 'utf8');
assert(create.includes('seater_presets'), 'Create screen must load remote seater presets');
assert(create.includes('fetchProductionPresets'), 'Create screen must refresh presets from production-presets-list');
assert(create.includes('reloadPresetsFromServer'), 'Create screen must reload presets when focused');
assert(create.includes('prefetchPresetArabicLabels'), 'Create screen must auto-translate new presets in Arabic');

const appRoot = path.dirname(path.dirname(createPath));
const i18nPath = firstExistingPath([
  path.join(appRoot, 'lib/productionKioskI18n.js'),
  path.join(appRoot, 'productionKiosk/lib/productionKioskI18n.js'),
]);
assert(i18nPath, 'expected productionKioskI18n.js beside production Create screen');

const i18n = fs.readFileSync(i18nPath, 'utf8');
assert(i18n.includes('prefetchPresetArabicLabels'), 'production i18n must auto-translate unknown presets');

const portal = fs.readFileSync(path.join(root, 'src/WarehouseProductionPresetsPage.js'), 'utf8');
assert(portal.includes('persistPresets'), 'presets page must auto-save to server');
assert(portal.includes('Save again') || portal.includes('Save presets'), 'presets page must offer manual save');
assert(portal.includes('warehouse-production-presets-drag'), 'presets page must support drag reorder');
assert(portal.includes('groupTitle="Upholstery"'), 'presets page must label upholstery group');
assert(portal.includes('warehouse-production-presets-remove'), 'presets row remove must not use global button width');

const presetsLib = fs.readFileSync(path.join(root, 'server/lib/warehouseProductionPresets.js'), 'utf8');
assert(presetsLib.includes('sort_order'), 'presets save must persist sort_order');

console.log('verifyWarehouseProductionPresetsPortal: ok');
