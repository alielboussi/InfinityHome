import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'warehouse-production-locale:v1';

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
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale === 'en' ? 'en' : 'ar');
  } catch {
    /* ignore */
  }
}
