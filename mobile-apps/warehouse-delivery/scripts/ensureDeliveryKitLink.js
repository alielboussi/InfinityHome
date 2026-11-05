const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const upholsteryRoot = path.resolve(appRoot, '..', 'warehouse-upholstery');
const linkPath = path.join(appRoot, 'deliveryKit');
const marker = path.join(linkPath, 'screens', 'KitweSendHomeScreen.js');

function linkIsValid() {
  return fs.existsSync(marker);
}

if (!fs.existsSync(upholsteryRoot)) {
  console.error('[ensureDeliveryKitLink] missing warehouse-upholstery at', upholsteryRoot);
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
  execSync(`cmd /c mklink /J "${linkPath}" "${upholsteryRoot}"`, { stdio: 'inherit' });
} else {
  fs.symlinkSync(upholsteryRoot, linkPath, 'dir');
}

if (!linkIsValid()) {
  console.error('[ensureDeliveryKitLink] failed');
  process.exit(1);
}

console.log('[ensureDeliveryKitLink] linked deliveryKit ->', upholsteryRoot);
