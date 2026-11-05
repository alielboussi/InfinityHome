import React from 'react';
import { Navigate } from 'react-router-dom';

/** Legacy URL — Sales Storage lives under Floor 1 warehouse catalog. */
export default function WarehouseSalesStorageAdmin() {
  return <Navigate to="/warehouse-products/sales-storage" replace />;
}
