/**
 * Windows: junction mobile-apps/warehouse-catalog/shared -> ../shared
 * so Metro resolves node_modules from the app root.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const catalogRoot = path.resolve(__dirname, '..');
const sharedLink = path.join(catalogRoot, 'shared');
const sharedTarget = path.resolve(catalogRoot, '..', 'shared');

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

console.log('[ensureSharedLink] linked shared ->', sharedTarget);
