/**
 * Portal-managed production presets + carpentry WhatsApp routing hooks.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

assert(fs.existsSync(path.join(root, 'server/lib/warehouseProductionPresets.js')));
assert(fs.existsSync(path.join(root, 'docs/supabase-warehouse-production-presets.sql')));

const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
assert(mobile.includes('production-presets-list'), 'warehouse-mobile must list production presets');
assert(mobile.includes('production-presets-save'), 'warehouse-mobile must save production presets');

const catalog = fs.readFileSync(path.join(root, 'server/lib/warehouseCatalogMobile.js'), 'utf8');
assert(catalog.includes('production_presets'), 'catalog-list must include production presets');

const notify = fs.readFileSync(path.join(root, 'api/notify.js'), 'utf8');
assert(notify.includes('WHATSAPP_PRODUCTION_CARPENTRY_GROUP_ID'), 'notify must support carpentry production group');
assert(notify.includes('productionCarpentry'), 'notify must route carpentry production alerts');

const create = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/screens/CreateScreen.js'),
  'utf8',
);
assert(create.includes('seater_presets'), 'Create screen must load remote seater presets');

const portal = fs.readFileSync(path.join(root, 'src/WarehouseProductionPresetsPage.js'), 'utf8');
assert(portal.includes('Save presets'), 'admin presets page required');

console.log('verifyWarehouseProductionPresetsPortal: ok');
