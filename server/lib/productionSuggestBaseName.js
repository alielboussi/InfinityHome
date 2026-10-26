import {
  buildProductionItemName,
  matchProductionGirlNameFromPool,
  pickRandomProductionBaseName,
} from '../../src/utils/productionItemName.js';

/** Pick one unused base name from the curated girl-name pool only (no AI / no places). */
export function suggestProductionBaseName() {
  return pickRandomProductionBaseName();
}

/**
 * @param {(fullProductName: string) => Promise<boolean>} isNameTaken — true if unavailable
 * @param {string} [preset] — seater preset to build full name for uniqueness
 * @param {(baseName: string) => Promise<boolean>} [isBaseTaken] — true if base line already exists
 */
export async function suggestUniqueProductionBaseName(isNameTaken, preset = '', isBaseTaken = null) {
  const p = String(preset || '').trim();
  const tryBases = [];
  for (let i = 0; i < 40; i += 1) {
    tryBases.push(pickRandomProductionBaseName());
  }
  for (const base of tryBases) {
    const canonical = matchProductionGirlNameFromPool(base);
    if (!canonical) continue;
    const full = p ? buildProductionItemName(canonical, p) : canonical;
    if (typeof isBaseTaken === 'function') {
      const baseUsed = await isBaseTaken(canonical);
      if (baseUsed) continue;
    }
    const taken = await isNameTaken(full);
    if (!taken) return canonical;
  }
  throw new Error('Could not find an unused name. Enter one manually.');
}
