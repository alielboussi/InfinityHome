import { useCallback, useEffect, useState } from 'react';
import { kioskTextAlign } from '../lib/kioskLayout';
import { readProductionKioskLocale, writeProductionKioskLocale } from '../lib/productionKioskLocale';

/**
 * Locale follows the delivery dashboard toggle (AsyncStorage). All screens share the same EN/AR choice.
 */
export function useProductionKioskLocale() {
  const [locale, setLocaleState] = useState('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await readProductionKioskLocale();
      if (alive && (v === 'ar' || v === 'en')) {
        setLocaleState(v);
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const setLocale = useCallback(async (next) => {
    const v = next === 'en' ? 'en' : 'ar';
    await writeProductionKioskLocale(v);
    setLocaleState(v);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }, [locale, setLocale]);

  return {
    locale,
    setLocale,
    toggleLocale,
    isArabic: locale === 'ar',
    textAlign: kioskTextAlign(locale),
    ready,
  };
}
