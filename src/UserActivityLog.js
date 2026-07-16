import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canViewUserActivity, getCurrentUser } from './accessControl';
import { fetchUserActivityLog, clearUserActivityLog } from './utils/userActivityLog';

const actionOptions = [
  { value: 'all', label: 'All actions' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'sale', label: 'Sales' },
  { value: 'layby', label: 'Laybys' },
  { value: 'quote_create', label: 'Quotes (create)' },
  { value: 'quote_edit', label: 'Quotes (edit)' },
  { value: 'product_create', label: 'Products (create)' },
  { value: 'product_edit', label: 'Products (edit)' },
  { value: 'product_price_change', label: 'Price changes' },
  { value: 'set_create', label: 'Sets (create)' },
  { value: 'set_edit', label: 'Sets (edit)' },
  { value: 'price_label_print', label: 'Price label print/export' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'inventory_adjustment', label: 'Inventory adjustments' },
];

function formatDateTime(value) {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  } catch {
    return value;
  }
}

export default function UserActivityLog() {
  const user = getCurrentUser();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');

  useEffect(() => {
    if (!canViewUserActivity(user)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await fetchUserActivityLog({ limit: 300 });
        if (!cancelled) {
          setActivities(Array.isArray(payload.activities) ? payload.activities : []);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load activity log');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const loadActivities = async ({ showSpinner = true } = {}) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const payload = await fetchUserActivityLog({ limit: 300 });
      setActivities(Array.isArray(payload.activities) ? payload.activities : []);
    } catch (err) {
      setError(err?.message || 'Failed to load activity log');
    } finally {
      if (showSpinner) setLoading(false);
      else setRefreshing(false);
    }
  };

  const handleClearLog = async () => {
    if (!window.confirm('Clear all activity log entries? This cannot be undone.')) return;
    setClearing(true);
    setError('');
    try {
      await clearUserActivityLog();
      setActivities([]);
      setSearch('');
      setSelectedUser('all');
      setSelectedAction('all');
    } catch (err) {
      setError(err?.message || 'Failed to clear activity log');
    } finally {
      setClearing(false);
    }
  };

  const userOptions = useMemo(() => {
    const map = new Map();
    activities.forEach((entry) => {
      const key = String(entry.userKey || 'unknown');
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: `${entry.userName || 'Unknown User'}${entry.userEmail ? ` (${entry.userEmail})` : ''}`,
        });
      }
    });
    return [{ value: 'all', label: 'All users' }, ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))];
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activities.filter((entry) => {
      if (selectedUser !== 'all' && String(entry.userKey || '') !== selectedUser) return false;
      if (selectedAction !== 'all' && String(entry.actionType || '') !== selectedAction) return false;
      if (!query) return true;
      const haystack = [
        entry.userKey,
        entry.userName,
        entry.userEmail,
        entry.actionLabel,
        entry.actionType,
        entry.details,
        entry.reference,
        entry.route,
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    });
  }, [activities, search, selectedUser, selectedAction]);

  const groupedCounts = useMemo(() => {
    const counts = new Map();
    filteredActivities.forEach((entry) => {
      const key = String(entry.userKey || 'unknown');
      const current = counts.get(key) || {
        userKey: key,
        userName: entry.userName || 'Unknown User',
        userEmail: entry.userEmail || null,
        count: 0,
      };
      current.count += 1;
      counts.set(key, current);
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [filteredActivities]);

  const hasLegacyRows = useMemo(
    () => activities.some((entry) => /^(sale|transfer|adjust)-/.test(String(entry.id || ''))),
    [activities],
  );

  if (!canViewUserActivity(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="user-activity-page">
      <div className="user-activity-shell">
        <section className="user-activity-panel user-activity-panel--header">
          <div className="user-activity-header-row">
            <div>
              <h1 className="user-activity-title">User Activity Log</h1>
              <p className="user-activity-subtitle">
                Reads only from the user_activity_log table. New actions are logged with the signed-in user&apos;s name.
              </p>
            </div>
            <div className="user-activity-header-actions">
              <div className="user-activity-count">{filteredActivities.length} entries</div>
              <button
                type="button"
                className="user-activity-refresh-btn"
                onClick={() => loadActivities({ showSpinner: false })}
                disabled={loading || refreshing || clearing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                type="button"
                className="user-activity-clear-btn"
                onClick={handleClearLog}
                disabled={clearing || loading}
              >
                {clearing ? 'Clearing...' : 'Clear log'}
              </button>
            </div>
          </div>
          {hasLegacyRows && (
            <p className="user-activity-legacy-warning">
              Stale legacy data is still being served by the API (sales/transfers). Deploy the latest app build, then click Refresh.
            </p>
          )}
        </section>

        <section className="user-activity-panel">
          <div className="user-activity-filters">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search user, action, receipt, product..."
              className="user-activity-input"
            />
            <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} className="user-activity-select">
              {userOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={selectedAction} onChange={(event) => setSelectedAction(event.target.value)} className="user-activity-select">
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          {groupedCounts.length > 0 && (
            <div className="user-activity-summary-grid">
              {groupedCounts.slice(0, 8).map((entry) => (
                <div key={entry.userKey} className="user-activity-summary-card">
                  <div className="user-activity-summary-name">{entry.userName}</div>
                  {entry.userEmail && <div className="user-activity-summary-email">{entry.userEmail}</div>}
                  <div className="user-activity-summary-count">{entry.count}</div>
                  <div className="user-activity-summary-label">matching actions</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="user-activity-panel user-activity-panel--table">
          {loading ? (
            <div className="user-activity-message">Loading activity log...</div>
          ) : error ? (
            <div className="user-activity-message user-activity-message--error">{error}</div>
          ) : filteredActivities.length === 0 ? (
            <div className="user-activity-message">
              {activities.length === 0 && !search && selectedUser === 'all' && selectedAction === 'all'
                ? 'No activity logged yet. Actions will appear here as users work in the app.'
                : 'No activity matched the current filters.'}
            </div>
          ) : (
            <div className="user-activity-table-wrap">
              <table className="user-activity-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.timestamp)}</td>
                      <td>
                        <div className="user-activity-user-name">{entry.userName || '-'}</div>
                        {entry.userEmail && <div className="user-activity-user-email">{entry.userEmail}</div>}
                      </td>
                      <td>{entry.actionLabel}</td>
                      <td>{entry.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
