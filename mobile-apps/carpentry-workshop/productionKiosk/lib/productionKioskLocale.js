import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'warehouse-production-locale:v1';

const listeners = new Set();
let memoryLocale = 'ar';

function emitLocale(locale) {
  memoryLocale = locale;
  listeners.forEach((fn) => {
    try {
      fn(locale);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeProductionKioskLocale(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(memoryLocale);
  return () => listeners.delete(listener);
}

export async function readProductionKioskLocale() {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'ar') {
      emitLocale(v);
      return v;
    }
  } catch {
    /* ignore */
  }
  emitLocale('ar');
  return 'ar';
}

export async function writeProductionKioskLocale(locale) {
  const v = locale === 'en' ? 'en' : 'ar';
  try {
    await AsyncStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
  emitLocale(v);
}