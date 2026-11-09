import {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
} from '../productionKiosk/lib/_repoUtils/warehouseDeliverySetPrint.js';

export {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
};

export function buildPrintGroupsFromCart(groups, byAssembly, assemblies, setItems) {
  return buildDeliveryPrintGroupsFromCartGroups({
    groups,
    assemblies,
    byAssembly,
    setItems,
  });
}
