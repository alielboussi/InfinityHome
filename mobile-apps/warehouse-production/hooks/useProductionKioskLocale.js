import { useCallback, useEffect, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';
import { kioskTextAlign } from '../lib/kioskLayout';
import { readProductionKioskLocale, writeProductionKioskLocale } from '../lib/productionKioskLocale';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function useProductionKioskLocale() {
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
