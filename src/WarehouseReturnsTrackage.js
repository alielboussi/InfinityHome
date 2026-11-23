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
        title="Production tracking"
        description="Latest factory jobs, quote orders, and repairs (carpentry, upholstery, painting). Completed work is hidden until you show it."
      />
    </div>
  );
}
