import React, { useEffect, useState } from 'react';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import {
  buildMobileScreenAccessRow,
  defaultMobileAccessGrant,
  FLOOR2_AND_STOREROOM_SCREEN_IDS,
  getMobilePermissionMatrixScreens,
  isCatalogLocationPhotoUploadAllowed,
  isCatalogLocationStockIncreaseAllowed,
  isMobileScreenAccessAllowed,
  isWarehouseFloor2CreateProductAllowed,
  isWarehouseFloor2CreateSetAllowed,
  sanitizeMobileAccessGrantForUser,
  USER_ACCESS_CATALOG_APP_LABEL,
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
  return sanitizeMobileAccessGrantForUser(raw || defaultMobileAccessGrant(), '');
}

const LOCATION_RIGHTS_SET = new Set(FLOOR2_AND_STOREROOM_SCREEN_IDS);

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

  const setLocationStockIncrease = (screenId, allowed) => {
    setGrant((prev) => ({
      ...prev,
      location_stock_increase: {
        ...(prev.location_stock_increase || {}),
        [screenId]: allowed ? 'allow' : 'deny',
      },
    }));
  };

  const setLocationPhotoUpload = (screenId, allowed) => {
    setGrant((prev) => ({
      ...prev,
      location_photo_upload: {
        ...(prev.location_photo_upload || {}),
        [screenId]: allowed ? 'allow' : 'deny',
      },
    }));
  };

  const setFloor2CreateProduct = (allowed) => {
    setGrant((prev) => ({
      ...prev,
      warehouse_floor2_create_product: allowed ? 'allow' : 'deny',
    }));
  };

  const setFloor2CreateSet = (allowed) => {
    setGrant((prev) => ({
      ...prev,
      warehouse_floor2_create_set: allowed ? 'allow' : 'deny',
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
      setToast(`${USER_ACCESS_CATALOG_APP_LABEL} access saved.`);
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
            {USER_ACCESS_CATALOG_APP_LABEL} — {displayName}
          </h3>
          <p className="mobile-access-panel__hint">
            Users always open the <strong>dashboard</strong> first. <strong>Yes</strong> adds a button for that screen;
            <strong> No</strong> blocks it entirely. For <strong>Floor 2</strong> and <strong>Storerooms 1–3</strong>,
            you can also choose whether the user can increase stock qty or upload/import photos on that page.
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
                <th className="mobile-access-matrix__screen-col">Page</th>
                <th className="mobile-access-matrix__access-col">Access</th>
                <th className="mobile-access-matrix__access-col">Qty Increase</th>
                <th className="mobile-access-matrix__access-col">Image Upload</th>
                <th className="mobile-access-matrix__access-col">+ Prod</th>
                <th className="mobile-access-matrix__access-col">+ Set</th>
                <th className="mobile-access-matrix__access-col">Print Labels</th>
              </tr>
            </thead>
            <tbody>
              {matrixScreens.map((screen) => {
                const allowed = isMobileScreenAccessAllowed(grant, screen.id);
                const hasLocationRights = LOCATION_RIGHTS_SET.has(screen.id);
                const isFloor1Screen = screen.id === 'warehouse_products';
                const isFloor2Screen = screen.id === 'warehouse_floor_2';
                const stockIncAllowed = isCatalogLocationStockIncreaseAllowed(grant, screen.id, '');
                const photoUpAllowed = isCatalogLocationPhotoUploadAllowed(grant, screen.id, '');
                const floor1AddAllowed = grant.warehouse_catalog_add_product === 'allow';
                const floor1PhotoAllowed = grant.warehouse_catalog_photo_import === 'allow';
                const floor1LabelAllowed = grant.warehouse_catalog_label_print === 'allow';
                const floor2ProdAllowed = isWarehouseFloor2CreateProductAllowed(grant, '');
                const floor2SetAllowed = isWarehouseFloor2CreateSetAllowed(grant, '');
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
                    <td className="mobile-access-matrix__access-col">
                      {hasLocationRights ? (
                        <select
                          className="mobile-access-yesno"
                          value={stockIncAllowed ? 'yes' : 'no'}
                          onChange={(e) => setLocationStockIncrease(screen.id, e.target.value === 'yes')}
                          aria-label={`${screen.label} qty stock increase`}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <span style={{ color: 'var(--br-subtle, #64748b)' }}>—</span>
                      )}
                    </td>
                    <td className="mobile-access-matrix__access-col">
                      {isFloor1Screen ? (
                        <select
                          className="mobile-access-yesno"
                          value={floor1PhotoAllowed ? 'yes' : 'no'}
                          onChange={(e) => setGrant((prev) => ({
                            ...prev,
                            warehouse_catalog_photo_import: e.target.value === 'yes' ? 'allow' : 'deny',
                          }))}
                          aria-label="Floor 1 image upload"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : hasLocationRights ? (
                        <select
                          className="mobile-access-yesno"
                          value={photoUpAllowed ? 'yes' : 'no'}
                          onChange={(e) => setLocationPhotoUpload(screen.id, e.target.value === 'yes')}
                          aria-label={`${screen.label} image upload`}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <span style={{ color: 'var(--br-subtle, #64748b)' }}>—</span>
                      )}
                    </td>
                    <td className="mobile-access-matrix__access-col">
                      {isFloor1Screen ? (
                        <select
                          className="mobile-access-yesno"
                          value={floor1AddAllowed ? 'yes' : 'no'}
                          onChange={(e) => setGrant((prev) => ({
                            ...prev,
                            warehouse_catalog_add_product: e.target.value === 'yes' ? 'allow' : 'deny',
                          }))}
                          aria-label="Floor 1 + Prod access"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : isFloor2Screen ? (
                        <select
                          className="mobile-access-yesno"
                          value={floor2ProdAllowed ? 'yes' : 'no'}
                          onChange={(e) => setFloor2CreateProduct(e.target.value === 'yes')}
                          aria-label="Floor 2 + Prod access"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <span style={{ color: 'var(--br-subtle, #64748b)' }}>—</span>
                      )}
                    </td>
                    <td className="mobile-access-matrix__access-col">
                      {isFloor2Screen ? (
                        <select
                          className="mobile-access-yesno"
                          value={floor2SetAllowed ? 'yes' : 'no'}
                          onChange={(e) => setFloor2CreateSet(e.target.value === 'yes')}
                          aria-label="Floor 2 + Set access"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <span style={{ color: 'var(--br-subtle, #64748b)' }}>—</span>
                      )}
                    </td>
                    <td className="mobile-access-matrix__access-col">
                      {isFloor1Screen ? (
                        <select
                          className="mobile-access-yesno"
                          value={floor1LabelAllowed ? 'yes' : 'no'}
                          onChange={(e) => setGrant((prev) => ({
                            ...prev,
                            warehouse_catalog_label_print: e.target.value === 'yes' ? 'allow' : 'deny',
                          }))}
                          aria-label="Floor 1 print Zebra labels"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <span style={{ color: 'var(--br-subtle, #64748b)' }}>—</span>
                      )}
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
