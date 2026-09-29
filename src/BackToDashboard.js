import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, getHomeDashboardPath } from './accessControl';

export default function BackToDashboard({ to, title = 'Back to Dashboard', ariaLabel }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname || '';
  const user = getCurrentUser();
  const homePath = getHomeDashboardPath(user);
  const target = to || homePath;
  const label = ariaLabel || title;

  if (!to && (path === '/' || path === homePath || path === '/dashboard' || /^\/login(\b|\/|\?|#)/i.test(path))) {
    return null;
  }

  return (
    <button
      type="button"
      className="back-inline-btn"
      onClick={() => navigate(target)}
      title={title}
      aria-label={label}
    >
      <span className="back-inline-icon" aria-hidden="true">←</span>
    </button>
  );
}
