import { resolvePacketFromScan } from '../shared/warehouseScanResolver';
import { productionScanResolveCandidates } from './productionLabelQrScan';

export function findWarehousePacketByScan(scan, packets) {
  for (const candidate of productionScanResolveCandidates(scan)) {
    const packet = resolvePacketFromScan(candidate, packets || []);
    if (packet) return packet;
  }
  return null;
}

/** Finished products (assemblies) that include this packet in their BOM. */
export function assembliesUsingPacket(packetId, assemblyPackets, assemblies, packets) {
  const ids = new Set();
  for (const link of assemblyPackets || []) {
    if (String(link.packet_id) === String(packetId)) {
      ids.add(String(link.assembly_id));
    }
  }
  const packet = (packets || []).find((p) => String(p.id) === String(packetId));
  if (packet?.assembly_id) {
    ids.add(String(packet.assembly_id));
  }
  return [...ids]
    .map((id) => (assemblies || []).find((a) => String(a.id) === id))
    .filter(Boolean);
}
