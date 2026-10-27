/**
 * Production stock screen: finished warehouse products with no packet/carton BOM
 * (same as Create new item — inventory_mode finished, no assembly_packets links).
 */

import {
  isFinishedProductWithoutPacketBom,
  isSetAssembly,
} from '../shared/warehouseCatalogProductCompleteness';

function buildPacketListsByAssembly(catalog) {
  const packets = catalog?.packets || [];
  const links = catalog?.assemblyPackets || [];
  const byAssembly = {};
  for (const link of links) {
    const assemblyId = String(link.assembly_id || '');
    const packetId = String(link.packet_id || '');
    if (!assemblyId || !packetId) continue;
    const packet = packets.find((p) => String(p.id) === packetId);
    if (!packet) continue;
    if (!byAssembly[assemblyId]) byAssembly[assemblyId] = [];
    byAssembly[assemblyId].push({
      ...packet,
      qty_per_unit: link.qty_per_unit,
    });
  }
  return byAssembly;
}

/** @returns {{ id, sku, name, assembly_id }[]} */
export function listProductionFinishedStockProducts(catalog) {
  const assemblies = catalog?.assemblies || [];
  const pktByAsm = buildPacketListsByAssembly(catalog);
  return assemblies
    .filter((a) => !isSetAssembly(a))
    .filter((a) => isFinishedProductWithoutPacketBom(a, pktByAsm[String(a.id)] || []))
    .map((a) => ({
      id: String(a.id),
      assembly_id: String(a.id),
      sku: String(a.family_sku || '').trim(),
      name: String(a.name || '').trim(),
    }))
    .filter((row) => row.id && row.sku && row.name);
}

export function assemblyWarehouseQty(assemblyId, assemblyInventory, locationId) {
  const row = (assemblyInventory || []).find(
    (r) => String(r.assembly_id) === String(assemblyId)
      && String(r.location_id) === String(locationId),
  );
  return Math.max(0, Number(row?.quantity) || 0);
}

export function isProductionStockProductId(catalog, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return false;
  return listProductionFinishedStockProducts(catalog).some((row) => row.id === id);
}
