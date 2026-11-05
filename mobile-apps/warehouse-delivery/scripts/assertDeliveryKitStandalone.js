const fs = require('fs');
const path = require('path');

const kitPath = path.join(__dirname, '..', 'deliveryKit');
const marker = path.join(kitPath, '.standalone-materialized');

if (!fs.existsSync(marker)) {
  console.error(
    'FAIL: deliveryKit is not materialized. Run: node scripts/materializeDeliveryStandalone.js',
  );
  process.exit(1);
}

try {
  const stat = fs.lstatSync(kitPath);
  if (stat.isSymbolicLink()) {
    console.error('FAIL: deliveryKit must not be a symlink/junction. Run materializeDeliveryStandalone.js');
    process.exit(1);
  }
} catch (e) {
  console.error('FAIL: deliveryKit missing', e.message);
  process.exit(1);
}

console.log('[assertDeliveryKitStandalone] ok');
