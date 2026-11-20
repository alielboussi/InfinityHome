import React from 'react';
import BackToDashboard from './BackToDashboard';
import ProductionJobsTrackingPanel from './components/ProductionJobsTrackingPanel';

export default function WarehouseReturnsTrackage() {
  return (
    <div className="dashboard-container production-tracking-page">
      <div className="page-header-row">
        <BackToDashboard />
      </div>
      <ProductionJobsTrackingPanel
        inProgressOnly
        title="Production tracking"
        description="Active factory jobs only (upholstery, carpentry, painting). Completed work is hidden here — use the Jobs hub or workshop apps for history."
      />
    </div>
  );
}
