import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Legacy /production-workspace — maps old ?view= values to the split hubs.
 */
export default function ProductionWorkspaceHubPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search || '');
  const view = String(params.get('view') || 'upholstery-catalog').toLowerCase();

  if (view === 'intake') {
    return <Navigate to="/production-intake" replace />;
  }
  if (view === 'carpentry-catalog') {
    return <Navigate to="/production-catalogs?view=carpentry-catalog" replace />;
  }
  if (view === 'upholstery-catalog') {
    return <Navigate to="/production-catalogs?view=upholstery-catalog" replace />;
  }
  if (view === 'carpentry-jobs') {
    return <Navigate to="/production-jobs?view=carpentry-jobs" replace />;
  }
  if (view === 'painting-jobs') {
    return <Navigate to="/production-jobs?view=painting-jobs" replace />;
  }
  if (view === 'upholstery-jobs') {
    return <Navigate to="/production-jobs?view=upholstery-jobs" replace />;
  }
  return <Navigate to="/production-catalogs?view=upholstery-catalog" replace />;
}
