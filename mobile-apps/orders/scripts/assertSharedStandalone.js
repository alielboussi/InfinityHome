const fs = require('fs');
const path = require('path');
const { assertCriticalSharedFiles } = require('../../shared/materializeCriticalShared');

const appShared = path.join(__dirname, '..', 'shared');
const marker = path.join(appShared, '.standalone-shared');
if (!fs.existsSync(marker)) {
  console.error('FAIL: Run npm run materialize');
  process.exit(1);
}
try {
  assertCriticalSharedFiles(appShared, 'orders');
  const parity = fs.readFileSync(path.join(appShared, 'ordersAppDashboardParity.js'), 'utf8');
  const srcParity = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'mobile', 'ordersAppDashboardParity.js'), 'utf8');
  if (parity !== srcParity) {
    throw new Error('orders/shared/ordersAppDashboardParity.js must match src — run npm run materialize');
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
console.log('[assertSharedStandalone] ok');