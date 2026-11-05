/**
 * Department routing for Hassan Kitwe returns → workshop repair queues.
 */
const path = require('path');

// eslint-disable-next-line import/no-dynamic-require, global-require
const {
  resolveReturnRepairDepartment,
  returnMatchesRepairDepartment,
} = require(path.join(__dirname, '../src/utils/warehouseReturnRepairDepartment.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const row = (reason, reason_group) => ({
  reason,
  reason_group,
  metadata: { reason_group },
});

assert(resolveReturnRepairDepartment(row('Repair', 'upholstery')) === 'upholstery', 'upholstery group → upholstery');
assert(resolveReturnRepairDepartment(row('Maintenance', 'upholstery')) === 'upholstery', 'upholstery maintenance → upholstery');
assert(resolveReturnRepairDepartment(row('Structure', 'carpentry')) === 'carpentry', 'carpentry structure → carpentry');
assert(resolveReturnRepairDepartment(row('Color', 'carpentry')) === 'painting', 'carpentry color → painting');
assert(resolveReturnRepairDepartment(row('Quality check', 'general')) === 'carpentry', 'general QC → carpentry');
assert(!returnMatchesRepairDepartment(row('Color', 'carpentry'), 'carpentry'), 'color excluded from carpentry queue');
assert(returnMatchesRepairDepartment(row('Color', 'carpentry'), 'painting'), 'color in painting queue');

console.log('verifyWarehouseReturnRepairDepartment: OK');
