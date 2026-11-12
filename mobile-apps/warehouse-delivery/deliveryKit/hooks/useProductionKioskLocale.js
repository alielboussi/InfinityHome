import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { kioskTextAlign } from '../lib/kioskLayout';
import { readProductionKioskLocale, writeProductionKioskLocale } from '../lib/productionKioskLocale';

const ProductionKioskLocaleContext = createContext(null);

export function ProductionKioskLocaleProvider({ children }) {
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
    setLocaleState(v);
    await writeProductionKioskLocale(v);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next = prev === 'ar' ? 'en' : 'ar';
      void writeProductionKioskLocale(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    locale,
    setLocale,
    toggleLocale,
    isArabic: locale === 'ar',
    textAlign: kioskTextAlign(locale),
    ready,
  }), [locale, setLocale, toggleLocale, ready]);

  return React.createElement(
    ProductionKioskLocaleContext.Provider,
    { value },
    children,
  );
}

/**
 * Shared EN/AR locale for the delivery kiosk (dashboard + all stacks).
 */
export function useProductionKioskLocale() {
  const ctx = useContext(ProductionKioskLocaleContext);
  if (ctx) return ctx;

  // Fallback if a screen renders outside the provider (should not happen in production).
  const [locale, setLocaleState] = useState('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    readProductionKioskLocale().then((v) => {
      if (alive && (v === 'ar' || v === 'en')) setLocaleState(v);
      if (alive) setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const setLocale = useCallback(async (next) => {
    const v = next === 'en' ? 'en' : 'ar';
    setLocaleState(v);
    await writeProductionKioskLocale(v);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next = prev === 'ar' ? 'en' : 'ar';
      void writeProductionKioskLocale(next);
      return next;
    });
  }, []);

  return {
    locale,
    setLocale,
    toggleLocale,
    isArabic: locale === 'ar',
    textAlign: kioskTextAlign(locale),
    ready,
  };
}
