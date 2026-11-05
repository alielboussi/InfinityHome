/**
 * Real copy of mobile-apps/shared into warehouse-upholstery/shared (Upholstery app).
 * Replaces ensureSharedLink junction on postinstall.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const appShared = path.join(appRoot, 'shared');
const templateRoot = path.resolve(appRoot, '..', 'shared');

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

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function backupProductionOnlyShared() {
  const backup = new Map();
  if (!fs.existsSync(appShared)) return backup;
  const templateRel = new Set();
  function walk(dir, base) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(base, full).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) walk(full, base);
      else templateRel.add(rel);
    }
  }
  if (fs.existsSync(templateRoot)) walk(templateRoot, templateRoot);
  function walkApp(dir, base) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(base, full).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) walkApp(full, base);
      else if (!templateRel.has(rel)) backup.set(rel, fs.readFileSync(full));
    }
  }
  walkApp(appShared, appShared);
  return backup;
}

function main() {
  if (!fs.existsSync(templateRoot)) {
    const marker = path.join(appShared, '.standalone-shared');
    if (fs.existsSync(marker)) {
      console.log('[materializeSharedStandalone] skip — template missing on cloud builder; using uploaded shared/');
      return;
    }
    console.warn('[materializeSharedStandalone] skip — missing template', templateRoot);
    return;
  }

  if (isPathLink(appShared)) {
    console.log('[materializeSharedStandalone] removing shared/ junction');
    fs.rmSync(appShared, { recursive: true, force: true });
  }

  const prodOnly = backupProductionOnlyShared();
  fs.mkdirSync(appShared, { recursive: true });
  copyDir(templateRoot, appShared);
  prodOnly.forEach((data, rel) => {
    const dest = path.join(appShared, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  });

  fs.writeFileSync(
    path.join(appShared, '.standalone-shared'),
    `Materialized for warehouse-upholstery at ${new Date().toISOString()}\n`,
  );

  console.log('[materializeSharedStandalone] ok');
}

main();
