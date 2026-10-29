/**
 * Static checks for Production signature → submit → print handoff.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const pad = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/components/DeliverySignaturePad.js'),
  'utf8',
);
const sigScreen = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/screens/KitweSendSignatureScreen.js'),
  'utf8',
);
const doneScreen = fs.readFileSync(
  path.join(root, 'mobile-apps/warehouse-production/screens/KitweSendDoneScreen.js'),
  'utf8',
);

assert(
  pad.includes('useEffect') && pad.includes('onValidationChangeRef'),
  'signature pad must notify validation from useEffect, not inside setStrokes',
);
assert(!/setStrokes\([^)]*onValidationChange/.test(pad), 'signature pad must not call parent setState inside setStrokes');
assert(pad.includes('strokesRef'), 'signature pad must export PNG from latest strokes ref');
assert(sigScreen.includes('signature_png_base64'), 'signature submit must send inline PNG on delivery-submit');
assert(!sigScreen.includes('useProductionAccessGrant'), 'signature screen must not mount duplicate access grant hook');
assert(sigScreen.includes('submitLockRef'), 'signature submit must guard double tap');
assert(sigScreen.includes('scrollEnabled={!busy}'), 'signature screen should limit scroll while submitting');
assert(doneScreen.includes('hasPrintPayload'), 'done screen must not open print without note payload');

console.log('verifyProductionDeliverySignatureFlow: ok');
