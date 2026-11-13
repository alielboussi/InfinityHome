/**
 * Delivery app ↔ upholstery / carpentry / painting workshop finish flows:
 * Floor 1 send, virtual admin holds, repair + order queues.
 * Usage: node scripts/verifyDeliveryWorkshopParity.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

const mobile = read('server/handlers/warehouse-mobile.js');
const queue = read('server/lib/warehouseDeliveryAdminQueue.js');
const acceptStock = read('server/lib/warehouseDeliveryAcceptStock.js');
const orderQueue = read('mobile-apps/warehouse-delivery/deliveryKit/screens/DeliveryOrderQueueScreen.js');
const repairQueue = read('mobile-apps/warehouse-delivery/deliveryKit/screens/DeliveryRepairQueueScreen.js');
const floor1Catalog = read('mobile-apps/warehouse-delivery/deliveryKit/lib/deliveryWarehouseCatalog.js');
const kitweHome = read('mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendHomeScreen.js');

assert(queue.includes("PAINTING_JOBS = 'painting_production_jobs'"), 'queue lib must include painting jobs');
assert(queue.includes('listCompletedJobsAwaitingDriver(sb, PAINTING_JOBS'), 'orders queue must list painting finishes');
assert(queue.includes('listCompletedJobsAwaitingDriver(sb, CARPENTRY_JOBS'), 'orders queue must list carpentry finishes');
assert(queue.includes('listCompletedJobsAwaitingDriver(sb, UPHOLSTERY_JOBS'), 'orders queue must list upholstery finishes');
assert(queue.includes('markRepairWorkCompleteAwaitingDriver'), 'repairs must register virtual delivery hold');
assert(acceptStock.includes('delivery_admin_hold'), 'submit must release virtual hold without Floor 1 deduct');

assert(mobile.includes('delivery-production-queue-list'), 'mobile API must expose delivery queues');
assert(
  /groupJobId|production_job_id/.test(mobile) && mobile.includes('groupJobId'),
  'delivery-submit must pin production_job_id for workshop order virtual holds',
);

assert(orderQueue.includes('delivery-production-queue-list'), 'order queue screen must load API');
assert(orderQueue.includes('production_job_id'), 'order queue submit groups must include production_job_id');
assert(
  orderQueue.includes('../lib/warehouseOrderPrintGroups.js'),
  'order queue must use local quote print groups (standalone)',
);
assert(!orderQueue.includes('/src/utils/warehouseDeliveryPrintGroups'), 'order queue must not import monorepo src');

assert(repairQueue.includes('delivery-production-queue-list'), 'repair queue must load API');
assert(repairQueue.includes("queueKind: 'repair'"), 'repair deliver must tag repair queue');

assert(floor1Catalog.includes('filterAssembliesForDeliveryFloor1Only'), 'Floor 1 catalog filter required');
assert(kitweHome.includes('filterAssembliesForDeliveryFloor1Only'), 'Kitwe send must use Floor 1-only catalog');

for (const finishOp of ['painting-job-finish', 'carpentry-job-finish', 'upholstery-job-finish']) {
  assert(mobile.includes(`'${finishOp}'`), `warehouse-mobile must route ${finishOp}`);
}

const paintingFinish = read('server/lib/paintingProductionJobs.js');
assert(paintingFinish.includes('registerProductionJobAwaitingDriver'), 'painting finish → delivery virtual');
assert(paintingFinish.includes("dest === 'floor1'"), 'painting finish must support Floor 1 storage path');

const carpentryFinish = read('server/lib/carpentryProductionJobs.js');
assert(carpentryFinish.includes('registerProductionJobAwaitingDriver'), 'carpentry finish → delivery virtual');

const upholsteryFinish = read('server/lib/upholsteryProductionJobs.js');
assert(upholsteryFinish.includes('registerProductionJobAwaitingDriver'), 'upholstery finish → delivery virtual');

const returnFlow = read('server/lib/warehouseReturnOrders.js');
assert(returnFlow.includes('markRepairWorkCompleteAwaitingDriver'), 'repair complete → delivery queue');

assert(
  fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/lib/warehouseOrderPrintGroups.js')),
  'warehouseOrderPrintGroups.js must exist in deliveryKit',
);
assert(
  fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/lib/quoteProductionItemFields.js')),
  'quoteProductionItemFields.js must exist in deliveryKit',
);

if (!process.exitCode) console.log('verifyDeliveryWorkshopParity: ok');
