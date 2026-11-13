import React from 'react';
import ProductionJobsTrackingPanel from '../components/ProductionJobsTrackingPanel';

export default function ProductionJobsHubPage() {
  return (
    <div className="portal-hub-page">
      <div className="portal-hub-page__chrome page-header-row">
        <h1 style={{ margin: 0 }}>Jobs</h1>
      </div>
      <ProductionJobsTrackingPanel
        embedInHub
        description="Every upholstery, carpentry, and painting job in one place. Filter by department; cards show product, qty, workshop stage, and elapsed time (materials are not shown)."
      />
    </div>
  );
}
