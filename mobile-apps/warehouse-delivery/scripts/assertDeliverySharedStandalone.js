const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const sharedPath = path.join(appRoot, 'shared');
const marker = path.join(sharedPath, '.standalone-shared');

if (!fs.existsSync(marker)) {
  console.error(
    'FAIL: shared/ is not materialized. Run: npm run materialize (from warehouse-delivery)',
  );
  process.exit(1);
}

try {
  const stat = fs.lstatSync(sharedPath);
  if (stat.isSymbolicLink()) {
    console.error('FAIL: shared/ must not be a symlink/junction. Run npm run materialize');
    process.exit(1);
  }
  if (process.platform === 'win32') {
    try {
      fs.readlinkSync(sharedPath);
      console.error('FAIL: shared/ is a junction to mobile-apps/shared. Run npm run materialize');
      process.exit(1);
    } catch {
      /* normal directory */
    }
  }
} catch (e) {
  console.error('FAIL: shared/ missing', e.message);
  process.exit(1);
}

console.log('[assertDeliverySharedStandalone] ok');
