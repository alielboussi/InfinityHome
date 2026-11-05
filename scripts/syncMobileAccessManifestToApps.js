const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/mobile/mobileAccessManifest.js'), 'utf8');
const header = [
  '/**',
  ' * Warehouse Catalog mobile app — screens and permission axes.',
  ' * Keep in sync with src/mobile/mobileAccessManifest.js (web /user-access + CI).',
  ' *',
  " * Permission values: 'allow' | 'deny' (default deny until admin enables).",
  ' */',
  '',
  '',
].join('\n');
const body = src.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '');

const targets = [
  path.join(root, 'mobile-apps/shared/mobileAccessManifest.js'),
  path.join(root, 'mobile-apps/warehouse-delivery/shared/mobileAccessManifest.js'),
  path.join(root, 'mobile-apps/warehouse-upholstery/shared/mobileAccessManifest.js'),
  path.join(root, 'mobile-apps/carpentry-workshop/shared/mobileAccessManifest.js'),
];

targets.forEach((filePath) => {
  if (!fs.existsSync(path.dirname(filePath))) return;
  fs.writeFileSync(filePath, header + body);
  console.log('updated', path.relative(root, filePath));
});
