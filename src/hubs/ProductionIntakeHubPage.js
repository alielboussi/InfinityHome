import React from 'react';
import BackToDashboard from '../BackToDashboard';
import ProductionAdminPage from '../ProductionAdminPage';

export default function ProductionIntakeHubPage() {
  return (
    <div className="portal-hub-page">
      <div className="portal-hub-page__chrome page-header-row">
        <BackToDashboard />
        <h1 className="portal-hub-bar__title" style={{ margin: 0 }}>Production intake</h1>
      </div>
      <ProductionAdminPage embedInHub />
    </div>
  );
}
