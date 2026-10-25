/**
 * EAS on Windows cannot pack directory junctions. Copy shared/ before upload.
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

if (fs.existsSync(sharedPath)) {
  fs.rmSync(sharedPath, { recursive: true, force: true });
}

fs.cpSync(sharedSource, sharedPath, { recursive: true });
console.log('[materializeSharedForEas] copied', sharedSource, '->', sharedPath);
