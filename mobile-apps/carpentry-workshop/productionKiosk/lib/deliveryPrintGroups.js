import {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
} from './_repoUtils/warehouseDeliverySetPrint.js';

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
