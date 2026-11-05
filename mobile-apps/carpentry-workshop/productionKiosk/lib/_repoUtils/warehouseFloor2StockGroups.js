import { extractProductionBaseName } from './productionItemName.js';

/**
 * Group Floor 2 stock rows by production family base name (matches Upholstery Manufacture).
 */
export function groupFloor2StockByFamily(stockRows, assemblyById) {
  const map = new Map();
  (stockRows || []).forEach((row) => {
    const aid = String(row.assembly_id || '').trim();
    if (!aid) return;
    const asm = assemblyById?.get?.(aid);
    const rawName = String(asm?.name || aid).trim();
    const familyBase = extractProductionBaseName(rawName) || rawName || aid;
    const key = familyBase.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        key,
        familyBase,
        assemblyIds: [],
        rows: [],
        totalQty: 0,
      });
    }
    const group = map.get(key);
    group.rows.push({ ...row, assembly_id: aid });
    group.assemblyIds.push(aid);
    group.totalQty += Math.max(0, Number(row.quantity) || 0);
  });
  return [...map.values()]
    .map((g) => ({
      ...g,
      assemblyIds: [...new Set(g.assemblyIds)],
      rows: g.rows.sort((a, b) => {
        const na = String(assemblyById?.get?.(a.assembly_id)?.name || '');
        const nb = String(assemblyById?.get?.(b.assembly_id)?.name || '');
        return na.localeCompare(nb);
      }),
    }))
    .sort((a, b) => a.familyBase.localeCompare(b.familyBase));
}
