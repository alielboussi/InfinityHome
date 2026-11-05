/**
 * Real productionKiosk/ copy from warehouse-production (Upholstery) — no junctions.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const upholsteryRoot = path.resolve(appRoot, '..', 'warehouse-upholstery');
const kioskPath = path.join(appRoot, 'productionKiosk');
const templateShared = path.resolve(appRoot, '..', 'shared');

const KIOSK_SCREENS = new Set(['CreateScreen.js', 'ManufactureScreen.js']);
const COPY_DIRS = ['components', 'hooks', 'lib', 'services'];

function isPathLink(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  try {
    if (fs.lstatSync(targetPath).isSymbolicLink()) return true;
  } catch {
    return false;
  }
  if (process.platform === 'win32') {
    try {
      fs.readlinkSync(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function rmDeep(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir, { fileFilter } = {}) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest, { fileFilter });
    } else if (!fileFilter || fileFilter(name)) {
      copyFile(src, dest);
    }
  }
}

function patchRepoImports(root) {
  for (const sub of ['lib', 'shared']) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      const filePath = path.join(dir, name);
      if (!fs.statSync(filePath).isFile()) continue;
      let text = fs.readFileSync(filePath, 'utf8');
      const next = text.replace(/(['"])(\.\.\/){3}src\//g, '$1../../../../src/');
      if (next !== text) fs.writeFileSync(filePath, next);
    }
  }
  const zambiaSrc = path.join(repoRoot, 'src', 'utils', 'zambiaDateTime.js');
  const zambiaDest = path.join(root, 'lib', 'zambiaDateTime.js');
  if (fs.existsSync(zambiaSrc)) {
    fs.writeFileSync(
      zambiaDest,
      '/** Standalone for carpentry-workshop. */\n' + fs.readFileSync(zambiaSrc, 'utf8'),
    );
  }
}

function vendorRepoUtils(root) {
  const repoUtils = path.join(repoRoot, 'src', 'utils');
  const vendorDir = path.join(root, 'lib', '_repoUtils');
  if (!fs.existsSync(repoUtils)) return;
  rmDeep(vendorDir);
  copyDir(repoUtils, vendorDir);
  const repoConstants = path.join(repoRoot, 'src', 'constants');
  const constVendor = path.join(root, 'lib', '_repoConstants');
  if (fs.existsSync(repoConstants)) {
    rmDeep(constVendor);
    copyDir(repoConstants, constVendor);
    for (const name of fs.readdirSync(vendorDir)) {
      if (!name.endsWith('.js')) continue;
      const p = path.join(vendorDir, name);
      let text = fs.readFileSync(p, 'utf8');
      const next = text.replace(/\.\.\/constants\//g, '../_repoConstants/');
      if (next !== text) fs.writeFileSync(p, next);
    }
  }
  function rewriteFile(filePath) {
    let text = fs.readFileSync(filePath, 'utf8');
    const relToLib = path.relative(path.dirname(filePath), path.join(root, 'lib', '_repoUtils')).replace(/\\/g, '/');
    const prefix = relToLib.startsWith('.') ? relToLib : `./${relToLib}`;
    const next = text.replace(/\.\.\/\.\.\/\.\.\/\.\.\/src\/utils\//g, `${prefix}/`);
    if (next !== text) fs.writeFileSync(filePath, next);
  }
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        if (p === vendorDir) continue;
        walk(p);
      } else if (name.endsWith('.js')) {
        rewriteFile(p);
      }
    }
  }
  walk(root);
}

function materializeShared() {
  const appShared = path.join(appRoot, 'shared');
  if (isPathLink(appShared)) {
    console.log('[materializeCarpentryStandalone] removing shared/ junction');
    rmDeep(appShared);
  }
  if (!fs.existsSync(templateShared)) {
    console.warn('[materializeCarpentryStandalone] skip shared template');
    return;
  }
  copyDir(templateShared, appShared);
  fs.writeFileSync(
    path.join(appShared, '.standalone-shared'),
    `Materialized for carpentry-workshop at ${new Date().toISOString()}\n`,
  );
}

function main() {
  if (!fs.existsSync(upholsteryRoot)) {
    console.error('[materializeCarpentryStandalone] missing warehouse-upholstery at', upholsteryRoot);
    process.exit(1);
  }

  if (isPathLink(kioskPath)) {
    console.log('[materializeCarpentryStandalone] removing productionKiosk junction');
    rmDeep(kioskPath);
  }

  rmDeep(kioskPath);
  fs.mkdirSync(kioskPath, { recursive: true });

  for (const dir of COPY_DIRS) {
    copyDir(path.join(upholsteryRoot, dir), path.join(kioskPath, dir));
  }

  const screensDest = path.join(kioskPath, 'screens');
  fs.mkdirSync(screensDest, { recursive: true });
  copyDir(path.join(upholsteryRoot, 'screens'), screensDest, {
    fileFilter: (name) => KIOSK_SCREENS.has(name),
  });

  materializeShared();
  copyDir(path.join(appRoot, 'shared'), path.join(kioskPath, 'shared'));
  patchRepoImports(kioskPath);
  vendorRepoUtils(kioskPath);

  if (!fs.existsSync(path.join(kioskPath, 'components', 'ProductionAppAuthGate.js'))) {
    console.error('[materializeCarpentryStandalone] failed');
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(kioskPath, '.standalone-materialized'),
    `Materialized from warehouse-upholstery at ${new Date().toISOString()}\n`,
  );

  console.log('[materializeCarpentryStandalone] ok');
}

main();
