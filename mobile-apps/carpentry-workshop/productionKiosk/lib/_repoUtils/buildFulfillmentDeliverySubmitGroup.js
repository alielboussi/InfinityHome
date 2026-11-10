import { analyzeAssemblyPacketBom } from './warehouseAssemblyMath';
import {
  assemblyUsesFinishedInventory,
  isFinishedProductWithoutPacketBom,
} from './warehouseCatalogProductCompleteness';
import { resolveSetComponentsForDelivery } from './warehouseSetDeliveryRecipe.js';

/** Same rules as server `isAssemblyDeliveryFinishedUnits`. */
export function isFulfillmentDeliveryFinishedOnly(assembly, packetRows) {
  const list = packetRows || [];
  if (list.length > 0) return false;
  if (isFinishedProductWithoutPacketBom(assembly, list)) return true;
  if (assemblyUsesFinishedInventory(assembly)) return true;
  const bom = analyzeAssemblyPacketBom(assembly?.packet_count, list);
  return bom.required === 0;
}

/** Build a `delivery-submit` group with driver/packet checks auto-confirmed (web fulfillment). */
export function buildFulfillmentDeliverySubmitGroup(assembly, packetRows, units) {
  const u = Math.max(1, Math.floor(Number(units) || 1));
  const now = new Date().toISOString();
  if (isFulfillmentDeliveryFinishedOnly(assembly, packetRows)) {
    return {
      assembly_id: assembly.id,
      units: u,
      finished_driver_checked: true,
      finished_driver_checked_at: now,
    };
  }
  const scans = (packetRows || []).map((p) => ({
    packet_id: p.id,
    quantity: u * Math.max(1, Number(p.qty_per_unit) || 1),
    driver_checked: true,
    driver_checked_at: now,
  }));
  return { assembly_id: assembly.id, units: u, scans };
}

/** Set delivery group (pre-assembled sets on Floor 1 inventory). */
export function buildFulfillmentSetSubmitGroup(setAssembly, setUnits, setItems, assemblies, packetsByAssembly) {
  const u = Math.max(1, Math.floor(Number(setUnits) || 1));
  const now = new Date().toISOString();
  const components = resolveSetComponentsForDelivery(
    setAssembly.id,
    u,
    setItems,
    assemblies,
  );
  const componentPayloads = components.map((comp) => {
    const assembly = (assemblies || []).find((a) => String(a.id) === String(comp.assembly_id));
    const pktList = packetsByAssembly.get(String(comp.assembly_id)) || [];
    if (assembly && isFulfillmentDeliveryFinishedOnly(assembly, pktList)) {
      return {
        ...comp,
        finished_driver_checked: true,
        finished_driver_checked_at: now,
      };
    }
    const scans = (pktList || []).map((p) => ({
      packet_id: p.id,
      quantity: comp.product_qty * Math.max(1, Number(p.qty_per_unit) || 1),
      driver_checked: true,
      driver_checked_at: now,
    }));
    return { ...comp, scans };
  });
  return {
    kind: 'set',
    group_id: `web-set-${String(setAssembly.id)}-${now}`,
    set_assembly_id: setAssembly.id,
    set_name: setAssembly.name,
    units: u,
    components: componentPayloads,
  };
}
