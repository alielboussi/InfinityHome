const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const productionRoot = path.resolve(appRoot, '..', 'warehouse-production');
const linkPath = path.join(appRoot, 'deliveryKit');
const marker = path.join(linkPath, 'screens', 'KitweSendHomeScreen.js');

function linkIsValid() {
  return fs.existsSync(marker);
}

if (!fs.existsSync(productionRoot)) {
  console.error('[ensureDeliveryKitLink] missing warehouse-production at', productionRoot);
  process.exit(1);
}

if (fs.existsSync(linkPath) && !linkIsValid()) {
  fs.rmSync(linkPath, { recursive: true, force: true });
}

if (linkIsValid()) {
  console.log('[ensureDeliveryKitLink] ok');
  process.exit(0);
}

if (process.platform === 'win32') {
  execSync(`cmd /c mklink /J "${linkPath}" "${productionRoot}"`, { stdio: 'inherit' });
} else {
  fs.symlinkSync(productionRoot, linkPath, 'dir');
}

if (!linkIsValid()) {
  console.error('[ensureDeliveryKitLink] failed');
  process.exit(1);
}

console.log('[ensureDeliveryKitLink] linked deliveryKit ->', productionRoot);
