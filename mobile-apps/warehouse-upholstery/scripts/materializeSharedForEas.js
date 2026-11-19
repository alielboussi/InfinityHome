/**
 * EAS on Windows cannot pack directory junctions. Copy shared/ before upload.
 * Merge mobile-apps/shared into app shared/ — do not delete production-only modules.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const sharedPath = path.join(appRoot, 'shared');
const sharedSource = path.resolve(appRoot, '..', 'shared');

if (!fs.existsSync(sharedSource)) {
  console.error('[materializeSharedForEas] missing', sharedSource);
  process.exit(1);
}

function relPaths(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(base, full);
    if (fs.statSync(full).isDirectory()) {
      out.push(...relPaths(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** Files present in app shared/ but not in mobile-apps/shared (Production-only). */
function backupProductionOnlyShared() {
  const backup = new Map();
  if (!fs.existsSync(sharedPath)) return backup;
  const sourceRel = new Set(relPaths(sharedSource).map((p) => p.replace(/\\/g, '/')));
  for (const rel of relPaths(sharedPath)) {
    const norm = rel.replace(/\\/g, '/');
    if (sourceRel.has(norm)) continue;
    const full = path.join(sharedPath, rel);
    if (!fs.statSync(full).isFile()) continue;
    backup.set(norm, fs.readFileSync(full));
  }
  return backup;
}

function restoreProductionOnlyShared(backup) {
  backup.forEach((data, rel) => {
    const dest = path.join(sharedPath, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    writeFileWithRetry(dest, data);
  });
}

function sleep(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { /* postinstall / verify only */ }
}

function writeFileWithRetry(dest, data) {
  let lastErr;
  for (let i = 0; i < 6; i += 1) {
    try {
      fs.writeFileSync(dest, data);
      return;
    } catch (err) {
      lastErr = err;
      sleep(80 * (i + 1));
    }
  }
  throw lastErr;
}

function cpSyncWithRetry(src, dest) {
  let lastErr;
  for (let i = 0; i < 6; i += 1) {
    try {
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true, force: true });
      return;
    } catch (err) {
      lastErr = err;
      sleep(120 * (i + 1));
    }
  }
  throw lastErr;
}

const prodOnlyBackup = backupProductionOnlyShared();
fs.mkdirSync(sharedPath, { recursive: true });
cpSyncWithRetry(sharedSource, sharedPath);
restoreProductionOnlyShared(prodOnlyBackup);

console.log('[materializeSharedForEas] merged', sharedSource, '->', sharedPath);
if (prodOnlyBackup.size) {
  console.log(
    '[materializeSharedForEas] preserved production-only shared files:',
    [...prodOnlyBackup.keys()].join(', '),
  );
}
