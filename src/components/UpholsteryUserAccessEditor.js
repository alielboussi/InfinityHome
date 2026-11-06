import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import {
  buildMobileScreenAccessRow,
  CARPENTRY_APP_SCREENS,
  defaultMobileAccessGrant,
  isWorkshopOrDeliveryScreenAllowed,
  PAINTING_APP_SCREENS,
  sanitizeMobileAccessGrantForUser,
  UPHOLSTERY_APP_SCREENS,
} from '../mobile/mobileAccessManifest';

const APP_CONFIG = Object.freeze({
  upholstery: {
    title: 'Upholstery',
    hint: 'Users always open the Upholstery dashboard first. Yes enables that page on the app; No hides it.',
    flag: 'warehouse_production_app',
    screens: UPHOLSTERY_APP_SCREENS,
    showPhotoUpload: true,
  },
  carpentry: {
    title: 'Carpentry',
    hint: 'Users always open the Carpentry dashboard first. Yes enables that page on the app; No hides it.',
    flag: 'carpentry_workshop_app',
    screens: CARPENTRY_APP_SCREENS,
    showPhotoUpload: false,
  },
  painting: {
    title: 'Painting',
    hint: 'Users always open the Painting dashboard first. Yes enables that page on the app; No hides it.',
    flag: 'painting_workshop_app',
    screens: PAINTING_APP_SCREENS,
    showPhotoUpload: false,
  },
});

function grantForWorkshopSave(grant, appKey) {
  const cfg = APP_CONFIG[appKey] || APP_CONFIG.upholstery;
  const anyScreenAllowed = cfg.screens.some((s) => grant.screens?.[s.id]?.view === 'allow');
  return {
    ...grant,
    [cfg.flag]: anyScreenAllowed ? 'allow' : 'deny',
    warehouse_production_kitwe: 'deny',
    screens: {
      ...(grant.screens || {}),
      kitwe_send_delivery: buildMobileScreenAccessRow(false),
    },
  };
}

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
  return sanitizeMobileAccessGrantForUser(raw || defaultMobileAccessGrant(), '');
}

export default function UpholsteryUserAccessEditor({ userRow, focusApp = 'upholstery', onClose, onSaved }) {
  const appKey = APP_CONFIG[focusApp] ? focusApp : 'upholstery';
  const cfg = APP_CONFIG[appKey];

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
  }, [userRow?.id, userRow?.mobile_access, userRow?.mobile_display_name, appKey]);

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
      const anyAllowed = cfg.screens.some((s) => nextScreens[s.id]?.view === 'allow');
      return {
        ...prev,
        [cfg.flag]: anyAllowed ? 'allow' : 'deny',
        screens: nextScreens,
      };
    });
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = sanitizeMobileAccessGrantForUser(
        grantForWorkshopSave(grant, appKey),
        userRow.email,
      );
      const updated = await saveUpholsteryAppAccess(
        userRow.id,
        payload,
        appDisplayName,
      );
      onSaved?.(updated);
      setGrant(normalizeGrant(updated?.mobile_access));
      setToast(`${cfg.title} access saved.`);
    } catch (err) {
      setError(err?.message || `Failed to save ${cfg.title} access`);
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
            {cfg.title} — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            {cfg.hint}
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

      {cfg.showPhotoUpload ? (
        <div className="mobile-access-panel__section mobile-access-panel__section--permissions">
          <h4 className="mobile-access-panel__section-label">Upholstery permissions</h4>
          <div className="mobile-access-permission-list">
            <div className="mobile-access-permission-item">
              <label className="mobile-access-permission-item__body" htmlFor="mobile-access-upholstery-photo-upload">
                <span className="mobile-access-permission-item__title">Picture upload (Floor 2 WIP)</span>
                <span className="mobile-access-permission-item__desc">
                  Gallery import on Manufacture inlay photos (Upholstery app).
                </span>
              </label>
              <select
                id="mobile-access-upholstery-photo-upload"
                className="mobile-access-yesno"
                value={grant.warehouse_production_photo_upload === 'allow' ? 'yes' : 'no'}
                onChange={(e) => setGrant((prev) => ({
                  ...prev,
                  warehouse_production_photo_upload: e.target.value === 'yes' ? 'allow' : 'deny',
                }))}
                aria-label="Picture upload (Floor 2 WIP)"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mobile-access-panel__section">
        <label className="mobile-access-name-label" htmlFor="upholstery-app-display-name">
          Name in app
        </label>
        <input
          id="upholstery-app-display-name"
          type="text"
          className="mobile-access-name-input"
          placeholder={`Shown on ${cfg.title} app dashboard`}
          value={appDisplayName}
          onChange={(e) => setAppDisplayName(e.target.value)}
        />
      </div>

      <div className="mobile-access-panel__section">
        <table className="mobile-access-matrix mobile-access-matrix--yesno">
          <thead>
            <tr>
              <th className="mobile-access-matrix__screen-col">Screen</th>
              <th className="mobile-access-matrix__access-col">Access</th>
            </tr>
          </thead>
          <tbody>
            {cfg.screens.map((screen) => {
              const allowed = isWorkshopOrDeliveryScreenAllowed(grant, screen.id, cfg.flag);
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
