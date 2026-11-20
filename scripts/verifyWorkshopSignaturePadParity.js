/**
 * Driver signature pad + stroke validator must match across delivery / upholstery / painting / carpentry.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const padPaths = [
  'mobile-apps/carpentry-workshop/components/DeliverySignaturePad.js',
  'mobile-apps/carpentry-workshop/productionKiosk/components/DeliverySignaturePad.js',
  'mobile-apps/warehouse-upholstery/components/DeliverySignaturePad.js',
  'mobile-apps/painting-workshop/components/DeliverySignaturePad.js',
  'mobile-apps/warehouse-delivery/deliveryKit/components/DeliverySignaturePad.js',
];

const strokePaths = [
  'mobile-apps/carpentry-workshop/lib/validateDeliverySignatureStrokes.js',
  'mobile-apps/warehouse-upholstery/lib/validateDeliverySignatureStrokes.js',
  'mobile-apps/painting-workshop/lib/validateDeliverySignatureStrokes.js',
  'mobile-apps/warehouse-delivery/deliveryKit/lib/validateDeliverySignatureStrokes.js',
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const canonPad = read(padPaths[0]);
for (const rel of padPaths) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error('FAIL: missing', rel);
    process.exit(1);
  }
  if (read(rel) !== canonPad) {
    console.error('FAIL: DeliverySignaturePad drift at', rel, '— copy from carpentry-workshop/components');
    process.exit(1);
  }
}

const canonStroke = read(strokePaths[0]);
for (const rel of strokePaths) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error('FAIL: missing', rel);
    process.exit(1);
  }
  if (read(rel) !== canonStroke) {
    console.error('FAIL: validateDeliverySignatureStrokes drift at', rel);
    process.exit(1);
  }
}

if (!canonPad.includes('sizeChanged')) {
  console.error('FAIL: signature pad must clear strokes on pad resize');
  process.exit(1);
}

console.log('verifyWorkshopSignaturePadParity: ok');