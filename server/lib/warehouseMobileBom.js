import { analyzeAssemblyPacketBom } from '../../src/utils/warehouseAssemblyMath.js';

/**
 * @param {object} assembly — { id, name, packet_count }
 * @param {Array} packetRows — linked packets with id, packet_number, qty_per_unit
 * @param {Map<string, number>} scannedQtyByPacketId — cartons scanned per packet id
 * @param {number} units — finished units to ship for this assembly
 */
export function validateAssemblyShipmentBom(assembly, packetRows, scannedQtyByPacketId, units) {
  const n = Math.max(1, Math.floor(Number(units) || 1));
  const list = packetRows || [];
  const bom = analyzeAssemblyPacketBom(assembly?.packet_count, list);
  const missing = [];

  if (!bom.isComplete) {
    return {
      ok: false,
      isComplete: false,
      missing,
      message: `BOM incomplete on ${assembly?.name || 'product'} (${bom.cartonsPerUnit}/${bom.required} cartons).`,
    };
  }

  for (const packet of list) {
    const need = n * Math.max(1, Number(packet.qty_per_unit) || 1);
    const have = Number(scannedQtyByPacketId.get(String(packet.id)) || 0);
    if (have < need) {
      missing.push({
        packet_id: packet.id,
        packet_number: packet.packet_number,
        sku: packet.sku,
        name: packet.name,
        need,
        have,
        short_by: need - have,
      });
    }
  }

  if (missing.length) {
    const nums = missing.map((m) => `#${m.packet_number}`).join(', ');
    return {
      ok: false,
      isComplete: true,
      missing,
      message: `Missing packet line(s) ${nums} for ${n} unit(s) of ${assembly?.name || 'product'}.`,
    };
  }

  return { ok: true, isComplete: true, missing: [], message: '' };
}
