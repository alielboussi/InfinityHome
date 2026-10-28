const path = require('path');
const { validateDeliverySignatureStrokes } = require(path.join(
  __dirname,
  '../mobile-apps/warehouse-production/lib/validateDeliverySignatureStrokes.js',
));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const dotOnly = [{ points: [{ x: 1, y: 1 }] }];
assert(!validateDeliverySignatureStrokes(dotOnly).ok, 'single dot rejected');

const line = [{
  points: [
    { x: 10, y: 10 },
    { x: 30, y: 12 },
    { x: 80, y: 40 },
    { x: 120, y: 35 },
    { x: 180, y: 50 },
  ],
}];
assert(validateDeliverySignatureStrokes(line).ok, 'real stroke accepted');

console.log('verifyDeliverySignatureStrokes: ok');
