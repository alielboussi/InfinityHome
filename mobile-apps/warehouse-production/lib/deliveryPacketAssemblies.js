import { resolvePacketFromScan } from '../shared/warehouseScanResolver';

export function findWarehousePacketByScan(scan, packets) {
  return resolvePacketFromScan(scan, packets || []);
}

/** Finished products (assemblies) that include this packet in their BOM. */
export function assembliesUsingPacket(packetId, assemblyPackets, assemblies) {
  const ids = new Set();
  for (const link of assemblyPackets || []) {
    if (String(link.packet_id) === String(packetId)) {
      ids.add(String(link.assembly_id));
    }
  }
  return [...ids]
    .map((id) => (assemblies || []).find((a) => String(a.id) === id))
    .filter(Boolean);
}
