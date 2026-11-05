import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import {
  defaultMobileAccessGrant,
  sanitizeMobileAccessGrantForUser,
} from '../mobile/mobileAccessManifest';

const UPHOLSTERY_APP_NAME = 'Production workshop apps';

async function saveUpholsteryAppAccess(uid, mobile_access, mobile_display_name) {
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
  const allowDeny = (v) => (v === 'allow' ? 'allow' : 'deny');
  return {
    ...base,
    ...raw,
    warehouse_production_app: allowDeny(raw.warehouse_production_app),
    warehouse_production_photo_upload: allowDeny(raw.warehouse_production_photo_upload),
    carpentry_workshop_app: allowDeny(raw.carpentry_workshop_app),
    painting_workshop_app: allowDeny(raw.painting_workshop_app),
  };
}

function AccessSelect({ id, label, description, value, onChange }) {
  return (
    <div className="mobile-access-permission-item">
      <label className="mobile-access-permission-item__body" htmlFor={id}>
        <span className="mobile-access-permission-item__title">{label}</span>
        <span className="mobile-access-permission-item__desc">{description}</span>
      </label>
      <select
        id={id}
        className="mobile-access-yesno"
        value={value === 'allow' ? 'yes' : 'no'}
        onChange={(e) => onChange(e.target.value === 'yes' ? 'allow' : 'deny')}
        aria-label={label}
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    </div>
  );
}

export default function UpholsteryUserAccessEditor({ userRow, onClose, onSaved }) {
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
      const payload = sanitizeMobileAccessGrantForUser(grant, userRow.email);
      const updated = await saveUpholsteryAppAccess(
        userRow.id,
        payload,
        appDisplayName,
      );
      onSaved?.(updated);
      setGrant(normalizeGrant(updated?.mobile_access));
      setToast(`${UPHOLSTERY_APP_NAME} access saved.`);
    } catch (err) {
      setError(err?.message || 'Failed to save workshop app access');
    } finally {
      setBusy(false);
    }
  };

  if (!userRow) return null;

  const displayName = userRow.display_name || userRow.email || 'User';

  return (
    <div className="mobile-access-panel" role="dialog" aria-labelledby="upholstery-access-title">
      <div className="mobile-access-panel__head">
        <div>
          <h3 id="upholstery-access-title" className="mobile-access-panel__title">
            {UPHOLSTERY_APP_NAME} — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            Upholstery, Carpentry, and Painting Android apps — use <strong>Yes</strong> / <strong>No</strong> for each.
            Labels print via Zebra cloud Weblink where applicable.
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
        <h4 className="mobile-access-panel__section-label">Workshop apps</h4>
        <div className="mobile-access-permission-list">
          <AccessSelect
            id="mobile-access-upholstery-app"
            label="Upholstery (Android)"
            description="Create seating items, stock-in, manufacture, quotes, and repair queue."
            value={grant.warehouse_production_app}
            onChange={(v) => setGrant((prev) => ({ ...prev, warehouse_production_app: v }))}
          />
          <AccessSelect
            id="mobile-access-carpentry-app"
            label="Carpentry (Android)"
            description="Carpentry manufacture, quotes, painting send, and repair queue (excludes Color → Painting)."
            value={grant.carpentry_workshop_app}
            onChange={(v) => setGrant((prev) => ({ ...prev, carpentry_workshop_app: v }))}
          />
          <AccessSelect
            id="mobile-access-painting-app"
            label="Painting (Android)"
            description="Painting jobs and Color repair returns; finish credits Floor 1."
            value={grant.painting_workshop_app}
            onChange={(v) => setGrant((prev) => ({ ...prev, painting_workshop_app: v }))}
          />
          <AccessSelect
            id="mobile-access-upholstery-photo-upload"
            label="Picture upload (Floor 2 WIP)"
            description="Gallery import on Manufacture inlay photos (Upholstery app)."
            value={grant.warehouse_production_photo_upload}
            onChange={(v) => setGrant((prev) => ({ ...prev, warehouse_production_photo_upload: v }))}
          />
        </div>
      </div>

      <div className="mobile-access-panel__section">
        <label className="mobile-access-name-label" htmlFor="upholstery-app-display-name">
          Name in app
        </label>
        <input
          id="upholstery-app-display-name"
          type="text"
          className="mobile-access-name-input"
          placeholder="Shown on workshop app dashboards"
          value={appDisplayName}
          onChange={(e) => setAppDisplayName(e.target.value)}
        />
      </div>
    </div>
  );
}
