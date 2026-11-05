const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const productionRoot = path.resolve(appRoot, '..', 'warehouse-production');

const links = [
  ['productionKiosk/components', path.join(productionRoot, 'components')],
  ['productionKiosk/hooks', path.join(productionRoot, 'hooks')],
  ['productionKiosk/lib', path.join(productionRoot, 'lib')],
  ['productionKiosk/services', path.join(productionRoot, 'services')],
  ['productionKiosk/screens', path.join(productionRoot, 'screens')],
];

function linkIsValid(linkPath, targetPath) {
  if (!fs.existsSync(linkPath)) return false;
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      return fs.existsSync(targetPath);
    }
  } catch {
    return false;
  }
  return fs.existsSync(linkPath);
}

function ensureLink(rel, target) {
  const linkPath = path.join(appRoot, rel);
  if (linkIsValid(linkPath, target)) return;

  if (fs.existsSync(linkPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  if (process.platform === 'win32') {
    execSync(`cmd /c mklink /J "${linkPath}" "${target}"`, { stdio: 'inherit' });
  } else {
    fs.symlinkSync(target, linkPath, fs.statSync(target).isDirectory() ? 'dir' : 'file');
  }

  if (!linkIsValid(linkPath, target)) {
    console.error('[ensureProductionKioskLink] failed', rel, '->', target);
    process.exit(1);
  }
}

if (!fs.existsSync(productionRoot)) {
  console.error('[ensureProductionKioskLink] missing warehouse-production at', productionRoot);
  process.exit(1);
}

for (const [rel, target] of links) {
  ensureLink(rel, target);
}

console.log('[ensureProductionKioskLink] ok');
