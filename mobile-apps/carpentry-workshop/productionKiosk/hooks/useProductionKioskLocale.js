// @refresh reset
import { useEffect, useState } from 'react';
import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import { kioskTextAlign } from '../lib/kioskLayout';

const STORAGE_KEY = 'warehouse-production-locale:v1';

function localeStorage() {
  const mod = AsyncStorageModule;
  return mod?.default ?? mod?.AsyncStorage ?? mod;
}

export function useProductionKioskLocale(options = {}) {
  const forceArabic = options?.forceArabic === true;
  const [locale, setLocaleState] = useState('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = localeStorage();
    const getItem = typeof store?.getItem === 'function' ? store.getItem.bind(store) : null;
    if (!getItem) {
      setReady(true);
      return undefined;
    }
    getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'en' || v === 'ar') setLocaleState(v);
      })
      .catch(() => {})
      .finally(() => setReady(true));
    return undefined;
  }, []);

  const setLocale = (next) => {
    const v = next === 'en' ? 'en' : 'ar';
    setLocaleState(v);
    const store = localeStorage();
    if (typeof store?.setItem === 'function') {
      store.setItem(STORAGE_KEY, v).catch(() => {});
    }
  };

  const toggleLocale = () => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  };

  useEffect(() => {
    if (forceArabic) setLocaleState('ar');
    return undefined;
  }, [forceArabic]);

  const effectiveLocale = forceArabic ? 'ar' : locale;
  const textAlign = typeof kioskTextAlign === 'function'
    ? kioskTextAlign(effectiveLocale)
    : (effectiveLocale === 'ar' ? 'right' : 'left');

  return {
    locale: effectiveLocale,
    setLocale,
    toggleLocale: forceArabic ? () => {} : toggleLocale,
    isArabic: effectiveLocale === 'ar',
    textAlign,
    ready,
    forceArabic,
  };
}
