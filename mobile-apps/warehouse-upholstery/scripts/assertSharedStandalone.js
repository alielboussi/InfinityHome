const fs = require('fs');
const path = require('path');
const { assertCriticalSharedFiles } = require('../../shared/materializeCriticalShared');
const { assertEasignore } = require('../../shared/assertEasignore');

const appRoot = path.join(__dirname, '..');
const sharedPath = path.join(appRoot, 'shared');
const marker = path.join(sharedPath, '.standalone-shared');

if (!fs.existsSync(marker)) {
  console.error('FAIL: Run node scripts/materializeSharedStandalone.js');
  process.exit(1);
}
try {
  fs.readlinkSync(sharedPath);
  console.error('FAIL: shared/ must not be a junction');
  process.exit(1);
} catch {
  /* not a symlink — good */
}
try {
  assertEasignore(appRoot, 'warehouse-upholstery');
  assertCriticalSharedFiles(sharedPath, 'warehouse-upholstery');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
console.log('[assertSharedStandalone] ok');
