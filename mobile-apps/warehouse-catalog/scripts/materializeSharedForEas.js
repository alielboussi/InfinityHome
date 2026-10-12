/**
 * EAS CLI on Windows cannot pack directory junctions. Replace shared/ with a real copy before upload.
 * Local npm install can recreate the junction via ensureSharedLink.js.
 */
const fs = require('fs');
const path = require('path');

const catalogRoot = path.resolve(__dirname, '..');
const sharedPath = path.join(catalogRoot, 'shared');
const sharedSource = path.resolve(catalogRoot, '..', 'shared');

if (!fs.existsSync(sharedSource)) {
  console.error('[materializeSharedForEas] missing', sharedSource);
  process.exit(1);
}

if (fs.existsSync(sharedPath)) {
  fs.rmSync(sharedPath, { recursive: true, force: true });
}

fs.cpSync(sharedSource, sharedPath, { recursive: true });
console.log('[materializeSharedForEas] copied', sharedSource, '->', sharedPath);
