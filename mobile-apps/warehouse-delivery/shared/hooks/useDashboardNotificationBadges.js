import { useCallback, useEffect, useState } from 'react';
import {
  clearDashboardBadge,
  getDashboardBadgeCounts,
  hydrateDashboardBadges,
  subscribeDashboardBadges,
} from '../lib/dashboardNotificationBadges';

export function useDashboardNotificationBadges() {
  const [counts, setCounts] = useState(() => getDashboardBadgeCounts());

  useEffect(() => {
    let active = true;
    hydrateDashboardBadges().then(() => {
      if (active) setCounts(getDashboardBadgeCounts());
    });
    const unsub = subscribeDashboardBadges((next) => {
      if (active) setCounts(next);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const clearBadge = useCallback((key) => {
    clearDashboardBadge(key);
  }, []);

  return { counts, clearBadge };
}
