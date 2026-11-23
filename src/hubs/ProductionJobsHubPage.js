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
    <div className="portal-hub-page production-tracking-page">
      <div className="portal-hub-page__chrome page-header-row">
        <h1 style={{ margin: 0 }}>Jobs</h1>
      </div>
      <ProductionJobsTrackingPanel
        embedInHub
        initialDepartment={initialDepartment}
        description="Latest upholstery, carpentry, and painting jobs — same queues as the workshop apps. Cards show customer / showroom / repair badges and which department the work is in. Completed jobs stay hidden until you show them."
      />
    </div>
  );
}
