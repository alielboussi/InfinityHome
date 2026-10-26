import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { defaultMobileAccessGrant } from '../mobile/mobileAccessManifest';

const PRODUCTION_APP_NAME = 'Upholstery Production';

async function saveProductionAppAccess(uid, warehouse_production_app, mobile_display_name) {
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
      action: 'set-production-app-access',
      uid,
      warehouse_production_app,
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
    warehouse_production_app: raw.warehouse_production_app === 'allow' ? 'allow' : 'deny',
    screens: { ...base.screens, ...(raw.screens || {}) },
  };
}

export default function ProductionUserAccessEditor({ userRow, onClose, onSaved }) {
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
      const updated = await saveProductionAppAccess(
        userRow.id,
        grant.warehouse_production_app,
        appDisplayName,
      );
      onSaved?.(updated);
      setToast(`${PRODUCTION_APP_NAME} access saved.`);
    } catch (err) {
      setError(err?.message || 'Failed to save production access');
    } finally {
      setBusy(false);
    }
  };

  if (!userRow) return null;

  const displayName = userRow.display_name || userRow.email || 'User';

  return (
    <div className="mobile-access-panel" role="dialog" aria-labelledby="production-access-title">
      <div className="mobile-access-panel__head">
        <div>
          <h3 id="production-access-title" className="mobile-access-panel__title">
            {PRODUCTION_APP_NAME} app — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            Allows the <strong>Upholstery Production</strong> Android app: create packets, add stock, and print labels via Zebra Weblink.
            User must sign in with <strong>Google on the app</strong> first (then enable login and app access here).
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
        <h4 className="mobile-access-panel__section-label">Production app</h4>
        <div className="mobile-access-permission-list">
          <div className="mobile-access-permission-item">
            <input
              id="mobile-access-production-app"
              type="checkbox"
              className="mobile-access-permission-item__check"
              checked={grant.warehouse_production_app === 'allow'}
              onChange={(e) => setGrant((prev) => ({
                ...prev,
                warehouse_production_app: e.target.checked ? 'allow' : 'deny',
              }))}
            />
            <label className="mobile-access-permission-item__body" htmlFor="mobile-access-production-app">
              <span className="mobile-access-permission-item__title">Upholstery Production (Android)</span>
              <span className="mobile-access-permission-item__desc">
                Create seating items and stock-in at the warehouse. Activity appears on Production Report.
                Labels print via Zebra cloud Weblink.
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="mobile-access-panel__section">
        <label className="mobile-access-name-label" htmlFor="production-app-display-name">
          Name in app
        </label>
        <input
          id="production-app-display-name"
          type="text"
          className="mobile-access-name-input"
          placeholder="Shown on production app dashboard"
          value={appDisplayName}
          onChange={(e) => setAppDisplayName(e.target.value)}
        />
      </div>
    </div>
  );
}
