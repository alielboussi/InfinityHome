/** Workshop cards when a customer quote mixes catalogue lines + Floor 2 WIP lines. */

export const QUOTE_LINE_SET_FLOOR2 = 'floor2_wip';
export const QUOTE_LINE_SET_CATALOG = 'quote_catalog';

export function isQuoteLineFloor2Wip(line) {
  if (!line || typeof line !== 'object') return false;
  const meta = line.metadata && typeof line.metadata === 'object' ? line.metadata : {};
  if (meta.floor2_wip_line === true || line.floor2_wip_line === true) return true;
  return Boolean(String(meta.floor2_assembly_id || line.floor2_assembly_id || '').trim());
}

export function quoteLineFloor2AssemblyId(line) {
  if (!line || typeof line !== 'object') return '';
  const meta = line.metadata && typeof line.metadata === 'object' ? line.metadata : {};
  return String(meta.floor2_assembly_id || line.floor2_assembly_id || '').trim();
}

export function partitionQuoteProductionLines(lines = []) {
  const floor2 = [];
  const catalog = [];
  for (const line of lines || []) {
    if (isQuoteLineFloor2Wip(line)) floor2.push(line);
    else catalog.push(line);
  }
  return { floor2, catalog };
}

export function customerQuoteNeedsSplitCards(lines = []) {
  const { floor2, catalog } = partitionQuoteProductionLines(lines);
  return floor2.length > 0 && catalog.length > 0;
}

export function normalizeProductionLineSet(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === QUOTE_LINE_SET_FLOOR2 || v === 'floor2' || v === 'floor2_wip') return QUOTE_LINE_SET_FLOOR2;
  if (v === QUOTE_LINE_SET_CATALOG || v === 'catalog' || v === 'quote_catalog') return QUOTE_LINE_SET_CATALOG;
  return null;
}

export function productionCardListKey(quoteId, lineSet = '') {
  const qid = String(quoteId || '').trim();
  const set = normalizeProductionLineSet(lineSet);
  if (!qid) return '';
  return set ? `${qid}:${set}` : qid;
}

export function filterLinesForProductionLineSet(lines, lineSet) {
  const set = normalizeProductionLineSet(lineSet);
  if (!set) return Array.isArray(lines) ? lines : [];
  const { floor2, catalog } = partitionQuoteProductionLines(lines);
  return set === QUOTE_LINE_SET_FLOOR2 ? floor2 : catalog;
}

export function productionLineSetLabelKey(lineSet) {
  const set = normalizeProductionLineSet(lineSet);
  if (set === QUOTE_LINE_SET_FLOOR2) return 'quoteCardFloor2Wip';
  if (set === QUOTE_LINE_SET_CATALOG) return 'quoteCardQuoteProducts';
  return '';
}