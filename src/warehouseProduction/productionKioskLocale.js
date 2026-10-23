const STORAGE_KEY = 'warehouse-production-locale:v1';

export function readProductionKioskLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'ar') return v;
  } catch {}
  return 'ar';
}

export function writeProductionKioskLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale === 'en' ? 'en' : 'ar');
  } catch {}
}
