import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canViewUserActivity, getCurrentUser } from './accessControl';
import { fetchUserActivityLog, clearUserActivityLog } from './utils/userActivityLog';

const DEFAULT_VISIBLE = 5;
const FETCH_LIMIT = 250;

const actionOptions = [
  { value: 'all', label: 'All actions' },
  { value: 'navigation', label: 'Page / navigation' },
  { value: 'sale', label: 'Sales / POS' },
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
  { value: 'stocktake', label: 'Stocktake' },
];

const searchFieldOptions = [
  { value: 'all', label: 'Search everything' },
  { value: 'action', label: 'Action' },
  { value: 'page', label: 'Page / route' },
  { value: 'user', label: 'User' },
  { value: 'endpoint', label: 'Endpoint' },
  { value: 'receipt', label: 'Receipt #' },
  { value: 'customer', label: 'Customer name' },
  { value: 'product', label: 'Product' },
  { value: 'set', label: 'Set' },
  { value: 'layby', label: 'Layby' },
  { value: 'pos', label: 'POS / sale' },
  { value: 'transfer', label: 'Transfer' },
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/** Prefer email as stable group key so the same person is not split across UUID vs email keys. */
function stableUserKey(entry) {
  const email = normalizeEmail(entry?.userEmail);
  if (email) return `email:${email}`;
  return String(entry?.userKey || entry?.userUid || 'unknown');
}

function flattenMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  try {
    return JSON.stringify(metadata).toLowerCase();
  } catch {
    return '';
  }
}

function entryHaystack(entry) {
  return {
    action: [
      entry.actionLabel,
      entry.actionType,
      entry.details,
    ].join(' ').toLowerCase(),
    page: [
      entry.route,
      entry.details,
      entry.reference,
    ].join(' ').toLowerCase(),
    user: [
      entry.userName,
      entry.userEmail,
      entry.userKey,
    ].join(' ').toLowerCase(),
    endpoint: [
      entry.route,
      entry.reference,
      entry.entityType,
      entry.entityId,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    receipt: [
      entry.reference,
      entry.details,
      entry.entityId,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    customer: [
      entry.details,
      entry.reference,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    product: [
      entry.details,
      entry.reference,
      entry.entityType,
      entry.actionLabel,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    set: [
      entry.details,
      entry.reference,
      entry.actionType,
      entry.actionLabel,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    layby: [
      entry.details,
      entry.reference,
      entry.actionType,
      entry.actionLabel,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    pos: [
      entry.details,
      entry.reference,
      entry.actionType,
      entry.route,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    transfer: [
      entry.details,
      entry.reference,
      entry.actionType,
      entry.actionLabel,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
    all: [
      entry.userKey,
      entry.userName,
      entry.userEmail,
      entry.actionLabel,
      entry.actionType,
      entry.details,
      entry.reference,
      entry.route,
      entry.entityType,
      entry.entityId,
      flattenMetadata(entry.metadata),
    ].join(' ').toLowerCase(),
  };
}

function matchesActionFilter(entry, selectedAction) {
  if (selectedAction === 'all') return true;
  const type = String(entry.actionType || '').toLowerCase();
  if (selectedAction === 'stocktake') return type.startsWith('stocktake');
  if (selectedAction === 'sale') {
    return type === 'sale' || type.includes('pos') || type.includes('sale');
  }
  if (selectedAction === 'transfer') {
    return type === 'transfer' || type.includes('transfer');
  }
  if (selectedAction === 'layby') {
    return type === 'layby' || type.includes('layby');
  }
  return type === selectedAction;
}

function ActivityRows({ rows }) {
  if (!rows.length) {
    return <div className="user-activity-message">No actions in this group.</div>;
  }
  return (
    <div className="user-activity-table-wrap">
      <table className="user-activity-table">
        <thead>
          <tr>
            <th>When</th>
            <th>User</th>
            <th>Action</th>
            <th>Page</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDateTime(entry.timestamp)}</td>
              <td>
                <div className="user-activity-user-name">{entry.userName || '-'}</div>
                {entry.userEmail && <div className="user-activity-user-email">{entry.userEmail}</div>}
              </td>
              <td>{entry.actionLabel}</td>
              <td className="user-activity-route-cell">{entry.route || entry.reference || '-'}</td>
              <td>{entry.details || entry.reference || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UserActivityLog() {
  const viewer = getCurrentUser();
  const viewerEmail = normalizeEmail(viewer?.email);
  const canView = canViewUserActivity(viewer);

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [showAllMatching, setShowAllMatching] = useState(false);

  const loadActivities = useCallback(async ({ showSpinner = true } = {}) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const payload = await fetchUserActivityLog({ limit: FETCH_LIMIT });
      setActivities(Array.isArray(payload.activities) ? payload.activities : []);
    } catch (err) {
      setError(err?.message || 'Failed to load activity log');
    } finally {
      if (showSpinner) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await fetchUserActivityLog({ limit: FETCH_LIMIT });
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
  }, [canView, viewerEmail]);

  const handleClearLog = async () => {
    if (!window.confirm('Clear all activity log entries? This cannot be undone.')) return;
    setClearing(true);
    setError('');
    try {
      await clearUserActivityLog();
      setActivities([]);
      setSearch('');
      setSearchField('all');
      setSelectedUser('all');
      setSelectedAction('all');
      setShowAllMatching(false);
    } catch (err) {
      setError(err?.message || 'Failed to clear activity log');
    } finally {
      setClearing(false);
    }
  };

  const userOptions = useMemo(() => {
    const map = new Map();
    activities.forEach((entry) => {
      const key = stableUserKey(entry);
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: `${entry.userName || 'Unknown User'}${entry.userEmail ? ` (${entry.userEmail})` : ''}`,
        });
      }
    });
    return [
      { value: 'all', label: 'All users' },
      ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [activities]);

  const filtersActive = Boolean(
    search.trim()
    || selectedUser !== 'all'
    || selectedAction !== 'all',
  );

  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activities.filter((entry) => {
      if (selectedUser !== 'all' && stableUserKey(entry) !== selectedUser) return false;
      if (!matchesActionFilter(entry, selectedAction)) return false;
      if (!query) return true;
      const fields = entryHaystack(entry);
      const haystack = fields[searchField] || fields.all;
      return haystack.includes(query);
    });
  }, [activities, search, searchField, selectedUser, selectedAction]);

  const latestFive = useMemo(
    () => filteredActivities.slice(0, DEFAULT_VISIBLE),
    [filteredActivities],
  );

  const visibleActivities = useMemo(() => {
    if (showAllMatching || filtersActive) {
      return showAllMatching ? filteredActivities : filteredActivities.slice(0, DEFAULT_VISIBLE);
    }
    return latestFive;
  }, [filteredActivities, latestFive, showAllMatching, filtersActive]);

  const groupedByUser = useMemo(() => {
    const groups = new Map();
    filteredActivities.forEach((entry) => {
      const key = stableUserKey(entry);
      const current = groups.get(key) || {
        userKey: key,
        userName: entry.userName || 'Unknown User',
        userEmail: entry.userEmail || null,
        count: 0,
        latest: [],
      };
      current.count += 1;
      if (current.latest.length < DEFAULT_VISIBLE) {
        current.latest.push(entry);
      }
      if (!current.userEmail && entry.userEmail) current.userEmail = entry.userEmail;
      if (entry.userName && (!current.userName || current.userName === 'Unknown User')) {
        current.userName = entry.userName;
      }
      groups.set(key, current);
    });
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [filteredActivities]);

  if (!canView) {
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
                Latest actions first. Default view shows 5 rows; search filters the full loaded log.
              </p>
            </div>
            <div className="user-activity-header-actions">
              <div className="user-activity-count">
                {filteredActivities.length} match{filteredActivities.length === 1 ? '' : 'es'}
                {activities.length ? ` · ${activities.length} loaded` : ''}
              </div>
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
        </section>

        <section className="user-activity-panel">
          <div className="user-activity-filters user-activity-filters--rich">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShowAllMatching(false);
              }}
              placeholder="Type to search…"
              className="user-activity-input"
            />
            <select
              value={searchField}
              onChange={(event) => {
                setSearchField(event.target.value);
                setShowAllMatching(false);
              }}
              className="user-activity-select"
              aria-label="Search field"
            >
              {searchFieldOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={selectedUser}
              onChange={(event) => {
                setSelectedUser(event.target.value);
                setShowAllMatching(false);
              }}
              className="user-activity-select"
            >
              {userOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={selectedAction}
              onChange={(event) => {
                setSelectedAction(event.target.value);
                setShowAllMatching(false);
              }}
              className="user-activity-select"
            >
              {actionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {groupedByUser.length > 0 && (
            <div className="user-activity-summary-grid">
              {groupedByUser.map((entry) => (
                <button
                  key={entry.userKey}
                  type="button"
                  className={`user-activity-summary-card${selectedUser === entry.userKey ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedUser((prev) => (prev === entry.userKey ? 'all' : entry.userKey));
                    setShowAllMatching(false);
                  }}
                >
                  <div className="user-activity-summary-name">{entry.userName}</div>
                  {entry.userEmail && <div className="user-activity-summary-email">{entry.userEmail}</div>}
                  <div className="user-activity-summary-count">{entry.count}</div>
                  <div className="user-activity-summary-label">matching actions</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="user-activity-panel user-activity-panel--table">
          <div className="user-activity-section-head">
            <h2 className="user-activity-section-title">
              {filtersActive ? 'Matching actions' : 'Latest 5 actions'}
            </h2>
            {filteredActivities.length > DEFAULT_VISIBLE && (
              <button
                type="button"
                className="user-activity-refresh-btn"
                onClick={() => setShowAllMatching((prev) => !prev)}
                disabled={loading}
              >
                {showAllMatching
                  ? 'Show latest 5 only'
                  : `Show all ${filteredActivities.length} matches`}
              </button>
            )}
          </div>
          {loading ? (
            <div className="user-activity-message">Loading activity log...</div>
          ) : error ? (
            <div className="user-activity-message user-activity-message--error">{error}</div>
          ) : filteredActivities.length === 0 ? (
            <div className="user-activity-message">
              {activities.length === 0 && !filtersActive
                ? 'No activity logged yet. Actions will appear here as users work in the app.'
                : 'No activity matched the current filters.'}
            </div>
          ) : (
            <ActivityRows rows={visibleActivities} />
          )}
        </section>

        {!loading && !error && groupedByUser.length > 0 && (
          <section className="user-activity-panel">
            <div className="user-activity-section-head">
              <h2 className="user-activity-section-title">Grouped by user (latest 5 each)</h2>
            </div>
            <div className="user-activity-user-groups">
              {groupedByUser.map((group) => (
                <div key={group.userKey} className="user-activity-user-group">
                  <div className="user-activity-user-group-head">
                    <div>
                      <div className="user-activity-summary-name">{group.userName}</div>
                      {group.userEmail && (
                        <div className="user-activity-summary-email">{group.userEmail}</div>
                      )}
                    </div>
                    <div className="user-activity-count">{group.count} total</div>
                  </div>
                  <ActivityRows rows={group.latest} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
