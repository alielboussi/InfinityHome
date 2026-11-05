/**
 * Production / delivery catalog helpers live in warehouse-production/shared — overlay onto junction shared/.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const sharedPath = path.join(appRoot, 'shared');
const overlayPath = path.resolve(appRoot, '..', 'warehouse-production', 'shared');

if (!fs.existsSync(sharedPath)) {
  console.warn('[mergeProductionSharedOverlay] missing shared at', sharedPath);
  process.exit(0);
}
if (!fs.existsSync(overlayPath)) {
  console.warn('[mergeProductionSharedOverlay] missing', overlayPath);
  process.exit(0);
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walk(full, base));
    } else if (name.isFile() && name.name.endsWith('.js')) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

function realPathSafe(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function copyOverlayFile(src, dest) {
  const srcReal = realPathSafe(src);
  if (fs.existsSync(dest)) {
    const destReal = realPathSafe(dest);
    if (srcReal === destReal) return 'skip-same';
    try {
      if (fs.readFileSync(src).equals(fs.readFileSync(dest))) return 'skip-identical';
    } catch {
      /* compare failed — attempt copy */
    }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return 'copied';
}

let copied = 0;
let skipped = 0;

const mobileSharedRoot = path.resolve(appRoot, '..', 'shared');
/** Canonical mobile shared — always flow into warehouse-production/shared before overlay copy. */
const CANONICAL_FROM_MOBILE_SHARED = [
  'firebase.js',
  'warehouseScanResolver.js',
  'MobileScreenGate.js',
  'mobileAccessManifest.js',
];
const canonicalSet = new Set(CANONICAL_FROM_MOBILE_SHARED);

for (const rel of CANONICAL_FROM_MOBILE_SHARED) {
  const src = path.join(mobileSharedRoot, rel);
  const dest = path.join(overlayPath, rel);
  if (!fs.existsSync(src) || !fs.existsSync(overlayPath)) continue;
  try {
    const result = copyOverlayFile(src, dest);
    if (result === 'copied') copied += 1;
    else skipped += 1;
  } catch (err) {
    console.warn('[mergeProductionSharedOverlay] canonical sync failed:', rel, err?.message || err);
  }
}

for (const rel of walk(overlayPath)) {
  if (canonicalSet.has(rel)) continue;
  const src = path.join(overlayPath, rel);
  const dest = path.join(sharedPath, rel);
  try {
    const result = copyOverlayFile(src, dest);
    if (result === 'copied') copied += 1;
    else skipped += 1;
  } catch (err) {
    console.warn('[mergeProductionSharedOverlay] skip', rel, '-', err?.message || err);
  }
}

console.log('[mergeProductionSharedOverlay] copied', copied, 'skipped', skipped);
