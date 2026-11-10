/**
 * Delivery app Repairs queue — eligibility must match portal display helper.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main() {
  const root = path.join(__dirname, '..');
  const mod = await import(pathToFileURL(path.join(root, 'src/utils/warehouseDeliveryAdminQueue.js')).href);
  const {
    repairEligibleForMobileDeliveryQueue,
    isCompletedAwaitingDelivery,
    deliveryAdminInventoryFootnote,
    DELIVERY_ADMIN_HOLD_LABEL,
    DELIVERY_ADMIN_IN_TRANSIT_LABEL,
  } = mod;

  const awaiting = {
    status: 'completed',
    metadata: {
      ready_for_delivery_app: true,
      delivery_admin: { kind: 'repair', stage: 'awaiting_driver' },
    },
  };
  assert(repairEligibleForMobileDeliveryQueue(awaiting), 'registered awaiting_driver must queue');
  assert(isCompletedAwaitingDelivery(awaiting), 'portal must show Ready for delivery');
  assert(mod.repairAdminStatusDisplay(awaiting) === 'Ready for delivery', 'portal status label');

  const legacyFloor1 = {
    status: 'completed',
    metadata: {
      floor1_awaiting_hassan: true,
      factory_stock_added_at: '2025-01-01T00:00:00.000Z',
    },
  };
  assert(!repairEligibleForMobileDeliveryQueue(legacyFloor1), 'legacy Floor 1 ship must not queue');

  const completedNoFlags = {
    status: 'completed',
    metadata: { repair_accumulated_ms: 1000 },
  };
  assert(repairEligibleForMobileDeliveryQueue(completedNoFlags), 'plain completed must queue for driver');
  assert(isCompletedAwaitingDelivery(completedNoFlags), 'plain completed must display awaiting');

  const collected = {
    status: 'completed',
    metadata: {
      delivery_admin: { stage: 'collected_by_driver' },
    },
  };
  assert(!repairEligibleForMobileDeliveryQueue(collected), 'collected must not queue');

  const floor2Legacy = {
    status: 'completed',
    metadata: { floor2_repair_staged_at: '2025-01-01T00:00:00.000Z' },
  };
  assert(!repairEligibleForMobileDeliveryQueue(floor2Legacy), 'legacy floor2 staged must not queue');

  const floor2WithApp = {
    status: 'completed',
    metadata: {
      floor2_repair_staged_at: '2025-01-01T00:00:00.000Z',
      ready_for_delivery_app: true,
      delivery_admin: { stage: 'awaiting_driver' },
    },
  };
  assert(repairEligibleForMobileDeliveryQueue(floor2WithApp), 'delivery_app flag wins over floor2 timestamp');

  assert(
    deliveryAdminInventoryFootnote(awaiting, 'repair') === DELIVERY_ADMIN_HOLD_LABEL,
    'awaiting driver must show virtual hold footnote',
  );
  assert(
    deliveryAdminInventoryFootnote(collected, 'repair') === DELIVERY_ADMIN_IN_TRANSIT_LABEL,
    'collected must show in-transit footnote',
  );

  const adminPage = fs.readFileSync(path.join(root, 'src/WarehouseRepairsAdmin.js'), 'utf8');
  assert(adminPage.includes("id: 'carpentry'"), 'repairs admin must filter carpentry');
  assert(adminPage.includes("id: 'upholstery'"), 'repairs admin must filter upholstery');
  assert(adminPage.includes('deptFilter'), 'repairs admin must have department filter');

  console.log('verifyDeliveryRepairQueueFilter: ok');
}

main().catch((err) => {
  console.error('[delivery-repair-queue-filter:fail]', err?.message || err);
  process.exit(1);
});
