/**
 * Regression: Hassan / Orders production flow labels.
 */
import {
  computeProductionFlowStatus,
  productionDepartmentLabel,
} from '../src/utils/productionJobFlowStatus.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const paintingActive = computeProductionFlowStatus('painting', { status: 'running', metadata: {} });
assert(paintingActive === 'In Painting', paintingActive);

const carpentryActive = computeProductionFlowStatus('carpentry', { status: 'running', metadata: {} });
assert(carpentryActive === 'In production', carpentryActive);

const floor1 = computeProductionFlowStatus('painting', {
  status: 'completed',
  metadata: { finish_destination: 'floor1', floor1_credited: true },
});
assert(floor1 === 'Sent to Floor 1 for Storage', floor1);

const delivery = computeProductionFlowStatus('painting', {
  status: 'completed',
  metadata: { finish_destination: 'delivery', delivery_admin: { stage: 'awaiting_driver' } },
});
assert(delivery === 'Ready For Delivery', delivery);

assert(productionDepartmentLabel('carpentry') === 'Carpentry', 'dept label');

console.log('verifyProductionJobFlowStatus: ok');
