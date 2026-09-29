import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canManageLoginAccess, getCurrentUser } from './accessControl';
import MobileUserAccessEditor from './components/MobileUserAccessEditor';
import { firebaseGetAccessToken } from './utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from './utils/apiUrl';

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  } catch {
    return value;
  }
}

async function fetchLoginAccessUsers() {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/login-access'), {
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload.users || [];
}

async function setUserLoginEnabled(uid, loginEnabled) {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/login-access'), {
    method: 'POST',
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ uid, login_enabled: loginEnabled }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Update failed (${response.status})`);
  }
  return payload.user;
}

export default function UserAccessManagement() {
  const [sessionUser, setSessionUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [mobileUserId, setMobileUserId] = useState('');

  useEffect(() => {
    setSessionUser(getCurrentUser());
    setAuthReady(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const users = await fetchLoginAccessUsers();
      setRows(users);
    } catch (err) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !canManageLoginAccess(sessionUser)) return;
    load();
  }, [authReady, sessionUser, load]);

  if (!authReady) {
    return (
      <div className="report-page user-access-page">
        <div className="report-blank">Loading…</div>
      </div>
    );
  }

  if (!canManageLoginAccess(sessionUser)) {
    return <Navigate to="/dashboard" replace />;
  }

  const toggleUser = async (row) => {
    const nextEnabled = row.login_enabled === false;
    setBusyUid(row.id);
    setError('');
    try {
      const updated = await setUserLoginEnabled(row.id, nextEnabled);
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, ...updated } : item)));
    } catch (err) {
      setError(err?.message || 'Failed to update user.');
    } finally {
      setBusyUid('');
    }
  };

  const mobileUser = rows.find((r) => r.id === mobileUserId) || null;

  return (
    <div className="report-page user-access-page">
      <div className="page-header-row">
        <h2 style={{ margin: 0 }}>User Login Access</h2>
      </div>
      <p className="user-access-intro">
        Enable or disable sign-in for the portal and mobile apps. Pick a user, then configure Warehouse Catalog permissions in the panel below.
      </p>

      {error ? <div className="report-error user-access-error">{error}</div> : null}

      <div className="report-section user-access-card">
        <div className="user-access-card__head">
          <span className="report-section-title">Users</span>
          <button type="button" className="report-link" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="report-blank">Loading users…</div>
        ) : rows.length === 0 ? (
          <div className="report-blank">No users have signed in yet.</div>
        ) : (
          <div className="user-access-table-wrap">
            <table className="report-table user-access-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Name in app</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th className="user-access-table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const enabled = row.login_enabled !== false;
                  const isBusy = busyUid === row.id;
                  const isSelected = mobileUserId === row.id;
                  return (
                    <tr key={row.id} className={isSelected ? 'user-access-table__row--active' : ''}>
                      <td>{row.display_name || '—'}</td>
                      <td>{row.mobile_display_name || '—'}</td>
                      <td>{row.email || '—'}</td>
                      <td>
                        <span className={enabled ? 'user-access-status user-access-status--on' : 'user-access-status user-access-status--off'}>
                          {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="user-access-table__date">{formatDateTime(row.last_seen_at || row.updated_at || row.created_at)}</td>
                      <td className="user-access-table__actions-col">
                        <div className="user-access-row-actions">
                          <button
                            type="button"
                            className="user-access-btn user-access-btn--ghost"
                            disabled={isBusy}
                            onClick={() => toggleUser(row)}
                          >
                            {isBusy ? '…' : (enabled ? 'Disable' : 'Enable')}
                          </button>
                          <button
                            type="button"
                            className={`user-access-btn ${isSelected ? 'user-access-btn--active' : ''}`}
                            onClick={() => setMobileUserId(isSelected ? '' : row.id)}
                          >
                            {isSelected ? 'Editing app' : 'Warehouse app'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mobileUser ? (
        <MobileUserAccessEditor
          userRow={mobileUser}
          onClose={() => setMobileUserId('')}
          onSaved={(updated) => {
            setRows((prev) => prev.map((item) => (
              item.id === mobileUser.id ? { ...item, ...updated } : item
            )));
          }}
        />
      ) : null}
    </div>
  );
}
