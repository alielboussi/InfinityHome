import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductionKioskTopBar, useProductionKioskLocale } from './WarehouseProductionShell';
import { tUi } from '../utils/productionKioskI18n';

export default function WarehouseProductionDashboardPage() {
  const navigate = useNavigate();
  const { locale, toggleLocale, dir } = useProductionKioskLocale();

  return (
    <div className="warehouse-production-kiosk" dir={dir}>
      <ProductionKioskTopBar title={tUi('dashTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
      <div className="warehouse-production-kiosk__dash-grid">
        <button
          type="button"
          className="warehouse-production-kiosk__dash-btn"
          onClick={() => navigate('/warehouse-production/create')}
        >
          {tUi('dashCreate', locale)}
        </button>
        <button
          type="button"
          className="warehouse-production-kiosk__dash-btn"
          onClick={() => navigate('/warehouse-production/stock')}
        >
          {tUi('dashStock', locale)}
        </button>
      </div>
    </div>
  );
}
