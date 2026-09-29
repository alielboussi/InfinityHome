/**
 * Shared warehouse packet stock across multiple finished products.
 * Communal pool: each "round" consumes sum(qty_per_unit) cartons across all
 * products using that packet; leftover cartons stay as excess warehouse stock.
 */

export function legacyAssemblyPacketRows(packets) {
  return (packets || [])
    .filter((p) => p.assembly_id)
    .map((p) => ({
      assembly_id: p.assembly_id,
      packet_id: p.id,
      qty_per_unit: Math.max(1, Number(p.qty_per_unit) || 1),
    }));
}

export function normalizeAssemblyPacketRows(assemblyPacketRows, packets) {
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

/** @returns {Map<string, Array<object>>} assemblyId -> packet rows for BOM math */
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

/** packetId -> assemblies that use this packet (for packets list UI) */
export function buildPacketAssemblyAssignments(assemblyPacketRows, packets, assemblies) {
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const rows = normalizeAssemblyPacketRows(assemblyPacketRows, packets);
  const byPacket = new Map();
  rows.forEach((row) => {
    const pid = String(row.packet_id);
    if (!byPacket.has(pid)) byPacket.set(pid, []);
    const assembly = assemblyById.get(String(row.assembly_id));
    if (assembly) byPacket.get(pid).push(assembly);
  });
  return byPacket;
}

/** Communal pool stats for one packet SKU (for tests / diagnostics). */
export function communalPacketPoolStats(packetId, onHand, assemblyPacketRows) {
  const links = (assemblyPacketRows || []).filter((r) => String(r.packet_id) === String(packetId));
  const onHandNum = Math.max(0, Number(onHand) || 0);
  if (!links.length) {
    return { communal: false, completeRounds: 0, excessCartons: onHandNum, qtySumPerRound: 0 };
  }
  const qtySumPerRound = links.reduce(
    (s, r) => s + Math.max(1, Number(r.qty_per_unit) || 1),
    0,
  );
  if (links.length <= 1) {
    const q = qtySumPerRound;
    const completeRounds = q > 0 ? Math.floor(onHandNum / q) : 0;
    return {
      communal: false,
      completeRounds,
      excessCartons: onHandNum - completeRounds * q,
      qtySumPerRound: q,
    };
  }
  const completeRounds = Math.floor(onHandNum / qtySumPerRound);
  return {
    communal: true,
    completeRounds,
    excessCartons: onHandNum - completeRounds * qtySumPerRound,
    qtySumPerRound,
  };
}

/**
 * Cartons of this packet that count toward one product when stock is communal.
 * floor(result / qty_per_unit) = complete units this product can build from this packet.
 */
export function effectivePacketOnHandForAssembly(packetId, assemblyId, onHand, assemblyPacketRows) {
  const pid = String(packetId);
  const aid = String(assemblyId);
  const links = (assemblyPacketRows || []).filter((r) => String(r.packet_id) === pid);
  const my = links.find((r) => String(r.assembly_id) === aid);
  const onHandNum = Math.max(0, Number(onHand) || 0);
  if (!my) return onHandNum;

  const myQ = Math.max(1, Number(my.qty_per_unit) || 1);
  if (links.length <= 1) return onHandNum;

  const qtySumPerRound = links.reduce(
    (s, r) => s + Math.max(1, Number(r.qty_per_unit) || 1),
    0,
  );
  const completeRounds = Math.floor(onHandNum / qtySumPerRound);
  return completeRounds * myQ;
}
