import { useCallback, useEffect, useState } from 'react';
import { kioskTextAlign } from '../lib/kioskLayout';
import { readProductionKioskLocale, writeProductionKioskLocale } from '../lib/productionKioskLocale';

export function useProductionKioskLocale(options = {}) {
  const forceArabic = options?.forceArabic === true;
  const [locale, setLocaleState] = useState('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await readProductionKioskLocale();
      if (alive) {
        setLocaleState(v);
        setReady(true);
      }
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

  useEffect(() => {
    if (!forceArabic) return;
    setLocale('ar');
  }, [forceArabic, setLocale]);

  const effectiveLocale = forceArabic ? 'ar' : locale;

  return {
    locale: effectiveLocale,
    setLocale,
    toggleLocale: forceArabic ? () => {} : toggleLocale,
    isArabic: effectiveLocale === 'ar',
    textAlign: kioskTextAlign(effectiveLocale),
    ready,
    forceArabic,
  };
}
