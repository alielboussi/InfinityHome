import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import {
  buildMobileScreenAccessRow,
  defaultMobileAccessGrant,
  DELIVERY_APP_SCREENS,
  isWorkshopOrDeliveryScreenAllowed,
  sanitizeMobileAccessGrantForUser,
} from '../mobile/mobileAccessManifest';

const DELIVERY_APP_NAME = 'Delivery';

async function saveDeliveryAppAccess(uid, mobile_access, mobile_display_name) {
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
  return sanitizeMobileAccessGrantForUser(raw || defaultMobileAccessGrant(), '');
}

/** Delivery app uses warehouse_delivery_app + delivery_* screens — clear legacy Kitwe flags on save. */
function grantForDeliverySave(grant) {
  const anyAllowed = DELIVERY_APP_SCREENS.some((s) => grant.screens?.[s.id]?.view === 'allow');
  return {
    ...grant,
    warehouse_delivery_app: anyAllowed ? 'allow' : 'deny',
    warehouse_production_kitwe: 'deny',
    screens: {
      ...(grant.screens || {}),
      kitwe_send_delivery: buildMobileScreenAccessRow(anyAllowed),
    },
  };
}

export default function DeliveryUserAccessEditor({ userRow, onClose, onSaved }) {
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
    setGrant((prev) => {
      const nextScreens = {
        ...(prev.screens || {}),
        [screenId]: buildMobileScreenAccessRow(allowed),
      };
      const anyAllowed = DELIVERY_APP_SCREENS.some((s) => nextScreens[s.id]?.view === 'allow');
      return {
        ...prev,
        warehouse_delivery_app: anyAllowed ? 'allow' : 'deny',
        screens: nextScreens,
      };
    });
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = sanitizeMobileAccessGrantForUser(
        grantForDeliverySave(grant),
        userRow.email,
      );
      const updated = await saveDeliveryAppAccess(
        userRow.id,
        payload,
        appDisplayName,
      );
      onSaved?.(updated);
      setGrant(normalizeGrant(updated?.mobile_access));
      setToast(`${DELIVERY_APP_NAME} access saved.`);
    } catch (err) {
      setError(err?.message || 'Failed to save delivery access');
    } finally {
      setBusy(false);
    }
  };

  if (!userRow) return null;

  const displayName = userRow.display_name || userRow.email || 'User';

  return (
    <div className="mobile-access-panel" role="dialog" aria-labelledby="delivery-access-title">
      <div className="mobile-access-panel__head">
        <div>
          <h3 id="delivery-access-title" className="mobile-access-panel__title">
            {DELIVERY_APP_NAME} — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            Users always open the <strong>Delivery</strong> dashboard first. <strong>Yes</strong> enables that page on
            the app; <strong>No</strong> hides it.
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
      {toast ? <div className="report-success mobile-access-panel__error">{toast}</div> : null}

      <div className="mobile-access-panel__section">
        <label className="mobile-access-name-label" htmlFor="delivery-app-display-name">
          Name in app
        </label>
        <input
          id="delivery-app-display-name"
          type="text"
          className="mobile-access-name-input"
          placeholder="Shown on delivery app dashboard"
          value={appDisplayName}
          onChange={(e) => setAppDisplayName(e.target.value)}
        />
      </div>

      <div className="mobile-access-panel__section">
        <table className="mobile-access-matrix mobile-access-matrix--yesno">
          <thead>
            <tr>
              <th className="mobile-access-matrix__screen-col">Page</th>
              <th className="mobile-access-matrix__access-col">Access</th>
            </tr>
          </thead>
          <tbody>
            {DELIVERY_APP_SCREENS.map((screen) => {
              const allowed = isWorkshopOrDeliveryScreenAllowed(
                grant,
                screen.id,
                'warehouse_delivery_app',
              );
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
    </div>
  );
}
