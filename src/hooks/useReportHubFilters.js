import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { defaultReportDateRange } from '../utils/reportDateRange';

/** Shared report hub filters in URL: startDate, endDate, user (optional substring). */
export function useReportHubFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = useMemo(() => defaultReportDateRange(), []);
  const startDate = searchParams.get('startDate') || defaults.startDate;
  const endDate = searchParams.get('endDate') || defaults.endDate;
  const userFilter = searchParams.get('user') || '';
  const customerFilter = searchParams.get('customer') || '';

  const patch = useCallback((patchObj) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patchObj).forEach(([key, val]) => {
      const s = String(val ?? '').trim();
      if (!s) next.delete(key);
      else next.set(key, s);
    });
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return {
    startDate,
    endDate,
    userFilter,
    customerFilter,
    setStartDate: (v) => patch({ startDate: v }),
    setEndDate: (v) => patch({ endDate: v }),
    setUserFilter: (v) => patch({ user: v }),
    setCustomerFilter: (v) => patch({ customer: v }),
  };
}

/** Child reports: sync local state from hub URL when embedInHub is set. */
export function useSyncReportFiltersFromUrl({
  embedInHub,
  setStartDate,
  setEndDate,
  setUserFilter,
}) {
  const { startDate, endDate, userFilter } = useReportHubFilters();
  useEffect(() => {
    if (!embedInHub) return;
    if (startDate) setStartDate(startDate);
    if (endDate) setEndDate(endDate);
    if (setUserFilter) setUserFilter(userFilter);
  }, [embedInHub, startDate, endDate, userFilter, setStartDate, setEndDate, setUserFilter]);
}
