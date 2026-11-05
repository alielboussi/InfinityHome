/**
 * Replace deliveryKit junction with a real copy from warehouse-production (delivery scope only).
 * Run manually or from postinstall — keeps Delivery independent of live Production folder links.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const upholsteryRoot = path.resolve(appRoot, '..', 'warehouse-upholstery');
const kitPath = path.join(appRoot, 'deliveryKit');
const mobileSharedRoot = path.resolve(appRoot, '..', 'shared');
const deliveryScreensRoot = path.join(appRoot, 'delivery-screens');

/** Delivery-only screens live in delivery-screens/ (not in Upholstery / warehouse-production). */
const COPY_DIRS = ['components', 'hooks', 'lib', 'services'];

function rmDeep(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** production/lib uses ../../../src; deliveryKit/lib needs ../../../../src (one extra app folder). */
function patchDeliveryKitRepoImports(kitRoot) {
  const repoRoot = path.resolve(appRoot, '..', '..');
  const zambiaSrc = path.join(repoRoot, 'src', 'utils', 'zambiaDateTime.js');
  const zambiaDest = path.join(kitRoot, 'lib', 'zambiaDateTime.js');
  if (fs.existsSync(zambiaSrc)) {
    fs.mkdirSync(path.dirname(zambiaDest), { recursive: true });
    const body = fs.readFileSync(zambiaSrc, 'utf8');
    const header = '/** Standalone copy for warehouse-delivery (do not re-export via production paths). */\n';
    fs.writeFileSync(zambiaDest, header + body);
  } else if (fs.existsSync(path.join(kitRoot, 'lib', 'zambiaDateTime.js'))) {
    // keep copy from upholstery if repo src/utils is unavailable
  } else {
    console.warn('[patchDeliveryKitRepoImports] missing', zambiaSrc, '— using upholstery lib copy only');
  }

  const dirs = [
    path.join(kitRoot, 'lib'),
    path.join(kitRoot, 'shared'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      const filePath = path.join(dir, name);
      if (!fs.statSync(filePath).isFile()) continue;
      if (filePath === zambiaDest) continue;
      let text = fs.readFileSync(filePath, 'utf8');
      const next = text.replace(/(['"])(\.\.\/){3}src\//g, '$1../../../../src/');
      if (next !== text) fs.writeFileSync(filePath, next);
    }
  }
}

function copyDir(srcDir, destDir, { fileFilter } = {}) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDir(src, dest, { fileFilter });
    } else if (!fileFilter || fileFilter(name, src)) {
      copyFile(src, dest);
    }
  }
}

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

/** Real copy under warehouse-delivery/shared — never a junction to mobile-apps/shared. */
function removeSharedIfLink() {
  const appShared = path.join(appRoot, 'shared');
  if (!fs.existsSync(appShared)) return;
  if (isPathLink(appShared)) {
    console.log('[materializeDeliveryStandalone] removing shared/ junction (mobile-apps/shared)');
    fs.rmSync(appShared, { recursive: true, force: true });
  }
}

function materializeSharedIntoApp() {
  removeSharedIfLink();
  const appShared = path.join(appRoot, 'shared');
  if (!fs.existsSync(mobileSharedRoot)) {
    console.warn('[materializeDeliveryStandalone] skip mobile-apps/shared template — missing');
    return;
  }
  copyDir(mobileSharedRoot, appShared);
  fs.writeFileSync(
    path.join(appShared, '.standalone-shared'),
    `Materialized for warehouse-delivery at ${new Date().toISOString()}\nNot a junction to mobile-apps/shared.\n`,
  );
}

function removeKitIfLink() {
  if (!fs.existsSync(kitPath)) return;
  let isLink = false;
  try {
    isLink = fs.lstatSync(kitPath).isSymbolicLink();
  } catch {
    /* ignore */
  }
  if (!isLink && process.platform === 'win32') {
    try {
      fs.readlinkSync(kitPath);
      isLink = true;
    } catch {
      /* normal directory */
    }
  }
  if (isLink) {
    console.log('[materializeDeliveryStandalone] removing deliveryKit junction');
    fs.rmSync(kitPath, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(upholsteryRoot)) {
    const marker = path.join(kitPath, '.standalone-materialized');
    const homeScreen = path.join(kitPath, 'screens', 'KitweSendHomeScreen.js');
    if (fs.existsSync(marker) && fs.existsSync(homeScreen)) {
      console.log('[materializeDeliveryStandalone] skip — upholstery sibling missing on cloud builder; using uploaded deliveryKit');
      return;
    }
    console.error('[materializeDeliveryStandalone] missing', upholsteryRoot);
    process.exit(1);
  }

  removeKitIfLink();

  rmDeep(kitPath);
  fs.mkdirSync(kitPath, { recursive: true });

  for (const dir of COPY_DIRS) {
    const src = path.join(upholsteryRoot, dir);
    const dest = path.join(kitPath, dir);
    if (!fs.existsSync(src)) {
      console.error('[materializeDeliveryStandalone] missing source folder', src);
      process.exit(1);
    }
    copyDir(src, dest);
    if (!fs.existsSync(dest)) {
      console.error('[materializeDeliveryStandalone] failed to copy', src, '->', dest);
      process.exit(1);
    }
  }

  const screensDest = path.join(kitPath, 'screens');
  if (!fs.existsSync(deliveryScreensRoot)) {
    console.error('[materializeDeliveryStandalone] missing', deliveryScreensRoot);
    process.exit(1);
  }
  copyDir(deliveryScreensRoot, screensDest);

  const deliveryUiSrc = path.join(appRoot, 'config', 'deliveryAppUi.js');
  if (fs.existsSync(deliveryUiSrc)) {
    fs.mkdirSync(path.join(kitPath, 'config'), { recursive: true });
    copyFile(deliveryUiSrc, path.join(kitPath, 'config', 'deliveryAppUi.js'));
  }

  materializeSharedIntoApp();

  copyDir(path.join(appRoot, 'shared'), path.join(kitPath, 'shared'));

  patchDeliveryKitRepoImports(kitPath);

  require('./applyDeliveryKitPatches').main();

  const marker = path.join(kitPath, 'screens', 'KitweSendHomeScreen.js');
  if (!fs.existsSync(marker)) {
    console.error('[materializeDeliveryStandalone] failed — KitweSendHomeScreen missing');
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(kitPath, '.standalone-materialized'),
    `Materialized from warehouse-upholstery at ${new Date().toISOString()}\nDo not junction to Upholstery app.\n`,
  );

  console.log('[materializeDeliveryStandalone] ok — deliveryKit is a real copy (not a link)');
}

main();
