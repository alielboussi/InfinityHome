import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import '../warehouse-production-kiosk.css';
import WarehouseProductionShell from './WarehouseProductionShell';
import WarehouseProductionLoginPage from './WarehouseProductionLoginPage';
import WarehouseProductionDashboardPage from './WarehouseProductionDashboardPage';
import WarehouseProductionCreatePage from './WarehouseProductionCreatePage';
import WarehouseProductionStockPage from './WarehouseProductionStockPage';

export default function WarehouseProductionRoutes() {
  return (
    <Routes>
      <Route path="login" element={<WarehouseProductionLoginPage />} />
      <Route element={<WarehouseProductionShell />}>
        <Route index element={<WarehouseProductionDashboardPage />} />
        <Route path="create" element={<WarehouseProductionCreatePage />} />
        <Route path="stock" element={<WarehouseProductionStockPage />} />
        <Route path="*" element={<Navigate to="/warehouse-production" replace />} />
      </Route>
    </Routes>
  );
}
