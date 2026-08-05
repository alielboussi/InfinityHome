import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canManageLoginAccess, getCurrentUser } from './accessControl';
import { firebaseGetAccessToken } from './utils/firebaseAuthApi';

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
  const response = await fetch('/api/login-access', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
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
  const response = await fetch('/api/login-access', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid, login_enabled: loginEnabled }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Update failed (${response.status})`);
  }
  return payload.user;
}

export default function UserAccessManagement() {
  const user = getCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUid, setBusyUid] = useState('');

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
    if (!canManageLoginAccess(user)) return;
    load();
  }, [user, load]);

  if (!canManageLoginAccess(user)) {
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

  return (
    <div className="report-page" style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px 32px' }}>
      <div className="page-header-row">
        <h2 style={{ margin: 0 }}>User Login Access</h2>
      </div>
      <p className="meta-label" style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
        Enable or disable Firebase sign-in across the portal and mobile apps. Users appear here after their first successful sign-in.
      </p>

      {error ? <div className="report-error" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div className="report-section">
        <div className="report-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Active users</span>
          <button type="button" className="report-link" onClick={load} disabled={loading}>Refresh</button>
        </div>

        {loading ? (
          <div className="report-blank">Loading users…</div>
        ) : rows.length === 0 ? (
          <div className="report-blank">No users have signed in yet.</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last seen</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const enabled = row.login_enabled !== false;
                const isBusy = busyUid === row.id;
                return (
                  <tr key={row.id}>
                    <td>{row.display_name || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td>
                      <span style={{ color: enabled ? '#2e7d32' : '#c62828', fontWeight: 700 }}>
                        {enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>{formatDateTime(row.last_seen_at || row.updated_at || row.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="report-link"
                        disabled={isBusy}
                        onClick={() => toggleUser(row)}
                      >
                        {isBusy ? 'Saving…' : (enabled ? 'Disable login' : 'Enable login')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
