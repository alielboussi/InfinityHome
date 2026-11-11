import React from 'react';
import { Navigate } from 'react-router-dom';
import PortalHubBar from '../components/PortalHubBar';
import { usePortalHubView } from '../hooks/usePortalHubView';
import CarpentryWarehouseStockPage from '../CarpentryWarehouseStockPage';
import { storeroomLabelForWarehouseIndex } from '../constants/carpentryWarehouses';

const ROOM_OPTIONS = [1, 2, 3].map((n) => ({
  value: String(n),
  label: storeroomLabelForWarehouseIndex(n) || `Storeroom ${n}`,
}));

export default function WarehouseStoreroomsHubPage() {
  const [room, setRoom] = usePortalHubView('room', ROOM_OPTIONS, '1');
  const index = Number(room);

  if (!Number.isFinite(index) || index < 1 || index > 3) {
    return <Navigate to="/warehouse-storerooms?room=1" replace />;
  }

  return (
    <div className="portal-hub-page">
      <div className="portal-hub-page__chrome page-header-row">
        <PortalHubBar
          title="Carpentry storerooms"
          viewLabel="Storeroom"
          viewValue={room}
          viewOptions={ROOM_OPTIONS}
          onViewChange={setRoom}
        />
      </div>
      <CarpentryWarehouseStockPage warehouseIndexOverride={index} embedInHub />
    </div>
  );
}
