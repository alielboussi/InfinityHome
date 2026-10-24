const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const sharedLink = path.join(appRoot, 'shared');
const sharedTarget = path.resolve(appRoot, '..', 'shared');

if (!fs.existsSync(sharedTarget)) {
  console.warn('[ensureSharedLink] missing', sharedTarget);
  process.exit(0);
}

if (fs.existsSync(sharedLink)) {
  process.exit(0);
}

if (process.platform === 'win32') {
  execSync(`cmd /c mklink /J "${sharedLink}" "${sharedTarget}"`, { stdio: 'inherit' });
} else {
  fs.symlinkSync(sharedTarget, sharedLink, 'dir');
}
