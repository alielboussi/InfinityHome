import { formatQuoteItemDeliveryNoteFieldLines } from './quoteProductionItemFields.js';

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

/** Quote / workshop order lines → A4 print groups (carpentry, upholstery, painting). */
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
