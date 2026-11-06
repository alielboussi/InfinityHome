export {
  resolveSetComponentsForDelivery,
  resolveSetDeliveryRecipeLocationId,
  factorySetRecipeComponentLines,
  setRecipeRowsForLocation,
  KITWE_SET_DELIVERY_LOCATION_ID,
  FACTORY_SET_RECIPE_LOCATION_ID,
} from './_repoUtils/warehouseSetDeliveryRecipe.js';

export { isWarehouseSetAssembly } from '../shared/warehouseCatalogProductCompleteness';

import { isFinishedProductWithoutPacketBom } from '../shared/warehouseCatalogProductCompleteness';
import {
  buildDeliveryPacketChecks,
  refreshDeliveryPacketCheckQty,
} from './deliveryAssemblyChecks';
import { filterAssembliesForDeliverySearch } from './deliveryCatalogSearch';
import { resolveSetComponentsForDelivery } from './_repoUtils/warehouseSetDeliveryRecipe.js';

export function filterDeliverySearchAssemblies(assemblies, rawQuery, options) {
  return filterAssembliesForDeliverySearch(assemblies, rawQuery, options);
}

export function initSetDraftComponents(setAssemblyId, setUnits, setItems, assemblies, byAssembly) {
  return resolveSetComponentsForDelivery(setAssemblyId, setUnits, setItems, assemblies).map((row) => {
    const packetRows = byAssembly.get(String(row.assembly_id)) || [];
    const assembly = assemblies.find((a) => String(a.id) === String(row.assembly_id));
    const finishedOnly = assembly && isFinishedProductWithoutPacketBom(assembly, packetRows);
    return {
      ...row,
      finishedOnly,
      packetRows,
      checks: finishedOnly
        ? {}
        : buildDeliveryPacketChecks(packetRows, row.product_qty, {}),
      finished_driver_checked: false,
      finished_driver_checked_at: null,
    };
  });
}

export function refreshSetDraftComponentQty(components, byAssembly, setUnits) {
  return (components || []).map((comp) => {
    const perSet = Math.max(1, Number(comp.quantity_per_set) || 1);
    const productQty = Math.max(1, Number(setUnits) || 1) * perSet;
    const packetRows = byAssembly.get(String(comp.assembly_id)) || [];
    if (comp.finishedOnly) {
      return { ...comp, product_qty: productQty };
    }
    return {
      ...comp,
      product_qty: productQty,
      checks: refreshDeliveryPacketCheckQty(comp.checks || {}, packetRows, productQty),
    };
  });
}

export function buildSetComponentScans(packetRows, productQty, checks) {
  const scans = [];
  for (const packet of packetRows) {
    const req = productQty * Math.max(1, Number(packet.qty_per_unit) || 1);
    const row = checks[packet.id];
    if (!row?.driver_checked) return { ok: false, packet };
    scans.push({ ...row, quantity: req });
  }
  return { ok: true, scans };
}

export function validateSetDraftForCart(components, setName) {
  for (const comp of components || []) {
    if (comp.finishedOnly) {
      if (!comp.finished_driver_checked) {
        return { ok: false, message: comp.assembly_name };
      }
      continue;
    }
    const built = buildSetComponentScans(comp.packetRows, comp.product_qty, comp.checks);
    if (!built.ok) {
      return { ok: false, message: `${setName} → ${comp.assembly_name}` };
    }
  }
  return { ok: true };
}

export function validateSetGroupInCart(group, assemblies, byAssembly) {
  for (const comp of group.components || []) {
    const asm = assemblies.find((a) => String(a.id) === String(comp.assembly_id));
    const rows = byAssembly.get(String(comp.assembly_id)) || [];
    if (asm && isFinishedProductWithoutPacketBom(asm, rows)) {
      if (!comp.finished_driver_checked) return comp.assembly_name;
      continue;
    }
    const productQty = Math.max(
      1,
      Number(comp.product_qty)
        || (Math.max(1, Number(group.units) || 1) * Math.max(1, Number(comp.quantity_per_set) || 1)),
    );
    for (const packet of rows) {
      const req = productQty * Math.max(1, Number(packet.qty_per_unit) || 1);
      const scan = (comp.scans || []).find((s) => String(s.packet_id) === String(packet.id));
      if (!scan?.driver_checked) return `${group.set_name} → ${comp.assembly_name}`;
    }
  }
  return '';
}

export function serializeSetGroupForSubmit(group) {
  return {
    kind: 'set',
    group_id: group.group_id,
    set_assembly_id: group.set_assembly_id,
    set_name: group.set_name,
    units: group.units,
    components: (group.components || []).map((c) => ({
      assembly_id: c.assembly_id,
      assembly_name: c.assembly_name,
      quantity_per_set: c.quantity_per_set,
      product_qty: c.product_qty,
      finished_driver_checked: c.finished_driver_checked,
      finished_driver_checked_at: c.finished_driver_checked_at,
      scans: c.scans,
    })),
  };
}
