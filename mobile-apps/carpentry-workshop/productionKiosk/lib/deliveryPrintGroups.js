import {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
} from '../../../../src/utils/warehouseDeliverySetPrint.js';

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
