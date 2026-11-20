const fs = require('fs');
const path = require('path');
const { assertCriticalSharedFiles } = require('../../shared/materializeCriticalShared');
const { assertEasignore } = require('../../shared/assertEasignore');

const appRoot = path.join(__dirname, '..');
const appShared = path.join(appRoot, 'shared');
const marker = path.join(appShared, '.standalone-shared');
if (!fs.existsSync(marker)) {
  console.error('FAIL: Run npm run materialize');
  process.exit(1);
}
try {
  assertEasignore(appRoot, 'painting-workshop');
  assertCriticalSharedFiles(appShared, 'painting-workshop');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
console.log('[assertSharedStandalone] ok');