import { WAREHOUSE_TO_LOCATION_ID, deliveryEntrySentToCustomer } from './warehouseDelivery.js';
import { deliveryDisplayNameWithFormatter } from './warehouseDeliveryDisplayName.js';

export {
  resolveSetComponentsForDelivery,
  resolveSetDeliveryRecipeLocationId,
  factorySetRecipeComponentLines,
  setRecipeRowsForLocation,
  KITWE_SET_DELIVERY_LOCATION_ID,
  FACTORY_SET_RECIPE_LOCATION_ID,
} from './warehouseSetDeliveryRecipe.js';

export function isWarehouseSetDeliveryGroup(group) {
  if (!group || typeof group !== 'object') return false;
  if (String(group.kind || '').toLowerCase() === 'set') return true;
  return Boolean(group.set_assembly_id);
}

export function deliverySetRecipeLocationId() {
  return WAREHOUSE_TO_LOCATION_ID;
}

/**
 * Build A4 printGroups block for one set cart group (respects driver-checked scans).
 */
export function buildSetDeliveryPrintGroupFromCart(group, byAssembly, assemblies) {
  const setName = String(group.set_name || group.assembly_name || 'Set').trim();
  const units = Math.max(1, Number(group.units) || 1);
  const lines = [];
  (group.components || []).forEach((comp) => {
    const assemblyId = String(comp.assembly_id || '');
    const productName = String(comp.assembly_name || '').trim() || 'Product';
    const productQty = Math.max(
      1,
      Number(comp.product_qty)
        || (units * Math.max(1, Number(comp.quantity_per_set) || 1)),
    );
    const packetRows = byAssembly.get(assemblyId) || [];
    const assembly = (assemblies || []).find((a) => String(a.id) === assemblyId);
    const finishedOnly = comp.finished_driver_checked === true
      || (packetRows.length === 0 && assembly?.inventory_mode === 'finished');

    lines.push({ depth: 1, name: productName, qty: productQty });

    if (finishedOnly) return;

    const scans = comp.scans || [];
    packetRows.forEach((packet) => {
      const req = productQty * Math.max(1, Number(packet.qty_per_unit) || 1);
      const scan = scans.find((s) => String(s.packet_id) === String(packet.id));
      const qty = scan?.quantity != null ? Number(scan.quantity) : req;
      if (!qty) return;
      lines.push({
        depth: 2,
        name: packet.name,
        qty,
        packet_number: packet.packet_number,
        packet_id: packet.id,
      });
    });
  });

  return {
    set_name: setName,
    assembly_name: setName,
    units,
    lines,
  };
}

/**
 * Build printGroups from persisted delivery entries (set-parent + set-component + packets).
 */
export function buildSetDeliveryPrintGroupsFromEntries(entries, nameFormatter = null) {
  const list = entries || [];
  const parents = list.filter((e) => e.kind === 'set-parent');
  if (!parents.length) return [];

  const groups = [];
  parents.forEach((parent) => {
    const groupId = String(parent.metadata?.delivery_set_group_id || parent.combo_id || parent.id);
    const setId = String(parent.metadata?.set_assembly_id || '');
    const setNameRaw = String(parent.name || parent.metadata?.assembly_name || 'Set').trim();
    const setName = deliveryDisplayNameWithFormatter(nameFormatter, setNameRaw, setId);
    const units = Math.max(1, Number(parent.quantity) || Number(parent.metadata?.units) || 1);
    const components = list.filter(
      (e) => e.kind === 'set-component'
        && String(e.metadata?.delivery_set_group_id || e.parent_combo_id) === groupId,
    );
    const packets = list.filter(
      (e) => e.kind === 'packet'
        && String(e.metadata?.delivery_set_group_id) === groupId,
    );
    const lines = [];
    components.forEach((comp) => {
      const asmId = String(comp.metadata?.assembly_id || '');
      const sentComp = deliveryEntrySentToCustomer(comp);
      lines.push({
        depth: 1,
        name: sentComp
          ? `${deliveryDisplayNameWithFormatter(nameFormatter, comp.name, asmId)} — sent to customer`
          : deliveryDisplayNameWithFormatter(nameFormatter, comp.name, asmId),
        qty: Math.max(1, Number(comp.quantity) || 1),
        sent_to_customer: sentComp,
      });
      packets
        .filter((p) => String(p.metadata?.assembly_id) === asmId)
        .forEach((p) => {
          const sentPkt = deliveryEntrySentToCustomer(p);
          lines.push({
            depth: 2,
            name: sentPkt ? `${p.name} — sent to customer` : p.name,
            qty: Number(p.quantity) || 0,
            packet_number: p.metadata?.packet_number,
            sent_to_customer: sentPkt,
          });
        });
    });
    groups.push({
      set_name: setName,
      assembly_name: setName,
      units,
      lines,
    });
  });
  return groups;
}

export function buildDeliveryPrintGroupsFromCartGroups({
  groups,
  assemblies,
  byAssembly,
  setItems,
} = {}) {
  const out = [];
  (groups || []).forEach((group) => {
    if (isWarehouseSetDeliveryGroup(group)) {
      out.push(buildSetDeliveryPrintGroupFromCart(group, byAssembly, assemblies));
      return;
    }
    const assemblyId = String(group.assembly_id || '');
    const packetRows = byAssembly.get(assemblyId) || [];
    const u = Math.max(1, Number(group.units) || 1);
    const assembly = (assemblies || []).find((a) => String(a.id) === assemblyId);
    const finishedOnly = group.finished_driver_checked === true
      || (assembly && packetRows.length === 0);
    if (finishedOnly) {
      out.push({
        assembly_name: group.assembly_name,
        units: u,
        lines: [],
      });
      return;
    }
    out.push({
      assembly_name: group.assembly_name,
      units: u,
      lines: packetRows.map((p) => {
        const req = u * Math.max(1, Number(p.qty_per_unit) || 1);
        const scan = (group.scans || []).find((s) => String(s.packet_id) === String(p.id));
        return {
          name: p.name,
          packet_number: p.packet_number,
          qty: scan?.quantity != null ? Number(scan.quantity) : req,
        };
      }),
    });
  });
  return out;
}
