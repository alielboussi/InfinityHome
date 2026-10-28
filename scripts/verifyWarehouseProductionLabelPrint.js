/**
 * Ensures warehouse-mobile exposes catalog / production label print ops.
 */
const fs = require('fs');
const path = require('path');

const mobile = fs.readFileSync(
  path.join(__dirname, '../server/handlers/warehouse-mobile.js'),
  'utf8',
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(mobile.includes("case 'production-label-print':"), 'warehouse-mobile must handle production-label-print');
assert(mobile.includes('opProductionLabelPrint'), 'warehouse-mobile must define opProductionLabelPrint');
assert(mobile.includes('assertWarehouseLabelPrintUser'), 'catalog admins must be allowed to print labels');

console.log('verifyWarehouseProductionLabelPrint: ok');
