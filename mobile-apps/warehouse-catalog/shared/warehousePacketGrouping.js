/** Minimal copy of buildPacketsByAssembly for mobile (keep in sync with src/utils/warehouseAssemblyPacketPool.js). */

function legacyAssemblyPacketRows(packets) {
  return (packets || [])
    .filter((p) => p.assembly_id)
    .map((p) => ({
      assembly_id: p.assembly_id,
      packet_id: p.id,
      qty_per_unit: Math.max(1, Number(p.qty_per_unit) || 1),
    }));
}

function normalizeAssemblyPacketRows(assemblyPacketRows, packets) {
  const rowKey = (r) => `${String(r.assembly_id)}|${String(r.packet_id)}`;
  const map = new Map();
  legacyAssemblyPacketRows(packets).forEach((r) => map.set(rowKey(r), r));
  (assemblyPacketRows || []).forEach((r) => {
    const prev = map.get(rowKey(r));
    map.set(rowKey(r), {
      assembly_id: r.assembly_id,
      packet_id: r.packet_id,
      qty_per_unit: Math.max(1, Number(r.qty_per_unit ?? prev?.qty_per_unit) || 1),
    });
  });
  return [...map.values()];
}

export function buildPacketsByAssembly(assemblyPacketRows, packets) {
  const packetById = new Map((packets || []).map((p) => [String(p.id), p]));
  const rows = normalizeAssemblyPacketRows(assemblyPacketRows, packets);
  const byAssembly = new Map();
  rows.forEach((row) => {
    const packet = packetById.get(String(row.packet_id));
    if (!packet) return;
    const assemblyId = String(row.assembly_id);
    if (!byAssembly.has(assemblyId)) byAssembly.set(assemblyId, []);
    byAssembly.get(assemblyId).push({
      ...packet,
      qty_per_unit: Math.max(1, Number(row.qty_per_unit ?? packet.qty_per_unit) || 1),
    });
  });
  for (const list of byAssembly.values()) {
    list.sort((a, b) => (Number(a.packet_number) || 0) - (Number(b.packet_number) || 0));
  }
  return byAssembly;
}
