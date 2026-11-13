import React from 'react';
import BackToDashboard from './BackToDashboard';
import ProductionJobsTrackingPanel from './components/ProductionJobsTrackingPanel';

export default function WarehouseReturnsTrackage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--dash-bg)', color: 'var(--dash-text)', padding: 24 }}>
      <div className="page-header-row">
        <BackToDashboard />
      </div>
      <ProductionJobsTrackingPanel
        title="Production tracking"
        description="Live view of factory jobs (upholstery, carpentry, painting) with the same flow statuses as the Orders app Tracking screen."
      />
    </div>
  );
}
