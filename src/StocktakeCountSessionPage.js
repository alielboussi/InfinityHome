import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { FaQrcode } from 'react-icons/fa';
import supabase from './supabase';
import {
  addCount,
  createProduct,
  createSet,
  fetchCatalog,
  fetchImportTemplate,
  fetchMyCounts,
  getEvent,
  importCounts,
  listOpenSessions,
  scanSet,
} from './services/stocktake';
import { downloadStocktakeQtySample, parseStocktakeQtyFile } from './utils/stocktakeQtyImport';
import { hasOAuthReturnParams, resolveAppUserFromSession, startGoogleSignIn } from './utils/googleAuth';
import { signInWithEmailPassword } from './utils/supabaseAuthLogin';
import './stocktake-count.css';

const SCANNER_ELEMENT_ID = 'stc-qr-reader';
const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

function readCountUser() {
  try {
    const raw = sessionStorage.getItem('stocktake:countUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCountUser(user) {
  sessionStorage.setItem('stocktake:countUser', JSON.stringify(user));
}

function clearCountUser() {
  try { sessionStorage.removeItem('stocktake:countUser'); } catch {}
}

function normalizeCode(value) {
  return String(value || '').trim();
}

export default function StocktakeCountSessionPage() {
  const [user, setUser] = useState(() => readCountUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [openSessions, setOpenSessions] = useState([]);
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState({ products: [], sets: [] });
  const [popupItem, setPopupItem] = useState(null);
  const [popupQty, setPopupQty] = useState('1');
  const [showMore, setShowMore] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [setFormOpen, setSetFormOpen] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', sku: '', price: '' });
  const [setForm, setSetForm] = useState({ name: '', sku: '', price: '', lines: [{ product_id: '', quantity: 1 }] });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const importFileRef = useRef(null);

  const locationId = event?.location_id;
  const canCount = Boolean(eventId && event?.status === 'counting');
  const waitingForSession = !openSessions.length;

  const refreshOpenSessions = useCallback(async () => {
    const data = await listOpenSessions();
    const rows = data.rows || [];
    setOpenSessions(rows);

    if (!rows.length) {
      setEventId('');
      setEvent(null);
      setCart([]);
      return rows;
    }

    setEventId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      return rows.length === 1 ? rows[0].id : '';
    });
    return rows;
  }, []);

  const refreshEvent = useCallback(async (id) => {
    if (!id) {
      setEvent(null);
      return;
    }
    const data = await getEvent(id);
    const next = data.event;
    if (!next || next.status !== 'counting') {
      setEventId('');
      setEvent(null);
      setCart([]);
      setToast(next?.status === 'submitted'
        ? 'Stocktake submitted — counting session ended.'
        : 'Counting session ended.');
      await refreshOpenSessions();
      return;
    }
    setEvent(next);
  }, [refreshOpenSessions]);

  const refreshCart = useCallback(async (userEmail, id) => {
    if (!id || !userEmail) {
      setCart([]);
      return;
    }
    const data = await fetchMyCounts(id, userEmail);
    setCart(data.rows || []);
  }, []);

  const refreshCatalog = useCallback(async (q = '') => {
    if (!locationId) return { products: [], sets: [] };
    try {
      const data = await fetchCatalog(locationId, q);
      const next = { products: data.products || [], sets: data.sets || [] };
      setCatalog(next);
      return next;
    } catch (err) {
      setCatalog({ products: [], sets: [] });
      setError(err?.message || 'Failed to load products for this location.');
      throw err;
    }
  }, [locationId]);

  useEffect(() => {
    if (!user?.email) return undefined;
    let alive = true;
    (async () => {
      try {
        await refreshOpenSessions();
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    const timer = setInterval(() => {
      refreshOpenSessions().catch(() => {});
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, refreshOpenSessions]);

  useEffect(() => {
    if (!user?.email || !eventId) {
      setEvent(null);
      setCart([]);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        await refreshEvent(eventId);
        await refreshCart(user.email, eventId);
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    const timer = setInterval(() => {
      refreshEvent(eventId).catch(() => {});
      refreshCart(user.email, eventId).catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, eventId, refreshEvent, refreshCart]);

  useEffect(() => {
    if (!locationId) {
      setCatalog({ products: [], sets: [] });
      return;
    }
    let alive = true;
    (async () => {
      try {
        await refreshCatalog(search);
        if (alive) setError((prev) => (/failed to load products/i.test(String(prev || '')) ? '' : prev));
      } catch (_) {
        // refreshCatalog already sets error
      }
    })();
    return () => { alive = false; };
  }, [locationId, search, refreshCatalog]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    scanLockRef.current = false;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {}
    try {
      await scanner.clear();
    } catch {}
  }, []);

  useEffect(() => {
    if (!scannerOpen) return undefined;
    let cancelled = false;
    scanLockRef.current = false;

    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 80));
        if (cancelled) return;
        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 8,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
            formatsToSupport: SCAN_FORMATS,
          },
          async (decoded) => {
            if (scanLockRef.current) return;
            const code = normalizeCode(decoded);
            if (!code) return;
            scanLockRef.current = true;
            setSearch(code);
            setScannerOpen(false);
            await stopScanner();
            try {
              const data = await refreshCatalog(code);
              const products = data.products || [];
              const sets = data.sets || [];
              const lower = code.toLowerCase();
              const exactSet = sets.find((s) => String(s.sku || '').trim().toLowerCase() === lower);
              const exactProduct = products.find((p) => String(p.sku || '').trim().toLowerCase() === lower);
              const hit = exactSet
                ? { ...exactSet, type: 'set' }
                : exactProduct
                  ? { ...exactProduct, type: 'product' }
                  : null;
              if (hit) {
                setPopupItem(hit);
                setPopupQty('1');
                setToast(`Scanned ${hit.sku || hit.name}`);
              } else {
                setToast(`Scanned “${code}” — pick a match below.`);
              }
            } catch (err) {
              setError(err.message || 'Scan lookup failed');
            }
          },
          () => {},
        );
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Camera unavailable. Allow camera access or type the SKU.');
          setScannerOpen(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scannerOpen, refreshCatalog, stopScanner]);

  const results = useMemo(() => {
    const products = (catalog.products || []).map((p) => ({ ...p, type: 'product' }));
    const sets = (catalog.sets || []).map((s) => ({ ...s, type: 'set' }));
    return [...sets, ...products];
  }, [catalog]);

  const selectedSession = openSessions.find((s) => s.id === eventId) || null;

  const applyCountUser = useCallback((profileUser) => {
    const nextUser = {
      id: profileUser?.id || profileUser?.user_uid || null,
      email: profileUser?.email || null,
      full_name: profileUser?.full_name || null,
    };
    if (!nextUser.email) return false;
    writeCountUser(nextUser);
    setUser(nextUser);
    return true;
  }, []);

  useEffect(() => {
    if (user?.email) return undefined;
    let active = true;

    const finishFromSession = async () => {
      const profile = await resolveAppUserFromSession();
      if (!active) return;
      if (!profile.ok) {
        if (hasOAuthReturnParams()) {
          setError(profile.error || 'Google sign-in did not complete.');
        }
        return;
      }
      applyCountUser(profile.user);
      setError('');
      setToast('Logged in with Google.');
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('oauth');
        url.searchParams.delete('code');
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      } catch (_) {}
    };

    (async () => {
      if (hasOAuthReturnParams()) {
        setGoogleLoading(true);
        try {
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.access_token) break;
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          await finishFromSession();
        } catch (err) {
          if (active) setError(err?.message || 'Google sign-in failed.');
        } finally {
          if (active) setGoogleLoading(false);
        }
        return;
      }

      // Reuse an existing Supabase session (e.g. already signed in via Google on /login).
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) await finishFromSession();
      } catch (_) {}
    })();

    return () => {
      active = false;
    };
  }, [user?.email, applyCountUser]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await signInWithEmailPassword(email, password);
      if (!result.ok) {
        setError(result.error || 'Login failed');
        return;
      }
      applyCountUser(result.user);
      setToast('Logged in.');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await startGoogleSignIn({ returnPath: '/stocktake/count' });
    } catch (err) {
      setGoogleLoading(false);
      setError(err?.message || 'Could not start Google sign-in.');
    }
  };

  const openPopup = (item) => {
    if (!canCount) {
      setError('Select an open counting session first.');
      return;
    }
    setPopupItem(item);
    setPopupQty('1');
  };

  const handleDownloadSample = async () => {
    if (!locationId) {
      setError('Select a location session first.');
      return;
    }
    setImportBusy(true);
    setError('');
    try {
      const data = await fetchImportTemplate(locationId);
      const locName = openSessions.find((s) => s.id === eventId)?.location_name || 'location';
      downloadStocktakeQtySample({
        rows: data.rows || [],
        filename: `stocktake_qty_sample_${String(locName).replace(/\s+/g, '_')}.xlsx`,
      });
      setToast('Sample Excel downloaded.');
    } catch (err) {
      setError(err.message || 'Failed to download sample');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportExcel = async (file) => {
    if (!file) return;
    if (!canCount || !eventId || !user?.email) {
      setError('Join an open counting session before importing.');
      return;
    }
    setImportBusy(true);
    setError('');
    try {
      const rows = await parseStocktakeQtyFile(file);
      const result = await importCounts(eventId, rows, user.email);
      await refreshCart(user.email, eventId);
      const skipPreview = (result.skipped || [])
        .slice(0, 3)
        .map((s) => `${s.sku}: ${s.reason}`)
        .join(' · ');
      setToast(
        `Imported ${result.importedCount}`
        + (result.skippedCount ? ` · skipped ${result.skippedCount}${skipPreview ? ` (${skipPreview})` : ''}` : '')
      );
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImportBusy(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const confirmPopup = async () => {
    if (!popupItem || !user?.email || !eventId) return;
    const qty = Number(popupQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter a quantity greater than 0.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (popupItem.type === 'set') {
        await scanSet(eventId, popupItem.id, qty, user.email);
      } else {
        await addCount(eventId, popupItem.id, qty, user.email);
      }
      await refreshCart(user.email, eventId);
      setPopupItem(null);
      setSearch('');
      setToast(popupItem.type === 'set'
        ? 'Set components added to your list.'
        : 'Added to your list.');
    } catch (err) {
      setError(err.message || 'Failed to add count');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!locationId) return;
    setBusy(true);
    setError('');
    try {
      await createProduct(locationId, {
        name: productForm.name,
        sku: productForm.sku,
        price: Number(productForm.price || 0),
      });
      setShowProductForm(false);
      setProductForm({ name: '', sku: '', price: '' });
      await refreshCatalog(search);
      setToast('Product created. Search for it to add a count.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSet = async () => {
    if (!locationId) return;
    setBusy(true);
    setError('');
    try {
      await createSet(locationId, {
        name: setForm.name,
        sku: setForm.sku,
        price: Number(setForm.price || 0),
        components: setForm.lines.filter((l) => l.product_id),
      });
      setSetFormOpen(false);
      setSetForm({ name: '', sku: '', price: '', lines: [{ product_id: '', quantity: 1 }] });
      await refreshCatalog(search);
      setToast('Set created. Search for it to add.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = normalizeCode(search);
    if (!code) return;
    const lower = code.toLowerCase();
    const exact = results.find((r) => String(r.sku || '').trim().toLowerCase() === lower);
    if (exact) openPopup(exact);
    else if (results.length === 1) openPopup(results[0]);
  };

  if (!user?.email) {
    return (
      <div className="stc-page stc-login">
        <div className="stc-card">
          <h2>Stock count login</h2>
          <p className="stc-note">
            Sign in with Google or email/password. Open sessions appear here by location — always use this same page (/stocktake/count).
          </p>
          {error && <div className="stc-error">{error}</div>}
          <button
            type="button"
            className="stc-btn stc-btn-google"
            onClick={handleGoogleLogin}
            disabled={busy || googleLoading}
          >
            {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
          </button>
          <div className="stc-login-divider" aria-hidden="true"><span>or email/password</span></div>
          <form onSubmit={handleLogin} className="stc-login-form">
            <input
              className="stc-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="stc-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="stc-btn stc-btn-primary" disabled={busy || googleLoading}>
              {busy ? 'Signing in…' : 'Login with email'}
            </button>
          </form>
          <p className="stc-note">
            Uses Supabase Auth (works on localhost and production). Google accounts have no password — use Continue with Google.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stc-page">
      <div className="stc-card">
        <div className="stc-header-row">
          <div className="stc-title">Count stock</div>
          <button
            type="button"
            className="stc-btn stc-btn-ghost"
            style={{ width: 'auto', minHeight: 36, padding: '6px 12px', fontSize: 13 }}
            onClick={() => {
              clearCountUser();
              setUser(null);
              setEventId('');
              setEvent(null);
              setCart([]);
            }}
          >
            Sign out
          </button>
        </div>
        <div className="stc-user">{user.email}</div>

        {waitingForSession ? (
          <div className="stc-warn">
            No open counting session. Keep this page open — when control starts a session for a location, pick it below and start counting.
          </div>
        ) : (
          <>
            <label className="stc-label">Location</label>
            <select
              className="stc-select"
              value={eventId}
              disabled={busy}
              onChange={(e) => setEventId(e.target.value)}
            >
              {openSessions.length > 1 && <option value="">Select location…</option>}
              {openSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.location_name}{s.is_initial ? ' (first stocktake)' : ''}
                </option>
              ))}
            </select>
            {selectedSession && (
              <div className="stc-note stc-ok">
                Counting for {selectedSession.location_name}
              </div>
            )}
          </>
        )}

        {error && <div className="stc-error">{error}</div>}

        {canCount && (
          <>
            <div className="stc-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="stc-btn stc-btn-ghost"
                disabled={busy || importBusy || !locationId}
                onClick={handleDownloadSample}
              >
                Download sample Excel
              </button>
              <button
                type="button"
                className="stc-btn"
                disabled={busy || importBusy}
                onClick={() => importFileRef.current?.click()}
              >
                Import Excel qty
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => handleImportExcel(e.target.files?.[0])}
              />
            </div>
            <div className="stc-note" style={{ marginTop: 6 }}>
              Excel needs SKU, Product Name, Quantity. Products/components only (not sets). Qty applies only to this location.
            </div>

            <label className="stc-label">Search or scan SKU</label>
            <div className="stc-search-row">
              <input
                className="stc-input"
                placeholder="Product name or SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
                disabled={busy}
                enterKeyHint="search"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="stc-icon-btn"
                title="Scan QR / barcode"
                aria-label="Scan QR or barcode"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setScannerOpen(true);
                }}
              >
                <FaQrcode />
              </button>
            </div>

            <div className="stc-results">
              {results.length === 0 ? (
                <div className="stc-note" style={{ padding: 12 }}>
                  {search.trim()
                    ? 'No matches for this location. Try another name/SKU, or clear search to browse.'
                    : 'No products linked to this location yet (product_locations or inventory).'}
                </div>
              ) : results.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  className="stc-result"
                  disabled={busy}
                  onClick={() => openPopup(item)}
                >
                  {item.type === 'set' && <span className="stc-badge">SET</span>}
                  {item.name || item.combo_name}
                  {item.sku ? ` (${item.sku})` : ''}
                </button>
              ))}
            </div>
            {!search.trim() && results.length > 0 && (
              <div className="stc-note" style={{ marginTop: 6 }}>
                Showing first {results.length} items — type a name/SKU to narrow the list.
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="stc-btn stc-btn-ghost"
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? 'Hide create options' : 'Create product / set'}
              </button>
            </div>
            {showMore && (
              <div className="stc-actions">
                <button type="button" className="stc-btn" disabled={busy} onClick={() => setShowProductForm(true)}>
                  + Product
                </button>
                <button type="button" className="stc-btn" disabled={busy} onClick={() => setSetFormOpen(true)}>
                  + Set
                </button>
                <button
                  type="button"
                  className="stc-btn stc-btn-ghost"
                  disabled={busy || !locationId}
                  onClick={() => refreshCatalog(search).then(() => setToast('List refreshed.'))}
                >
                  Refresh
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {canCount && (
        <div className="stc-card">
          <div className="stc-title" style={{ fontSize: '1rem' }}>My counts</div>
          <div className="stc-note">Saved automatically — safe to refresh.</div>
          <div className="stc-table-wrap">
            <table className="stc-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr><td colSpan={3}>Nothing counted yet.</td></tr>
                ) : cart.map((row) => (
                  <tr key={row.product_id}>
                    <td>{row.name}{row.sku ? ` (${row.sku})` : ''}</td>
                    <td className="stc-qty">{row.qty}</td>
                    <td>{row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <div className="stc-toast">{toast}</div>}

      {scannerOpen && (
        <div className="stc-modal-backdrop">
          <div className="stc-modal">
            <div className="stc-modal-title">Scan SKU</div>
            <div className="stc-note">Point the camera at a QR code or barcode.</div>
            <div id={SCANNER_ELEMENT_ID} className="stc-scanner-box" />
            <div className="stc-actions stc-actions-2">
              <button
                type="button"
                className="stc-btn stc-btn-ghost"
                onClick={async () => {
                  setScannerOpen(false);
                  await stopScanner();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {popupItem && (
        <div className="stc-modal-backdrop">
          <div className="stc-modal">
            <div className="stc-modal-title">How many?</div>
            <div className="stc-note">
              {popupItem.type === 'set' && <span className="stc-badge">SET</span>}
              {popupItem.name || popupItem.combo_name}
            </div>
            {popupItem.type === 'set' && (
              <div className="stc-note">
                Components are added to your cart (e.g. 2 sets of 1 table + 6 chairs → 2 tables, 12 chairs).
              </div>
            )}
            <input
              className="stc-input"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={popupQty}
              onChange={(e) => setPopupQty(e.target.value)}
              autoFocus
            />
            <div className="stc-actions stc-actions-2" style={{ marginTop: 12 }}>
              <button type="button" className="stc-btn stc-btn-primary" disabled={busy} onClick={confirmPopup}>
                Add
              </button>
              <button type="button" className="stc-btn stc-btn-ghost" disabled={busy} onClick={() => setPopupItem(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductForm && (
        <div className="stc-modal-backdrop">
          <div className="stc-modal">
            <div className="stc-modal-title">New product</div>
            <input className="stc-input" placeholder="Name" value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="stc-input" style={{ marginTop: 8 }} placeholder="SKU" value={productForm.sku} onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))} />
            <input className="stc-input" style={{ marginTop: 8 }} placeholder="Price" type="number" inputMode="decimal" value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} />
            <div className="stc-actions stc-actions-2" style={{ marginTop: 12 }}>
              <button type="button" className="stc-btn stc-btn-primary" disabled={busy || !productForm.name} onClick={handleCreateProduct}>Save</button>
              <button type="button" className="stc-btn stc-btn-ghost" onClick={() => setShowProductForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {setFormOpen && (
        <div className="stc-modal-backdrop">
          <div className="stc-modal">
            <div className="stc-modal-title">New set</div>
            <div className="stc-note">Components must already exist as products. Create products first if needed.</div>
            <input className="stc-input" placeholder="Set name" value={setForm.name} onChange={(e) => setSetForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="stc-input" style={{ marginTop: 8 }} placeholder="SKU" value={setForm.sku} onChange={(e) => setSetForm((p) => ({ ...p, sku: e.target.value }))} />
            <input className="stc-input" style={{ marginTop: 8 }} placeholder="Price" type="number" inputMode="decimal" value={setForm.price} onChange={(e) => setSetForm((p) => ({ ...p, price: e.target.value }))} />
            {(setForm.lines || []).map((line, idx) => (
              <div key={idx} className="stc-set-line">
                <select
                  className="stc-select"
                  value={line.product_id}
                  onChange={(e) => {
                    const lines = [...setForm.lines];
                    lines[idx] = { ...lines[idx], product_id: e.target.value };
                    setSetForm((p) => ({ ...p, lines }));
                  }}
                >
                  <option value="">Component…</option>
                  {(catalog.products || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  className="stc-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => {
                    const lines = [...setForm.lines];
                    lines[idx] = { ...lines[idx], quantity: Number(e.target.value || 1) };
                    setSetForm((p) => ({ ...p, lines }));
                  }}
                />
              </div>
            ))}
            <div className="stc-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="stc-btn stc-btn-ghost"
                onClick={() => setSetForm((p) => ({ ...p, lines: [...p.lines, { product_id: '', quantity: 1 }] }))}
              >
                + Part
              </button>
              <button type="button" className="stc-btn stc-btn-primary" disabled={busy || !setForm.name} onClick={handleCreateSet}>
                Save set
              </button>
              <button type="button" className="stc-btn stc-btn-ghost" onClick={() => setSetFormOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
