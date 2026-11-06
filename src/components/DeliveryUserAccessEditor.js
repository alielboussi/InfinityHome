import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import {
  buildMobileScreenAccessRow,
  defaultMobileAccessGrant,
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
  const base = defaultMobileAccessGrant();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    warehouse_delivery_app: raw.warehouse_delivery_app === 'allow' ? 'allow' : 'deny',
  };
}

/** Delivery app uses warehouse_delivery_app only — clear legacy Kitwe flags on save. */
function grantForDeliverySave(grant) {
  return {
    ...grant,
    warehouse_production_kitwe: 'deny',
    screens: {
      ...(grant.screens || {}),
      kitwe_send_delivery: buildMobileScreenAccessRow(false),
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
  const deliveryChecked = grant.warehouse_delivery_app === 'allow';

  return (
    <div className="mobile-access-panel" role="dialog" aria-labelledby="delivery-access-title">
      <div className="mobile-access-panel__head">
        <div>
          <h3 id="delivery-access-title" className="mobile-access-panel__title">
            {DELIVERY_APP_NAME} app — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            Allows the <strong>Warehouse Delivery</strong> Android app: scan products, driver signature, and submit
            factory truck deliveries. User must sign in with <strong>Google on the app</strong> first; then enable
            login (Users table) and turn on delivery access here.
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

      <div className="mobile-access-panel__section mobile-access-panel__section--permissions">
        <h4 className="mobile-access-panel__section-label">Delivery app</h4>
        <div className="mobile-access-permission-list">
          <div className="mobile-access-permission-item">
            <label className="mobile-access-permission-item__body" htmlFor="mobile-access-delivery-app">
              <span className="mobile-access-permission-item__title">Warehouse Delivery (Android)</span>
              <span className="mobile-access-permission-item__desc">
                Kitwe truck send, sent deliveries list, and delivery note print. Off by default until enabled here.
              </span>
            </label>
            <select
              id="mobile-access-delivery-app"
              className="mobile-access-yesno"
              value={deliveryChecked ? 'yes' : 'no'}
              onChange={(e) => setGrant((prev) => ({
                ...prev,
                warehouse_delivery_app: e.target.value === 'yes' ? 'allow' : 'deny',
              }))}
              aria-label="Warehouse Delivery (Android)"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>
      </div>

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
    </div>
  );
}
