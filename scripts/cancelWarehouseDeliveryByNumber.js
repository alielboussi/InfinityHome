/**
 * Cancel a warehouse delivery by delivery number (no stock change if nothing was accepted).
 * Usage: node scripts/cancelWarehouseDeliveryByNumber.js WHD0000000010
 */
import { getDataClient } from '../server/lib/getDataClient.js';
import {
  cancelWarehouseDeliveryServer,
  findWarehouseDeliverySessionByNumber,
} from '../server/lib/cancelWarehouseDelivery.js';

const deliveryNumber = process.argv[2];
if (!deliveryNumber) {
  console.error('Usage: node scripts/cancelWarehouseDeliveryByNumber.js <delivery_number>');
  process.exit(1);
}

const sb = getDataClient();
const row = await findWarehouseDeliverySessionByNumber(sb, deliveryNumber);
if (!row?.id) {
  console.error(`Delivery not found: ${deliveryNumber}`);
  process.exit(1);
}

const result = await cancelWarehouseDeliveryServer(sb, row.id, {
  cancelledByEmail: 'script@local',
  reason: 'Cancelled via cancelWarehouseDeliveryByNumber.js',
});

console.log(JSON.stringify(result, null, 2));
