import {
  buildDeliveryPrintGroupsFromCartGroups,
  isWarehouseSetDeliveryGroup,
} from '../../../src/utils/warehouseDeliverySetPrint.js';
import { resolveSetComponentsForDelivery } from './deliverySetCart.js';

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
