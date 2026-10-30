const path = require('path');
const {
  validateDeliverySignatureStrokes,
  sanitizeDeliverySignatureStrokes,
  isSignatureEdgeArtifactStroke,
} = require(path.join(
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

const layout = { width: 300, height: 220 };
const edgeSliver = [{
  points: [
    { x: 296, y: 20 },
    { x: 298, y: 80 },
    { x: 297, y: 180 },
  ],
}];
assert(isSignatureEdgeArtifactStroke(edgeSliver[0], layout.width, layout.height), 'right-edge sliver detected');
assert(!sanitizeDeliverySignatureStrokes([...line, ...edgeSliver], layout).some(
  (s) => isSignatureEdgeArtifactStroke(s, layout.width, layout.height),
), 'sanitize removes edge slivers');

console.log('verifyDeliverySignatureStrokes: ok');
