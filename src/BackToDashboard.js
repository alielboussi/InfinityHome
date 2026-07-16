import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, getHomeDashboardPath } from './accessControl';

export default function BackToDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname || '';
  const user = getCurrentUser();
  const homePath = getHomeDashboardPath(user);

  if (path === '/' || path === homePath || path === '/dashboard' || /^\/login(\b|\/|\?|#)/i.test(path)) return null;

  return (
    <button
      type="button"
      className="back-inline-btn"
      onClick={() => navigate(homePath)}
      title="Back to Dashboard"
      aria-label="Back to Dashboard"
    >
      <span className="back-inline-icon" aria-hidden="true">←</span>
    </button>
  );
}
