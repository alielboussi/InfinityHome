/**
 * Static checks for Factory → Kitwe mobile delivery + Hassan receiver flow.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
const deliveries = fs.readFileSync(path.join(root, 'src/WarehouseDeliveries.js'), 'utf8');

assert(mobile.includes('assertMobileDeliverySubmitAccess'), 'delivery submit must check mobile access');
assert(
  mobile.includes('await sendWarehouseDeliveryWhatsApp'),
  'delivery submit must await WhatsApp group notify',
);
assert(
  mobile.includes('buildWarehouseDeliveryWhatsAppMessage'),
  'delivery submit must build warehouse delivery WhatsApp message',
);
assert(mobile.includes('delivery-number-reset'), 'warehouse-mobile must support delivery-number-reset');
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryNumber.js'), 'utf8').includes('resetWarehouseDeliveryNumberSequence'),
  'delivery number reset helper must exist',
);
assert(mobile.includes('canWarehouseDeliveryReceiverActions'), 'receiver API must allow Hassan + admin test');
assert(mobile.includes('reused: true'), 'delivery-session-open must reuse draft sessions');
assert(deliveries.includes('receiverTestMirror'), 'WarehouseDeliveries must support Hassan mirror mode');
assert(mobile.includes('driver_signature_url'), 'delivery submit must store driver signature url');
assert(
  fs.readFileSync(path.join(root, 'storage.rules'), 'utf8').includes('warehouse-delivery-signatures'),
  'storage rules must allow warehouse-delivery-signatures',
);

assert(
  fs.existsSync(path.join(root, 'src/WarehouseDeliveriesHassanTest.js')),
  'Hassan mirror page must exist',
);

console.log('verifyWarehouseDeliveryFlow: ok');
