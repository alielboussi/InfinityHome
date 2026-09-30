import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import {
  buildMobileScreenAccessRow,
  defaultMobileAccessGrant,
  getMobilePermissionMatrixScreens,
  isMobileScreenAccessAllowed,
  sanitizeMobileAccessGrantForUser,
} from '../mobile/mobileAccessManifest';

async function saveMobileAccess(uid, mobile_access, mobile_display_name, login_enabled) {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/login-access'), {
    method: 'POST',
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      uid,
      login_enabled: login_enabled !== false,
      mobile_access,
      mobile_display_name,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Save failed (${response.status})`);
  }
  return payload.user;
}

function normalizeGrant(raw) {
  const base = defaultMobileAccessGrant();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    landing_screen: base.landing_screen,
    screens: { ...base.screens, ...(raw.screens || {}) },
  };
}

export default function MobileUserAccessEditor({ userRow, onClose, onSaved }) {
  const [grant, setGrant] = useState(() => normalizeGrant(userRow?.mobile_access));
  const [appDisplayName, setAppDisplayName] = useState(() => userRow?.mobile_display_name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setGrant(normalizeGrant(userRow?.mobile_access));
    setAppDisplayName(userRow?.mobile_display_name || '');
    setError('');
    setToast('');
  }, [userRow?.id, userRow?.mobile_access, userRow?.mobile_display_name]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const setScreenAccess = (screenId, allowed) => {
    setGrant((prev) => ({
      ...prev,
      screens: {
        ...prev.screens,
        [screenId]: buildMobileScreenAccessRow(allowed),
      },
    }));
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = sanitizeMobileAccessGrantForUser(grant, userRow.email);
      const updated = await saveMobileAccess(
        userRow.id,
        payload,
        appDisplayName,
        userRow.login_enabled,
      );
      onSaved?.(updated);
      setToast('Warehouse Catalog access saved.');
    } catch (err) {
      setError(err?.message || 'Failed to save mobile access');
    } finally {
      setBusy(false);
    }
  };

  if (!userRow) return null;

  const displayName = userRow.display_name || userRow.email || 'User';
  const matrixScreens = getMobilePermissionMatrixScreens(userRow.email);

  return (
    <div className="mobile-access-panel" role="dialog" aria-labelledby="mobile-access-title">
      <div className="mobile-access-panel__head">
        <div>
          <h3 id="mobile-access-title" className="mobile-access-panel__title">
            Warehouse Catalog — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            Users always open the <strong>dashboard</strong> first. <strong>Yes</strong> adds a button for that screen;
            <strong> No</strong> blocks it entirely.
          </p>
        </div>
        <div className="mobile-access-panel__head-actions">
          <button
            type="button"
            className="product-form-btn product-form-btn--primary"
            disabled={busy}
            onClick={handleSave}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="report-link mobile-access-panel__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {error ? <div className="report-error mobile-access-panel__error">{error}</div> : null}

      <div className="mobile-access-panel__section">
        <label className="mobile-access-name-label" htmlFor="mobile-app-display-name">
          Name in app
        </label>
        <input
          id="mobile-app-display-name"
          type="text"
          className="mobile-access-name-input"
          placeholder="Shown on warehouse app dashboard (e.g. Ali)"
          value={appDisplayName}
          onChange={(e) => setAppDisplayName(e.target.value)}
        />
        <p className="mobile-access-panel__hint" style={{ marginTop: 8, marginBottom: 0 }}>
          This name appears on the mobile sign-in dashboard instead of the email address.
        </p>
      </div>

      {matrixScreens.length > 0 ? (
        <div className="mobile-access-panel__section">
          <table className="mobile-access-matrix mobile-access-matrix--yesno">
            <thead>
              <tr>
                <th className="mobile-access-matrix__screen-col">Screen</th>
                <th className="mobile-access-matrix__access-col">Access</th>
              </tr>
            </thead>
            <tbody>
              {matrixScreens.map((screen) => {
                const allowed = isMobileScreenAccessAllowed(grant, screen.id);
                return (
                  <tr key={screen.id}>
                    <td className="mobile-access-matrix__screen-col" title={screen.description}>
                      {screen.label}
                    </td>
                    <td className="mobile-access-matrix__access-col">
                      <select
                        className="mobile-access-yesno"
                        value={allowed ? 'yes' : 'no'}
                        onChange={(e) => setScreenAccess(screen.id, e.target.value === 'yes')}
                        aria-label={`${screen.label} access`}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {toast ? (
        <div className="stock-periods-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
