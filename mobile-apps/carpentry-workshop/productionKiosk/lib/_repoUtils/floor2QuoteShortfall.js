/** Floor 2 WIP requirements on production quote lines (showroom + customer template lines). */

function lineFloor2AssemblyId(line) {
  if (!line || typeof line !== 'object') return '';
  const meta = line.metadata && typeof line.metadata === 'object' ? line.metadata : {};
  return String(line.floor2_assembly_id || meta.floor2_assembly_id || '').trim();
}

export function collectFloor2QtyNeedsFromQuoteLines(lines = []) {
  const needs = new Map();
  for (const line of lines) {
    const aid = lineFloor2AssemblyId(line);
    if (!aid) continue;
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 0));
    needs.set(aid, (needs.get(aid) || 0) + qty);
  }
  return needs;
}

export function isFloor2ManufactureBlockError(message) {
  const m = String(message || '');
  return m.includes('Manufacture') && m.includes('Floor 2');
}