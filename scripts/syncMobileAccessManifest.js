/**
 * Keeps mobile-apps/shared/mobileAccessManifest.js aligned with src/mobile (web source of truth).
 * Run after editing src/mobile/mobileAccessManifest.js.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'mobile', 'mobileAccessManifest.js');
const dest = path.join(root, 'mobile-apps', 'shared', 'mobileAccessManifest.js');

if (!fs.existsSync(src)) {
  console.error('missing', src);
  process.exit(1);
}

const body = fs.readFileSync(src, 'utf8');
fs.writeFileSync(dest, body);
console.log('syncMobileAccessManifest: copied to mobile-apps/shared');

const appSharedTargets = [
  'mobile-apps/warehouse-upholstery/shared/mobileAccessManifest.js',
  'mobile-apps/carpentry-workshop/shared/mobileAccessManifest.js',
  'mobile-apps/painting-workshop/shared/mobileAccessManifest.js',
  'mobile-apps/warehouse-delivery/shared/mobileAccessManifest.js',
  'mobile-apps/warehouse-catalog/shared/mobileAccessManifest.js',
];

for (const rel of appSharedTargets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(path.dirname(p))) continue;
  fs.writeFileSync(p, body);
  console.log('  ->', rel);
}

console.log('syncMobileAccessManifest: OK');
