import { capitalizePersonName } from '../../src/utils/warehouseProductionDeliveryStaging.js';

/**
 * Fleet driver XOR customer driver (name + phone) for mobile signature submits.
 */
export function resolveMobileDeliveryDriver(body) {
  const customerDriverNameRaw = String(
    body.customer_driver_name || body.customerDriverName || '',
  ).trim();
  const customerDriverPhone = String(
    body.customer_driver_phone || body.customerDriverPhone || '',
  ).trim();
  let driverName = String(body.driver_name || body.driverName || '').trim();
  let driverId = String(body.driver_id || body.driverId || '').trim();

  if (customerDriverNameRaw && driverId) {
    throw new Error('Choose either a fleet driver or a customer driver — not both.');
  }
  if (customerDriverNameRaw) {
    if (!customerDriverPhone) throw new Error('Customer driver phone is required.');
    driverName = capitalizePersonName(customerDriverNameRaw);
    driverId = '';
  }
  if (!driverName) throw new Error('Driver is required.');

  return {
    driverName,
    driverId,
    customerDriverName: customerDriverNameRaw ? capitalizePersonName(customerDriverNameRaw) : '',
    customerDriverPhone: customerDriverPhone || '',
    customerDriverActive: Boolean(customerDriverNameRaw),
  };
}
