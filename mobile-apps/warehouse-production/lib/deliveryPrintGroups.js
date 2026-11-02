import {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
  resolveSetComponentsForDelivery,
} from '../../../src/utils/warehouseDeliverySetPrint.js';

export {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
  resolveSetComponentsForDelivery,
};

export function buildPrintGroupsFromCart(groups, byAssembly, assemblies, setItems) {
  return buildDeliveryPrintGroupsFromCartGroups({
    groups,
    assemblies,
    byAssembly,
    setItems,
  });
}
