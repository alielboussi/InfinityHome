import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import BackToDashboard from '../BackToDashboard';
import PortalHubBar from '../components/PortalHubBar';
import WarehouseCatalogViewToggle from '../components/WarehouseCatalogViewToggle';
import WarehouseCatalogCreateActions from '../components/WarehouseCatalogCreateActions';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import { useAuthProfileMobileGrant } from '../hooks/useAuthProfileMobileGrant';
import { isWarehouseCatalogAddProductAllowed } from '../mobile/mobileAccessManifest';
import { usePortalHubView } from '../hooks/usePortalHubView';
import { warehouseCatalogViewFromPath } from '../utils/routeSuspenseKey';
import WarehouseProductsPage from '../WarehouseProductsPage';
import WarehouseFloor2Page from '../WarehouseFloor2Page';

const FLOOR_OPTIONS = [
  { value: '1', label: 'Floor 1 — Catalog' },
  { value: '2', label: 'Floor 2 — WIP' },
];

export default function WarehouseFloorsHubPage() {
  const [floor, setFloor] = usePortalHubView('floor', FLOOR_OPTIONS, '1');
  const location = useLocation();
  const catalogView = warehouseCatalogViewFromPath(location.pathname, location.search);
  const isSalesStorageView = catalogView === 'sales-storage';
  const sessionUser = useMemo(() => getCurrentUser(), []);
  const canManage = useMemo(() => canManageCatalog(sessionUser), [sessionUser]);
  const { grant } = useAuthProfileMobileGrant();
  const canAddProduct = canManage || isWarehouseCatalogAddProductAllowed(grant);

  if (floor === '1') {
    return (
      <div className="portal-hub-page">
        <div className="portal-hub-page__chrome page-header-row">
          <BackToDashboard />
          <PortalHubBar
            title="Warehouses"
            viewLabel="Floor"
            viewValue={floor}
            viewOptions={FLOOR_OPTIONS}
            onViewChange={setFloor}
          >
            <div className="warehouse-hub-catalog-bar">
              <label className="portal-hub-bar__select-wrap warehouse-hub-catalog-bar__view">
                <span className="portal-hub-bar__select-label">View</span>
                <WarehouseCatalogViewToggle />
              </label>
              <WarehouseCatalogCreateActions
                canManage={canManage}
                canAddProduct={canAddProduct}
                hidden={isSalesStorageView}
              />
            </div>
          </PortalHubBar>
        </div>
        <WarehouseProductsPage embedInHub />
      </div>
    );
  }

  if (floor === '2') {
    return (
      <div className="portal-hub-page">
        <div className="portal-hub-page__chrome page-header-row">
          <BackToDashboard />
          <PortalHubBar
            title="Warehouses"
            viewLabel="Floor"
            viewValue={floor}
            viewOptions={FLOOR_OPTIONS}
            onViewChange={setFloor}
          />
        </div>
        <WarehouseFloor2Page embedInHub />
      </div>
    );
  }

  return <Navigate to="/warehouse-floors?floor=1" replace />;
}
