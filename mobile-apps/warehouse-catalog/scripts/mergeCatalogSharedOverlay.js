/**
 * Copy warehouse-catalog-only shared modules into catalog/shared (after junction or EAS materialize).
 */
const fs = require('fs');
const path = require('path');

const catalogRoot = path.resolve(__dirname, '..');
const sharedPath = path.join(catalogRoot, 'shared');
const overlayPath = path.join(catalogRoot, 'catalog-shared-overlay');

if (!fs.existsSync(overlayPath)) {
  process.exit(0);
}

if (!fs.existsSync(sharedPath)) {
  console.warn('[mergeCatalogSharedOverlay] missing shared at', sharedPath);
  process.exit(0);
}

const entries = fs.readdirSync(overlayPath, { withFileTypes: true });
entries.forEach((entry) => {
  if (!entry.isFile()) return;
  const src = path.join(overlayPath, entry.name);
  const dest = path.join(sharedPath, entry.name);
  fs.copyFileSync(src, dest);
});

console.log('[mergeCatalogSharedOverlay] applied', entries.filter((e) => e.isFile()).length, 'file(s)');
