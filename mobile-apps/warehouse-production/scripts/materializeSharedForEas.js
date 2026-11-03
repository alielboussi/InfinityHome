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
    fs.writeFileSync(dest, data);
  });
}

const prodOnlyBackup = backupProductionOnlyShared();
fs.mkdirSync(sharedPath, { recursive: true });
fs.cpSync(sharedSource, sharedPath, { recursive: true, force: true });
restoreProductionOnlyShared(prodOnlyBackup);

console.log('[materializeSharedForEas] merged', sharedSource, '->', sharedPath);
if (prodOnlyBackup.size) {
  console.log(
    '[materializeSharedForEas] preserved production-only shared files:',
    [...prodOnlyBackup.keys()].join(', '),
  );
}
