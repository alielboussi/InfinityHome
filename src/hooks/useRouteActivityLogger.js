import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logUserActivity } from '../utils/userActivityLog';

export default function useRouteActivityLogger() {
  const location = useLocation();
  const previousPath = useRef('');

  useEffect(() => {
    const path = location.pathname || '/';
    if (!path || path === previousPath.current) return;
    if (path.startsWith('/login')) return;
    previousPath.current = path;
    logUserActivity({
      actionType: 'navigation',
      actionLabel: 'Page View',
      details: path,
      reference: path,
      entityType: 'route',
      entityId: path,
      route: path,
    });
  }, [location.pathname]);
}
