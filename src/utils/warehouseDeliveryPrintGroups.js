import { groupWarehouseDisplayLines } from './warehouseDelivery';

/**
 * Build printGroups for the A4 delivery note from persisted warehouse_delivery_entries.
 */
export function buildDeliveryPrintGroupsFromEntries(entries) {
  const lines = groupWarehouseDisplayLines(entries || []);
  const byAssembly = new Map();

  for (const row of lines) {
    const meta = row.metadata || {};
    const assemblyName = meta.assembly_name || row.name || 'Product';
    const assemblyId = String(meta.assembly_id || assemblyName);
    const units = Math.max(1, Number(meta.units) || 1);
    const key = assemblyId;
    if (!byAssembly.has(key)) {
      byAssembly.set(key, { assembly_name: assemblyName, units, lines: [] });
    }
    const group = byAssembly.get(key);
    group.units = Math.max(group.units, units);
    group.lines.push({
      name: row.name,
      packet_number: meta.packet_number,
      qty: Number(row.quantity) || 0,
    });
  }

  return [...byAssembly.values()];
}
