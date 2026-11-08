import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'production_push_prefs_v1';

export const DEFAULT_PRODUCTION_PUSH_PREFS = Object.freeze({
  quotes: true,
  repairs: true,
  jobs: true,
  painting_jobs: true,
});

export async function loadProductionPushPrefs() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRODUCTION_PUSH_PREFS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PRODUCTION_PUSH_PREFS };
    return {
      quotes: parsed.quotes !== false,
      repairs: parsed.repairs !== false,
      jobs: parsed.jobs !== false,
      painting_jobs: parsed.painting_jobs !== false,
    };
  } catch {
    return { ...DEFAULT_PRODUCTION_PUSH_PREFS };
  }
}

export async function saveProductionPushPrefs(prefs) {
  const next = {
    quotes: prefs?.quotes !== false,
    repairs: prefs?.repairs !== false,
    jobs: prefs?.jobs !== false,
    painting_jobs: prefs?.painting_jobs !== false,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
