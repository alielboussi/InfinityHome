import { buildPacketsByAssembly } from './warehousePacketGrouping';
import {
  analyzeAssemblyPacketBom,
  assemblyUsesPacketBom,
  isCompleteCatalogProduct,
  isSetAssembly,
} from './warehouseCatalogProductCompleteness';

/** Cartons reserved for complete packet-BOM products at current warehouse unit counts. */
export function computePacketCartonsAllocatedToCompleteProducts({
  assemblies,
  assemblyPackets,
  packets,
  assemblyWarehouseQty,
}) {
  const packetsByAssembly = buildPacketsByAssembly(assemblyPackets, packets);
  const allocated = new Map();

  (assemblies || []).forEach((assembly) => {
    if (isSetAssembly(assembly)) return;
    const assemblyId = String(assembly.id);
    const pktList = packetsByAssembly.get(assemblyId) || [];
    if (!isCompleteCatalogProduct(assembly, pktList)) return;
    if (!assemblyUsesPacketBom(assembly)) return;
    const bom = analyzeAssemblyPacketBom(assembly.packet_count, pktList);
    if (!bom.isComplete) return;

    const units = Math.max(0, Math.floor(Number(assemblyWarehouseQty?.[assemblyId]) || 0));
    if (units <= 0) return;

    pktList.forEach((packet) => {
      const packetId = String(packet.id);
      const perUnit = Math.max(1, Number(packet.qty_per_unit) || 1);
      allocated.set(packetId, (allocated.get(packetId) || 0) + units * perUnit);
    });
  });

  return allocated;
}

/** Packet IDs linked to at least one BOM-complete warehouse product. */
export function packetIdsOnCompleteBomProducts({
  assemblies,
  assemblyPackets,
  packets,
}) {
  const packetsByAssembly = buildPacketsByAssembly(assemblyPackets, packets);
  const ids = new Set();
  (assemblies || []).forEach((assembly) => {
    if (isSetAssembly(assembly)) return;
    const assemblyId = String(assembly.id);
    const pktList = packetsByAssembly.get(assemblyId) || [];
    if (!isCompleteCatalogProduct(assembly, pktList)) return;
    if (!assemblyUsesPacketBom(assembly)) return;
    const bom = analyzeAssemblyPacketBom(assembly.packet_count, pktList);
    if (!bom.isComplete) return;
    pktList.forEach((packet) => ids.add(String(packet.id)));
  });
  return ids;
}

export function buildUnusedPacketRows({
  packets,
  packetWarehouseQty,
  allocatedByPacketId,
  limitToPacketIds,
}) {
  const rows = [];
  (packets || []).forEach((packet) => {
    const id = String(packet.id);
    if (limitToPacketIds && !limitToPacketIds.has(id)) return;
    const onHand = Math.max(0, Math.floor(Number(packetWarehouseQty?.[id]) || 0));
    const allocated = Math.max(0, Math.floor(Number(allocatedByPacketId?.get(id)) || 0));
    const unusedQty = Math.max(0, onHand - allocated);
    if (unusedQty <= 0) return;
    rows.push({ packet, onHand, allocated, unusedQty });
  });
  rows.sort((a, b) => String(a.packet.sku || '').localeCompare(String(b.packet.sku || '')));
  return rows;
}
