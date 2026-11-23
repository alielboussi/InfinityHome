import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'warehouse-production-locale:v1';
const listeners = new Set();

function normalizeLocale(value) {
  return value === 'en' ? 'en' : 'ar';
}

export function subscribeProductionKioskLocale(handler) {
  if (typeof handler !== 'function') return () => {};
  listeners.add(handler);
  return () => listeners.delete(handler);
}

function emitLocale(locale) {
  listeners.forEach((fn) => {
    try {
      fn(locale);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export async function readProductionKioskLocale() {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'ar') return v;
  } catch {
    /* ignore */
  }
  return 'ar';
}

export async function writeProductionKioskLocale(locale) {
  const v = normalizeLocale(locale);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
  emitLocale(v);
  return v;
}
