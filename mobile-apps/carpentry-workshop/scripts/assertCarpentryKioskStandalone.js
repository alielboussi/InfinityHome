const fs = require('fs');
const path = require('path');

const kiosk = path.join(__dirname, '..', 'productionKiosk');
if (!fs.existsSync(path.join(kiosk, '.standalone-materialized'))) {
  console.error('FAIL: Run npm run materialize');
  process.exit(1);
}
try {
  fs.readlinkSync(kiosk);
  console.error('FAIL: productionKiosk must not be a junction');
  process.exit(1);
} catch {
  console.log('[assertCarpentryKioskStandalone] ok');
}
