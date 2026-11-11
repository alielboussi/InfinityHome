import {
  groupWarehouseDisplayLines,
  deliveryEntryPacketId,
  deliveryEntrySentToCustomer,
} from './warehouseDelivery.js';
import { buildSetDeliveryPrintGroupsFromEntries } from './warehouseDeliverySetPrint.js';
import { formatQuoteItemDeliveryNoteFieldLines } from './quoteProductionItemFields.js';

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
  if (line.line_kind === 'field' || line.kind === 'field') return true;
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

function compactDefined(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([key, val]) => {
    if (val !== undefined) out[key] = val;
  });
  return out;
}

function sanitizePrintGroupLine(line) {
  if (!line || typeof line !== 'object') return null;
  const kind = String(line.kind || line.line_kind || '').toLowerCase();
  if (kind === 'meta') return null;
  const name = String(line.name || '').trim();
  if (!name) return null;
  return compactDefined({
    name,
    kind: kind || undefined,
    line_kind: line.line_kind || undefined,
    qty: line.qty ?? line.quantity,
    quantity: line.quantity,
    packet_number: line.packet_number,
    packet_id: line.packet_id,
    depth: line.depth,
    sent_to_customer: line.sent_to_customer === true ? true : undefined,
  });
}

/** Drop catalog-fallback / meta rows so A4 notes only show real product lines. */
export function sanitizeDeliveryNotePrintGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => {
      const name = String(group?.assembly_name || group?.name || '').trim();
      if (!name) return null;
      const lines = (Array.isArray(group.lines) ? group.lines : [])
        .map(sanitizePrintGroupLine)
        .filter(Boolean);
      const elapsed = String(group.elapsed_display ?? '').trim() || '—';
      return compactDefined({
        assembly_name: name,
        set_name: group.set_name || null,
        units: Math.max(1, Number(group.units ?? group.quantity) || 1),
        lines,
        elapsed_display: elapsed,
      });
    })
    .filter(Boolean);
}

export function printGroupsFromQuoteLines(lines) {
  return sanitizeDeliveryNotePrintGroups(
    (Array.isArray(lines) ? lines : []).map((line) => ({
      assembly_name: line?.name || line?.name_override || line?.assembly_name,
      units: line?.quantity ?? line?.units,
      lines: formatQuoteItemDeliveryNoteFieldLines(line).map((name) => ({
        name,
        kind: 'field',
        qty: '',
      })),
    })),
  );
}
