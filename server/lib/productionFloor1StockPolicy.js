/**
 * Workshop production inventory policy (upholstery + carpentry apps, web portal Floor 1 / Floor 2).
 *
 * - **Warehouse Floor 1** (`WAREHOUSE_FACTORY_LOCATION_ID`): finished salable stock on /warehouse-products.
 *   Do not credit or deduct Floor 1 when opening a production job or sending to Manufacture.
 *   Credit Floor 1 only when a production job is **finished** (upholstery labels + stock, painting finish, etc.).
 *
 * - **Warehouse Floor 2**: deduct when WIP **physically leaves** (e.g. carpentry **send to painting**). Upholstery/carpentry
 *   manufacture jobs defer Floor 2 moves per their job-finish rules — do not apply that to painting handoff from carpentry.
 *
 * Send Delivery lists **Floor 1 only** — credit Floor 1 on upholstery/painting **job finish**, not when queuing jobs.
 *
 * Floor 1 and Floor 2 are independent quantities for the same commercial product when raw/finished rows differ.
 */

import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { resolveFarmWarehouse1Location } from '../../src/constants/farmWarehouseLocations.js';

export { WAREHOUSE_FACTORY_LOCATION_ID as WAREHOUSE_FLOOR1_LOCATION_ID };

export function requireFarmWarehouse1Location(locRows, message) {
  const farmLoc = resolveFarmWarehouse1Location(locRows || []);
  const farmId = farmLoc?.id ? String(farmLoc.id) : '';
  if (!farmId) {
    throw new Error(message || 'Farm Warehouse 1 location not configured — run scripts/ensureFarmWarehouseLocation.js');
  }
  return farmId;
}

export function requireWarehouseFloor2Location(locRows, message) {
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  if (!floor2Id) {
    throw new Error(message || 'Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  }
  return floor2Id;
}

/** Workshop WIP must never fall back to Floor 1 when Floor 2 is missing. */
export function assertNoFloor1FallbackForWip(outputLocationId) {
  if (String(outputLocationId) === String(WAREHOUSE_FACTORY_LOCATION_ID)) {
    throw new Error('WIP stock must use Warehouse Floor 2, not Warehouse Floor 1');
  }
}
