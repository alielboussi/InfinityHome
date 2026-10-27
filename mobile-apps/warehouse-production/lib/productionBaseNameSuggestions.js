import {
  extractProductionBaseName,
  matchProductionGirlNameFromPool,
  normalizeProductionNameInput,
  normalizeWarehousePacketNameKey,
} from './productionItemName';

function assemblyDisplayName(row) {
  return String(row?.name || row?.assembly?.name || '').trim();
}

/**
 * Unique product line names (base only) from catalog rows — not full SKU/product titles.
 */
export function uniqueBaseNamesFromCatalog(assemblies, query = '', limit = 8) {
  const q = normalizeWarehousePacketNameKey(query);
  const map = new Map();
  (assemblies || []).forEach((row) => {
    const base = extractProductionBaseName(assemblyDisplayName(row));
    if (!base) return;
    const key = base.toLowerCase();
    if (q && !key.includes(q)) return;
    if (!map.has(key)) {
      map.set(key, normalizeProductionNameInput(base));
    }
  });
  return [...map.values()]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, Math.max(1, limit));
}

/** Merge recent + catalog matches; always unique base names. */
export function mergeBaseNameSuggestions({
  catalogAssemblies,
  query,
  recentNames,
  limit = 8,
}) {
  const q = String(query || '').trim();
  if (!q) {
    const out = [];
    const seen = new Set();
    (recentNames || []).forEach((name) => {
      const normalized = matchProductionGirlNameFromPool(name)
        || normalizeProductionNameInput(name);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out.slice(0, 2);
  }
  return uniqueBaseNamesFromCatalog(catalogAssemblies, q, limit);
}
