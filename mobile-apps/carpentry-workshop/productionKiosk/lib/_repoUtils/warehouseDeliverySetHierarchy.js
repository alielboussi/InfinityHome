import { buildPacketsByAssembly } from './warehouseAssemblyPacketPool.js';
import { isWarehouseSetAssembly } from './warehouseCatalogHierarchy.js';
import { expandWarehouseSetItemsRows } from './warehouseSetItems.js';

/**
 * Build A4 / cart lines for a warehouse set delivery:
 * set name (depth 0), products (depth 1), packets (depth 2).
 */
export function buildSetDeliveryPrintLines({
  setAssembly,
  setUnits = 1,
  setItems = [],
  assemblies = [],
  assemblyPackets = [],
  packets = [],
  recipeLocationId,
} = {}) {
  const setName = String(setAssembly?.name || 'Set').trim();
  const u = Math.max(1, Number(setUnits) || 1);
  const setId = String(setAssembly?.id || '').trim();
  if (!setId) return { set_name: setName, units: u, lines: [] };

  const locId = String(recipeLocationId || '').trim();
  const expanded = expandWarehouseSetItemsRows(setItems || []);
  const components = expanded.filter(
    (row) => String(row.set_assembly_id) === setId
      && (!locId || String(row.location_id) === locId),
  );
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const byAssembly = buildPacketsByAssembly(assemblyPackets, packets);
  const lines = [];

  components.forEach((row) => {
    const product = assemblyById.get(String(row.component_assembly_id));
    if (!product || isWarehouseSetAssembly(product)) return;
    const perSet = Math.max(1, Number(row.quantity) || 1);
    const productQty = u * perSet;
    lines.push({
      depth: 1,
      name: product.name,
      qty: productQty,
      assembly_id: product.id,
    });
    const pktList = byAssembly.get(String(product.id)) || [];
    pktList.forEach((packet) => {
      const packetQty = productQty * Math.max(1, Number(packet.qty_per_unit) || 1);
      lines.push({
        depth: 2,
        name: packet.name,
        qty: packetQty,
        packet_id: packet.id,
        packet_number: packet.packet_number,
      });
    });
  });

  return { set_name: setName, units: u, lines };
}

export function deliveryPrintGroupsIncludeSetHierarchy(printGroups) {
  return (printGroups || []).some((g) => (g.lines || []).some((l) => Number(l.depth) > 0));
}
