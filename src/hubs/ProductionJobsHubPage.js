import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductionJobsTrackingPanel from '../components/ProductionJobsTrackingPanel';

const VIEW_TO_DEPARTMENT = {
  'upholstery-jobs': 'upholstery',
  'carpentry-jobs': 'carpentry',
  'painting-jobs': 'painting',
};

export default function ProductionJobsHubPage() {
  const [searchParams] = useSearchParams();
  const initialDepartment = useMemo(() => {
    const view = String(searchParams.get('view') || '').trim();
    return VIEW_TO_DEPARTMENT[view] || 'all';
  }, [searchParams]);

  return (
    <div className="portal-hub-page">
      <div className="portal-hub-page__chrome page-header-row">
        <h1 style={{ margin: 0 }}>Jobs</h1>
      </div>
      <ProductionJobsTrackingPanel
        embedInHub
        initialDepartment={initialDepartment}
        description="Every upholstery, carpentry, and painting job in one place. Filter by department; cards show product, qty, workshop stage, and elapsed time (materials are not shown)."
      />
    </div>
  );
}
