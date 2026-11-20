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
  assertCriticalSharedFiles(appShared, 'painting-workshop');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
console.log('[assertSharedStandalone] ok');