import {
  groupWarehouseDisplayLines,
  deliveryEntryPacketId,
  deliveryEntrySentToCustomer,
} from './warehouseDelivery.js';
import { buildSetDeliveryPrintGroupsFromEntries } from './warehouseDeliverySetPrint.js';

function assemblyDisplayName(nameFormatter, rawName, assemblyId) {
  const raw = String(rawName || '').trim() || 'Product';
  if (nameFormatter?.displayName) {
    return nameFormatter.displayName(raw, assemblyId);
  }
  return raw;
}

/** Sub-rows on the A4 note are packet/carton lines only — not finished-unit-only products. */
export function deliveryPrintSubrowIsPacketLine(line, assemblyName = '') {
  if (!line || typeof line !== 'object') return false;
  if (line.line_kind === 'reason' || line.kind === 'reason') return true;
  const packetNo = line.packet_number ?? line.metadata?.packet_number;
  if (packetNo != null && String(packetNo).trim() !== '') return true;
  if (deliveryEntryPacketId({ metadata: line.metadata || line }) || line.packet_id) return true;
  const asm = String(assemblyName || '').trim().toLowerCase();
  const name = String(line.name || '').trim().toLowerCase();
  if (asm && name === asm) return false;
  return Boolean(name);
}

/**
 * Build printGroups for the A4 delivery note from persisted warehouse_delivery_entries.
 * @param {Array} entries
 * @param {{ displayName?: (rawName: string, assemblyId?: string) => string } | null} nameFormatter
 */
export function buildDeliveryPrintGroupsFromEntries(entries, nameFormatter = null) {
  const raw = entries || [];
  const setGroups = buildSetDeliveryPrintGroupsFromEntries(raw, nameFormatter);
  const setGroupIds = new Set(
    raw
      .filter((e) => e.kind === 'set-parent')
      .map((e) => String(e.metadata?.delivery_set_group_id || e.combo_id || e.id)),
  );
  const nonSetEntries = raw.filter((e) => {
    if (e.kind === 'set-parent' || e.kind === 'set-component') return false;
    if (e.kind === 'packet' && setGroupIds.has(String(e.metadata?.delivery_set_group_id || ''))) {
      return false;
    }
    return true;
  });

  const lines = groupWarehouseDisplayLines(nonSetEntries);
  const byAssembly = new Map();

  for (const row of lines) {
    const meta = row.metadata || {};
    if (row.kind === 'assembly-header') continue;

    const assemblyName = assemblyDisplayName(
      nameFormatter,
      meta.assembly_name || row.name || 'Product',
      meta.assembly_id,
    );
    const assemblyId = String(meta.assembly_id || assemblyName);
    const units = Math.max(1, Number(meta.units) || Number(row.quantity) || 1);
    const key = assemblyId;
    if (!byAssembly.has(key)) {
      byAssembly.set(key, { assembly_name: assemblyName, units, lines: [] });
    }
    const group = byAssembly.get(key);
    group.units = Math.max(group.units, units);

    if (meta.finished_unit === true && !deliveryEntryPacketId(row)) {
      continue;
    }

    const subLine = {
      name: row.name,
      packet_number: meta.packet_number,
      qty: Number(row.quantity) || 0,
      metadata: meta,
    };
    if (!deliveryPrintSubrowIsPacketLine(subLine, assemblyName)) continue;

    group.lines.push({
      name: deliveryEntrySentToCustomer(row)
        ? `${subLine.name} — sent to customer`
        : subLine.name,
      packet_number: subLine.packet_number,
      qty: subLine.qty,
      sent_to_customer: deliveryEntrySentToCustomer(row),
    });
  }

  return [...setGroups, ...byAssembly.values()];
}
