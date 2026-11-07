/**
 * Copies mobile-apps/shared/theme.js into each app shared/ (standalone builds).
 * Run after editing src/design-tokens.css or mobile-apps/shared/theme.js.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'mobile-apps', 'shared', 'theme.js');

if (!fs.existsSync(src)) {
  console.error('missing', src);
  process.exit(1);
}

const body = fs.readFileSync(src, 'utf8');
const appSharedTargets = [
  'mobile-apps/warehouse-upholstery/shared/theme.js',
  'mobile-apps/carpentry-workshop/shared/theme.js',
  'mobile-apps/painting-workshop/shared/theme.js',
  'mobile-apps/warehouse-delivery/shared/theme.js',
  'mobile-apps/warehouse-catalog/shared/theme.js',
  'mobile-apps/warehouse-delivery/deliveryKit/shared/theme.js',
  'mobile-apps/carpentry-workshop/productionKiosk/shared/theme.js',
];

console.log('syncBrandTheme: source mobile-apps/shared/theme.js');
for (const rel of appSharedTargets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(path.dirname(p))) continue;
  fs.writeFileSync(p, body);
  console.log('  ->', rel);
}
console.log('syncBrandTheme: OK');
