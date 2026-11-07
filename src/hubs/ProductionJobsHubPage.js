import React from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from '../BackToDashboard';
import PortalHubBar from '../components/PortalHubBar';
import { usePortalHubView } from '../hooks/usePortalHubView';
import UpholsteryTimerPage from '../UpholsteryTimerPage';
import CarpentryJobsPage from '../CarpentryJobsPage';
import PaintingJobsPage from '../PaintingJobsPage';

const JOB_OPTIONS = [
  { value: 'upholstery-jobs', label: 'Upholstery jobs' },
  { value: 'carpentry-jobs', label: 'Carpentry jobs' },
  { value: 'painting-jobs', label: 'Painting jobs' },
];

export default function ProductionJobsHubPage() {
  const [view, setView] = usePortalHubView('view', JOB_OPTIONS, 'upholstery-jobs');

  let body = null;
  switch (view) {
    case 'upholstery-jobs':
      body = <UpholsteryTimerPage embedInHub />;
      break;
    case 'carpentry-jobs':
      body = <CarpentryJobsPage embedInHub />;
      break;
    case 'painting-jobs':
      body = <PaintingJobsPage embedInHub />;
      break;
    default:
      return <Navigate to="/production-jobs?view=upholstery-jobs" replace />;
  }

  return (
    <div className="portal-hub-page">
      <div className="portal-hub-page__chrome page-header-row">
        <BackToDashboard />
        <PortalHubBar
          title="Jobs"
          viewLabel="Job screen"
          viewValue={view}
          viewOptions={JOB_OPTIONS}
          onViewChange={setView}
        />
      </div>
      {body}
    </div>
  );
}
