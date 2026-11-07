import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function LegacyStoreroomRedirect() {
  const { index } = useParams();
  const room = Number(index);
  const safe = Number.isFinite(room) && room >= 1 && room <= 3 ? room : 1;
  return <Navigate to={`/warehouse-storerooms?room=${safe}`} replace />;
}
