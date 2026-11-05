const fs = require('fs');
const path = require('path');

const marker = path.join(__dirname, '..', 'shared', '.standalone-shared');
if (!fs.existsSync(marker)) {
  console.error('FAIL: Run npm run materialize');
  process.exit(1);
}
console.log('[assertCarpentrySharedStandalone] ok');
