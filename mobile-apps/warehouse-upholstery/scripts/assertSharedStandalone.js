const fs = require('fs');
const path = require('path');

const sharedPath = path.join(__dirname, '..', 'shared');
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
  console.log('[assertSharedStandalone] ok');
}
