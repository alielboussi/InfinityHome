import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canManageLoginAccess, getCurrentUser } from './accessControl';
import MobileUserAccessEditor from './components/MobileUserAccessEditor';
import UpholsteryUserAccessEditor from './components/UpholsteryUserAccessEditor';
import DeliveryUserAccessEditor from './components/DeliveryUserAccessEditor';
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

async function postLoginAccess(body) {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/login-access'), {
    method: 'POST',
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Update failed (${response.status})`);
  }
  return payload;
}

async function setUserLoginEnabled(uid, loginEnabled) {
  const payload = await postLoginAccess({ uid, login_enabled: loginEnabled });
  return payload.user;
}

async function setUserDisplayName(uid, displayName, mobileAccess) {
  const payload = await postLoginAccess({
    uid,
    action: 'set-display-name',
    login_access_action: 'set-display-name',
    display_name: displayName,
    ...(mobileAccess && typeof mobileAccess === 'object' ? { mobile_access: mobileAccess } : {}),
  });
  return payload.user;
}

async function deleteUserAccess(uid) {
  return postLoginAccess({
    uid,
    action: 'delete-access',
    login_access_action: 'delete-access',
  });
}

export default function UserAccessManagement() {
  const [sessionUser, setSessionUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [mobileUserId, setMobileUserId] = useState('');
  const [upholsteryUserId, setUpholsteryUserId] = useState('');
  const [upholsteryFocusApp, setUpholsteryFocusApp] = useState('upholstery');
  const [deliveryUserId, setDeliveryUserId] = useState('');
  const [nameDrafts, setNameDrafts] = useState({});
  const [nameSavingUid, setNameSavingUid] = useState('');

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

  const saveName = async (row) => {
    const draft = nameDrafts[row.id];
    const nextName = draft !== undefined ? draft : (row.display_name || '');
    setNameSavingUid(row.id);
    setError('');
    try {
      const updated = await setUserDisplayName(row.id, nextName, row.mobile_access);
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, ...updated } : item)));
      setNameDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setError(err?.message || 'Failed to save name.');
    } finally {
      setNameSavingUid('');
    }
  };

  const removeUser = async (row) => {
    const label = row.display_name || row.email || row.id;
    const ok = window.confirm(
      `Remove login access for ${label}?\n\nThey will not be able to sign in on the portal or any mobile app. This cannot be undone from this page.`,
    );
    if (!ok) return;
    setBusyUid(row.id);
    setError('');
    try {
      await deleteUserAccess(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (mobileUserId === row.id) setMobileUserId('');
      if (upholsteryUserId === row.id) setUpholsteryUserId('');
      if (deliveryUserId === row.id) setDeliveryUserId('');
    } catch (err) {
      setError(err?.message || 'Failed to remove user.');
    } finally {
      setBusyUid('');
    }
  };

  const mobileUser = rows.find((r) => r.id === mobileUserId) || null;
  const upholsteryUser = rows.find((r) => r.id === upholsteryUserId) || null;
  const deliveryUser = rows.find((r) => r.id === deliveryUserId) || null;

  const clearOtherEditors = (keep) => {
    if (keep !== 'warehouse') setMobileUserId('');
    if (keep !== 'upholstery') setUpholsteryUserId('');
    if (keep !== 'delivery') setDeliveryUserId('');
  };

  return (
    <div className="report-page user-access-page">
      <div className="page-header-row">
        <h2 style={{ margin: 0 }}>User Login Access</h2>
      </div>
      <p className="user-access-intro">
        New mobile users are added when they sign in with <strong>Google</strong> on a warehouse mobile app. They appear
        in the list below after first sign-in — use <strong>Refresh</strong>, then set the{' '}
        <strong>Name</strong> column manually if needed, and set <strong>Catalog</strong>, <strong>Upholstery</strong>,{' '}
        <strong>Carpentry</strong>, <strong>Painting</strong>, <strong>Delivery</strong>, or <strong>Orders</strong>{' '}
        permissions. <strong>Disable</strong> blocks sign-in until re-enabled. <strong>Remove</strong> permanently
        blocks that email on the portal and all mobile apps.
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
          <div className="report-blank">
            No mobile users yet. Ask staff to open a mobile app and tap <strong>Continue with Google</strong>,
            then refresh this page.
          </div>
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
                  const isNameSaving = nameSavingUid === row.id;
                  const nameValue = nameDrafts[row.id] !== undefined
                    ? nameDrafts[row.id]
                    : (row.display_name || '');
                  const nameDirty = nameDrafts[row.id] !== undefined
                    && String(nameDrafts[row.id] || '').trim() !== String(row.display_name || '').trim();
                  const isWarehouseSelected = mobileUserId === row.id;
                  const isUpholsterySelected = upholsteryUserId === row.id;
                  const isDeliverySelected = deliveryUserId === row.id;
                  const selectedAppEditor = isWarehouseSelected
                    ? 'catalog'
                    : isUpholsterySelected
                      ? upholsteryFocusApp
                      : isDeliverySelected
                        ? 'delivery'
                        : '';
                  return (
                    <tr key={row.id} className={selectedAppEditor ? 'user-access-table__row--active' : ''}>
                      <td className="user-access-table__name">
                        <div className="user-access-name-edit">
                          <input
                            type="text"
                            className="user-access-name-input"
                            value={nameValue}
                            placeholder="Set name…"
                            aria-label={`Portal name for ${row.email || 'user'}`}
                            disabled={isBusy || isNameSaving}
                            onChange={(e) => {
                              setNameDrafts((prev) => ({ ...prev, [row.id]: e.target.value }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveName(row);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="user-access-btn user-access-btn--ghost user-access-name-save"
                            disabled={isBusy || isNameSaving || !nameDirty}
                            title={nameDirty ? 'Save name' : 'Name saved — Google profile will not overwrite while set'}
                            onClick={() => saveName(row)}
                          >
                            {isNameSaving ? '…' : 'Save'}
                          </button>
                        </div>
                      </td>
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
                          <select
                            className={`user-access-app-select ${selectedAppEditor ? 'user-access-app-select--active' : ''}`}
                            value={selectedAppEditor}
                            aria-label={`Mobile app permissions for ${row.display_name || row.email || 'user'}`}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === 'catalog') {
                                clearOtherEditors('warehouse');
                                setMobileUserId(row.id);
                              } else if (next === 'upholstery' || next === 'carpentry' || next === 'painting' || next === 'orders') {
                                clearOtherEditors('upholstery');
                                setUpholsteryFocusApp(next);
                                setUpholsteryUserId(row.id);
                              } else if (next === 'delivery') {
                                clearOtherEditors('delivery');
                                setDeliveryUserId(row.id);
                              } else {
                                clearOtherEditors('');
                              }
                            }}
                          >
                            <option value="">Apps…</option>
                            <option value="catalog">Catalog</option>
                            <option value="upholstery">Upholstery</option>
                            <option value="carpentry">Carpentry</option>
                            <option value="painting">Painting</option>
                            <option value="delivery">Delivery</option>
                            <option value="orders">Orders</option>
                          </select>
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
                            className="user-access-btn user-access-btn--danger"
                            disabled={isBusy}
                            onClick={() => removeUser(row)}
                          >
                            {isBusy ? '…' : 'Remove'}
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

      {upholsteryUser ? (
        <UpholsteryUserAccessEditor
          userRow={upholsteryUser}
          focusApp={upholsteryFocusApp}
          onClose={() => setUpholsteryUserId('')}
          onSaved={(updated) => {
            setRows((prev) => prev.map((item) => (
              item.id === upholsteryUser.id ? { ...item, ...updated } : item
            )));
          }}
        />
      ) : null}

      {deliveryUser ? (
        <DeliveryUserAccessEditor
          userRow={deliveryUser}
          onClose={() => setDeliveryUserId('')}
          onSaved={(updated) => {
            setRows((prev) => prev.map((item) => (
              item.id === deliveryUser.id ? { ...item, ...updated } : item
            )));
          }}
        />
      ) : null}
    </div>
  );
}
