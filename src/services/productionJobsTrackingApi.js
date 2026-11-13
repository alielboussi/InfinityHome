import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { mergeProductionJobsTrackingClient } from '../utils/buildProductionJobsTrackingClient';
import { fetchUpholsteryProductionJobs } from './warehouseProductionApi';
import {
  fetchCarpentryProductionJobs,
  fetchPaintingProductionJobs,
} from './carpentryCatalogApi';

function isUnknownOpError(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('unknown op') || msg.includes('unknown action');
}

async function fetchProductionJobsTrackingFallback({ department, limit } = {}) {
  const cap = Math.min(500, Math.max(1, Number(limit) || 300));
  const [upholstery, carpentryPayload, paintingPayload] = await Promise.all([
    fetchUpholsteryProductionJobs({ activeOnly: false }).catch(() => []),
    fetchCarpentryProductionJobs({ activeOnly: false, limit: cap }).catch(() => ({ jobs: [] })),
    fetchPaintingProductionJobs({ activeOnly: false, limit: cap }).catch(() => ({ jobs: [] })),
  ]);
  const carpentry = carpentryPayload?.jobs || [];
  const painting = paintingPayload?.jobs || [];
  const payload = mergeProductionJobsTrackingClient({
    upholstery,
    carpentry,
    painting,
    department,
  });
  return {
    ...payload,
    jobs: payload.jobs.slice(0, cap),
    fallback: true,
  };
}

export async function fetchProductionJobsTracking({ department, limit } = {}) {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/warehouse-mobile'), {
    method: 'POST',
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      op: 'production-jobs-tracking-list',
      department: department || undefined,
      limit: limit || undefined,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const errMsg = payload?.error || `Request failed (${response.status})`;
    if (isUnknownOpError(errMsg)) {
      return fetchProductionJobsTrackingFallback({ department, limit });
    }
    throw new Error(errMsg);
  }
  return payload;
}
