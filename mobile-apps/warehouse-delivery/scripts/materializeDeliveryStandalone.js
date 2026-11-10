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
const deliveryKitScreensRoot = path.join(appRoot, 'deliveryKit', 'screens');

/** Delivery-only screens live in deliveryKit/screens/ (committed source, not Upholstery). */
const COPY_DIRS = ['components', 'hooks', 'lib', 'services'];

function rmDeep(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function filesAreIdentical(src, dest) {
  try {
    const a = fs.statSync(src);
    const b = fs.statSync(dest);
    if (a.size !== b.size) return false;
    const srcBuf = fs.readFileSync(src);
    const destBuf = fs.readFileSync(dest);
    return srcBuf.equals(destBuf);
  } catch {
    return false;
  }
}

const RETRYABLE_COPY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN']);

function sleep(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { /* sync wait — postinstall only */ }
}

/** Windows-safe copy (AV/indexer locks often break copyFileSync overwrite). */
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && filesAreIdentical(src, dest)) return;

  const body = fs.readFileSync(src);
  const tmp = `${dest}.materialize-${process.pid}-${Date.now()}.tmp`;

  const attempt = () => {
    fs.writeFileSync(tmp, body);
    if (fs.existsSync(dest)) {
      try {
        fs.unlinkSync(dest);
      } catch {
        fs.rmSync(dest, { force: true });
      }
    }
    fs.renameSync(tmp, dest);
  };

  let lastErr;
  for (let i = 0; i < 6; i += 1) {
    try {
      attempt();
      return;
    } catch (err) {
      lastErr = err;
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch { /* ignore */ }
      const code = String(err?.code || '').toUpperCase();
      if (!RETRYABLE_COPY_CODES.has(code) || i >= 5) break;
      sleep(80 * (i + 1));
    }
  }
  throw lastErr;
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

  const screensBackup = path.join(appRoot, '.delivery-kit-screens-backup');
  const committedScreens = path.join(appRoot, 'deliveryKit', 'screens');
  if (fs.existsSync(committedScreens)) {
    rmDeep(screensBackup);
    copyDir(committedScreens, screensBackup);
  }

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
  if (fs.existsSync(screensBackup)) {
    copyDir(screensBackup, screensDest);
    rmDeep(screensBackup);
  } else if (fs.existsSync(deliveryKitScreensRoot)) {
    copyDir(deliveryKitScreensRoot, screensDest);
  } else {
    console.error('[materializeDeliveryStandalone] missing deliveryKit/screens source');
    process.exit(1);
  }

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
