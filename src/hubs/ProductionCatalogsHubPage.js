import React from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from '../BackToDashboard';
import PortalHubBar from '../components/PortalHubBar';
import { usePortalHubView } from '../hooks/usePortalHubView';
import UpholsteryPage from '../UpholsteryPage';
import CarpentryPage from '../CarpentryPage';

const CATALOG_OPTIONS = [
  { value: 'upholstery-catalog', label: 'Upholstery catalog' },
  { value: 'carpentry-catalog', label: 'Carpentry catalog' },
];

export default function ProductionCatalogsHubPage() {
  const [view, setView] = usePortalHubView('view', CATALOG_OPTIONS, 'upholstery-catalog');

  let body = null;
  switch (view) {
    case 'upholstery-catalog':
      body = <UpholsteryPage embedInHub />;
      break;
    case 'carpentry-catalog':
      body = <CarpentryPage embedInHub />;
      break;
    default:
      return <Navigate to="/production-catalogs?view=upholstery-catalog" replace />;
  }

  return (
    <div className="portal-hub-page">
      <div className="portal-hub-page__chrome page-header-row">
        <BackToDashboard />
        <PortalHubBar
          title="Catalogs"
          viewLabel="Catalog"
          viewValue={view}
          viewOptions={CATALOG_OPTIONS}
          onViewChange={setView}
        />
      </div>
      {body}
    </div>
  );
}
