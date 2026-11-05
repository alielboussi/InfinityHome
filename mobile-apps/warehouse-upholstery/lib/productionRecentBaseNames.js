import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  extractProductionBaseName,
  matchProductionGirlNameFromPool,
  normalizeProductionNameInput,
} from './productionItemName';

const STORAGE_KEY = 'warehouse_production_recent_base_names_v1';
const MAX_RECENT = 2;

function normalizeStoredBaseName(raw) {
  const extracted = extractProductionBaseName(String(raw || '').trim());
  const fromPool = matchProductionGirlNameFromPool(extracted);
  if (fromPool) return fromPool;
  return normalizeProductionNameInput(extracted);
}

export function mergeRecentBaseNames(serverList, localList) {
  const out = [];
  [...(serverList || []), ...(localList || [])].forEach((item) => {
    const name = normalizeStoredBaseName(item);
    if (!name) return;
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  });
  return out.slice(0, MAX_RECENT);
}

export async function loadRecentProductionBaseNames() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    parsed.forEach((item) => {
      const name = normalizeStoredBaseName(item);
      if (!name) return;
      if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
    });
    return out.slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * Server log (last creates) + device storage — most recent first, max 2.
 */
export async function refreshRecentProductionBaseNames() {
  const local = await loadRecentProductionBaseNames();
  let server = [];
  try {
    const { fetchProductionRecentBaseNames } = await import('../services/productionApi');
    server = await fetchProductionRecentBaseNames();
  } catch {
    // offline or API not deployed yet
  }
  return mergeRecentBaseNames(server, local);
}

/**
 * Remember base name after a successful create (most recent first, max 2).
 */
export async function recordRecentProductionBaseName(baseOrFullName) {
  const base = normalizeStoredBaseName(baseOrFullName);
  if (!base) return loadRecentProductionBaseNames();

  const prev = await loadRecentProductionBaseNames();
  const next = [base, ...prev.filter((n) => n.toLowerCase() !== base.toLowerCase())].slice(0, MAX_RECENT);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}
