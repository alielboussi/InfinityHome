import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import { isWarehouseProductionKioskAllowed } from '../mobile/mobileAccessManifest';
import { useAuthProfileMobileGrant } from '../hooks/useAuthProfileMobileGrant';
import { fetchProductionKioskAccess } from '../services/warehouseProductionApi';
import { readProductionKioskLocale, writeProductionKioskLocale } from './productionKioskLocale';
import { tUi } from '../utils/productionKioskI18n';
import '../warehouse-production-kiosk.css';

export function useProductionKioskLocale() {
  const [locale, setLocaleState] = useState(readProductionKioskLocale);
  const setLocale = useCallback((next) => {
    const v = next === 'en' ? 'en' : 'ar';
    writeProductionKioskLocale(v);
    setLocaleState(v);
  }, []);
  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }, [locale, setLocale]);
  return { locale, setLocale, toggleLocale, isArabic: locale === 'ar', dir: locale === 'ar' ? 'rtl' : 'ltr' };
}

export function ProductionKioskTopBar({ title, onToggleLocale, locale }) {
  return (
    <header className="warehouse-production-kiosk__header">
      <h1 className="warehouse-production-kiosk__title">{title}</h1>
      <button
        type="button"
        className="warehouse-production-kiosk__lang-btn"
        onClick={onToggleLocale}
      >
        {tUi('translateToggle', locale)}
      </button>
    </header>
  );
}

export default function WarehouseProductionShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname || '';
  const isLoginRoute = path.endsWith('/login') || path === '/warehouse-production/login';
  const user = getCurrentUser();
  const { grant, loading: grantLoading } = useAuthProfileMobileGrant();
  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const catalogManager = useMemo(() => canManageCatalog(user), [user]);
  const grantAllowed = useMemo(
    () => catalogManager || isWarehouseProductionKioskAllowed(grant),
    [catalogManager, grant],
  );

  useEffect(() => {
    if (isLoginRoute) return;
    if (!user) {
      navigate(`/warehouse-production/login?next=${encodeURIComponent(path)}`, { replace: true });
      return;
    }
    let alive = true;
    (async () => {
      try {
        const remote = await fetchProductionKioskAccess();
        if (!alive) return;
        setAllowed(Boolean(remote.allowed) || grantAllowed);
      } catch {
        if (alive) setAllowed(grantAllowed);
      } finally {
        if (alive) setAccessChecked(true);
      }
    })();
    return () => { alive = false; };
  }, [grantAllowed, isLoginRoute, navigate, path, user]);

  if (isLoginRoute) {
    return <Outlet />;
  }

  if (!user) return null;

  if (!accessChecked || grantLoading) {
    return (
      <div className="warehouse-production-kiosk" dir="rtl">
        <p>{tUi('loading', 'ar')}</p>
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/warehouse-production/login" replace />;
  }

  return <Outlet />;
}
