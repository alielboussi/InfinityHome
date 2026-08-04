import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { FaDownload, FaFileImport, FaPlus, FaQrcode, FaTrashAlt } from 'react-icons/fa';
import db from './dataClient';
import {
  addCount,
  clearMyCounts,
  createProduct,
  createSet,
  fetchCatalog,
  fetchImportTemplate,
  fetchLocations,
  fetchMyCounts,
  getEvent,
  importCounts,
  invalidateStocktakeCatalogCache,
  listEvents,
  removeMyCount,
  scanSet,
} from './services/stocktake';
import { downloadStocktakeQtySample, parseStocktakeQtyFile } from './utils/stocktakeQtyImport';
import { hasOAuthReturnParams, resolveAppUserFromSession, startGoogleSignIn } from './utils/googleAuth';
import { signInWithEmailPassword } from './utils/authLogin';
import { resolveLocationBySlug } from './utils/stocktakeLocationSlug';
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
    const raw = localStorage.getItem('stocktake:countUser') || sessionStorage.getItem('stocktake:countUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCountUser(user) {
  localStorage.setItem('stocktake:countUser', JSON.stringify(user));
  try { sessionStorage.setItem('stocktake:countUser', JSON.stringify(user)); } catch {}
}

function clearCountUser() {
  try { localStorage.removeItem('stocktake:countUser'); } catch {}
  try { sessionStorage.removeItem('stocktake:countUser'); } catch {}
}

function writeStoredEventId(locationId, id) {
  if (!locationId) return;
  try {
    if (id) localStorage.setItem(`stocktake:countEventId:${locationId}`, id);
    else localStorage.removeItem(`stocktake:countEventId:${locationId}`);
  } catch {}
}

function normalizeCode(value) {
  return String(value || '').trim();
}

const COUNT_DISPLAY_NAMES = {
  'alielboussi00@gmail.com': 'Ali El Boussi',
};

function displayCountUserName(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (COUNT_DISPLAY_NAMES[email]) return COUNT_DISPLAY_NAMES[email];
  const name = String(user?.full_name || '').trim();
  return name || user?.email || '';
}

export default function StocktakeCountSessionPage({ locationSlug = '' }) {
  const routerLocation = useLocation();
  const countReturnPath = routerLocation.pathname || `/stocktake/count/${locationSlug}`;
  const [user, setUser] = useState(() => readCountUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [boundLocation, setBoundLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalog, setCatalog] = useState({ products: [], sets: [] });
  const [popupItem, setPopupItem] = useState(null);
  const [popupQty, setPopupQty] = useState('1');
  const [actionItem, setActionItem] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [setFormOpen, setSetFormOpen] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', sku: '', price: '' });
  const [setForm, setSetForm] = useState({ name: '', sku: '', price: '', lines: [{ product_id: '', quantity: 1 }] });
  const [setPickerProducts, setSetPickerProducts] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const importFileRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const locationId = boundLocation?.id || event?.location_id;
  const canCount = Boolean(eventId && event?.status === 'counting' && boundLocation);
  const waitingForSession = Boolean(boundLocation && !eventId);

  useEffect(() => {
    let alive = true;
    setLocationLoading(true);
    setLocationError('');
    setBoundLocation(null);

    (async () => {
      try {
        const slug = String(locationSlug || '').trim().toLowerCase();
        if (!slug) {
          if (alive) setLocationError('Missing location in this link. Ask control for your location-specific count URL.');
          return;
        }
        const data = await fetchLocations();
        const loc = resolveLocationBySlug(data.rows || [], slug);
        if (!alive) return;
        if (!loc) {
          setLocationError(`Unknown location "${slug}". Check the link from Stocktake control.`);
          return;
        }
        setBoundLocation(loc);
      } catch (err) {
        if (alive) setLocationError(err?.message || 'Failed to load location.');
      } finally {
        if (alive) setLocationLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [locationSlug]);

  const refreshLocationSession = useCallback(async (locId) => {
    if (!locId) {
      setEventId('');
      setEvent(null);
      setCart([]);
      return null;
    }
    const data = await listEvents(locId);
    const open = (data.rows || []).find((row) => row.status === 'counting');
    if (!open) {
      setEventId('');
      setEvent(null);
      setCart([]);
      return null;
    }
    setEventId(open.id);
    return open;
  }, []);

  useEffect(() => {
    writeStoredEventId(locationId, eventId || '');
  }, [locationId, eventId]);

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
      await refreshLocationSession(boundLocation?.id);
      return;
    }
    setEvent(next);
  }, [refreshLocationSession, boundLocation?.id]);

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
    if (!user?.email || !boundLocation?.id) return undefined;
    let alive = true;
    (async () => {
      try {
        await refreshLocationSession(boundLocation.id);
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    const timer = setInterval(() => {
      refreshLocationSession(boundLocation.id).catch(() => {});
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, boundLocation?.id, refreshLocationSession]);

  useEffect(() => {
    if (!user?.email) {
      // Keep session + cart state across sign-out; counts live in DB until /stocktake submit.
      return undefined;
    }
    if (!eventId) {
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
    const timer = setTimeout(() => setSearchQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!locationId) {
      setCatalog({ products: [], sets: [] });
      setSetPickerProducts([]);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const data = await fetchCatalog(locationId, '');
        if (!alive) return;
        setSetPickerProducts(data.products || []);
      } catch {
        if (alive) setSetPickerProducts([]);
      }
    })();
    return () => { alive = false; };
  }, [locationId]);

  useEffect(() => {
    if (!locationId) {
      setCatalog({ products: [], sets: [] });
      setCatalogLoading(false);
      return undefined;
    }
    const q = searchQuery.trim();
    if (!q) {
      setCatalog({ products: [], sets: [] });
      setCatalogLoading(false);
      return undefined;
    }
    if (q.length < 2) {
      setCatalogLoading(false);
      return undefined;
    }
    let alive = true;
    setCatalogLoading(true);
    (async () => {
      try {
        await refreshCatalog(q);
        if (alive) setError((prev) => (/failed to load products/i.test(String(prev || '')) ? '' : prev));
      } catch (_) {
        // refreshCatalog already sets error
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [locationId, searchQuery, refreshCatalog]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!setFormOpen || !locationId) return undefined;
    if (setPickerProducts.length) return undefined;
    let alive = true;
    (async () => {
      try {
        const data = await fetchCatalog(locationId, '');
        if (alive) setSetPickerProducts(data.products || []);
      } catch {
        if (alive) setSetPickerProducts([]);
      }
    })();
    return () => { alive = false; };
  }, [setFormOpen, locationId, setPickerProducts.length]);

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
            setSearchQuery(code);
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
    if (!searchQuery.trim()) return [];
    const products = (catalog.products || []).map((p) => ({ ...p, type: 'product' }));
    const sets = (catalog.sets || []).map((s) => ({ ...s, type: 'set' }));
    return [...sets, ...products];
  }, [catalog, searchQuery]);

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
            const { data } = await db.auth.getSession();
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

      // Reuse an existing Firebase session (e.g. already signed in via Google on /login).
      try {
        const { data } = await db.auth.getSession();
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
      await startGoogleSignIn({ returnPath: countReturnPath });
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

  const cartByProductId = useMemo(() => {
    const map = new Map();
    (cart || []).forEach((row) => map.set(String(row.product_id), row));
    return map;
  }, [cart]);

  const beginLongPress = (item) => {
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActionItem(item);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => () => cancelLongPress(), []);

  const handleDownloadSample = async () => {
    if (!locationId) {
      setError('Select a location session first.');
      return;
    }
    setImportBusy(true);
    setError('');
    try {
      const data = await fetchImportTemplate(locationId);
      const locName = boundLocation?.name || 'location';
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
      const zeroQtyImports = (result.imported || []).filter((row) => !Number(row.qty)).length;
      const skipPreview = (result.skipped || [])
        .slice(0, 3)
        .map((s) => `${s.sku}: ${s.reason}`)
        .join(' · ');
      let message = `Imported ${result.importedCount}`
        + (result.skippedCount ? ` · skipped ${result.skippedCount}${skipPreview ? ` (${skipPreview})` : ''}` : '');
      if (zeroQtyImports) {
        message += ` · warning: ${zeroQtyImports} row${zeroQtyImports === 1 ? '' : 's'} imported with qty 0`;
      }
      setToast(message);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImportBusy(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleClearMyCart = async () => {
    if (!eventId || !user?.email || cart.length === 0) return;
    if (!window.confirm('Clear only your counted cart for this session? Other users are not affected.')) return;
    setBusy(true);
    setError('');
    try {
      await clearMyCounts(eventId, user.email);
      await refreshCart(user.email, eventId);
      setToast('Your cart was cleared.');
    } catch (err) {
      setError(err.message || 'Failed to clear your cart.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMyProductCount = async (productId) => {
    if (!eventId || !user?.email || !productId) return;
    setBusy(true);
    setError('');
    try {
      await removeMyCount(eventId, productId, user.email);
      await refreshCart(user.email, eventId);
      setToast('Removed from your cart.');
      setActionItem(null);
    } catch (err) {
      setError(err.message || 'Failed to remove this count.');
    } finally {
      setBusy(false);
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
      const created = await createProduct(locationId, {
        name: productForm.name,
        sku: productForm.sku,
        price: Number(productForm.price || 0),
      });
      const term = String(created?.product?.sku || productForm.sku || productForm.name || '').trim();
      setShowProductForm(false);
      setProductForm({ name: '', sku: '', price: '' });
      invalidateStocktakeCatalogCache(locationId);
      setSearch(term);
      await refreshCatalog(term);
      setToast('Product created. Search updated; your cart was kept.');
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
      const created = await createSet(locationId, {
        name: setForm.name,
        sku: setForm.sku,
        price: Number(setForm.price || 0),
        components: setForm.lines.filter((l) => l.product_id),
      });
      const term = String(created?.combo?.sku || created?.set?.sku || setForm.sku || setForm.name || '').trim();
      setSetFormOpen(false);
      setSetForm({ name: '', sku: '', price: '', lines: [{ product_id: '', quantity: 1 }] });
      invalidateStocktakeCatalogCache(locationId);
      setSearch(term);
      await refreshCatalog(term);
      setToast('Set created. Search updated; your cart was kept.');
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

  if (locationLoading) {
    return (
      <div className="stc-page stc-login">
        <div className="stc-card">
          <p className="stc-note">Loading location…</p>
        </div>
      </div>
    );
  }

  if (locationError) {
    return (
      <div className="stc-page stc-login">
        <div className="stc-card">
          <h2>Stock count</h2>
          <div className="stc-error">{locationError}</div>
        </div>
      </div>
    );
  }

  if (!user?.email) {
    return (
      <div className="stc-page stc-login">
        <div className="stc-card">
          <h2>Stock count login</h2>
          <p className="stc-login-lead">
            Sign in to count stock for <strong>{boundLocation?.name || 'this location'}</strong>.
            Use only the count link shared for this location.
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
          <p className="stc-note stc-note-muted" style={{ marginTop: 14 }}>
            Google accounts: use Continue with Google. Bookmark this page for {boundLocation?.name || 'your location'}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stc-page">
      <div className="stc-card">
        <div className="stc-header">
          <button
            type="button"
            className="stc-signout"
            onClick={() => {
              // Sign out only clears local login. Counts stay in the open session until /stocktake submit.
              clearCountUser();
              setUser(null);
            }}
          >
            Sign out
          </button>
          <div className="stc-title">Count stock</div>
          <div className="stc-user">{displayCountUserName(user)}</div>
        </div>

        {waitingForSession ? (
          <div className="stc-warn">
            No counting session is open for <strong>{boundLocation?.name}</strong> yet.
            Keep this page open — when control starts counting for this location, counting will begin automatically.
          </div>
        ) : (
          <div className="stc-location-block">
            <label className="stc-label">Location</label>
            <div className="stc-location-text">
              {boundLocation?.name}
              {event?.is_initial ? ' · first stocktake' : ''}
            </div>
          </div>
        )}

        {error && <div className="stc-error">{error}</div>}

        {canCount && (
          <>
            <hr className="stc-divider" />
            <div className="stc-toolbar">
              <button
                type="button"
                className="stc-toolbar-btn"
                disabled={busy || importBusy || !locationId}
                onClick={handleDownloadSample}
                title="Download sample Excel"
                aria-label="Download sample Excel"
              >
                <FaDownload />
                <span>Sample</span>
              </button>
              <button
                type="button"
                className="stc-toolbar-btn"
                disabled={busy || importBusy}
                onClick={() => importFileRef.current?.click()}
                title="Import Excel quantity"
                aria-label="Import Excel quantity"
              >
                <FaFileImport />
                <span>Import</span>
              </button>
              <button
                type="button"
                className="stc-toolbar-btn"
                disabled={busy}
                onClick={() => {
                  setShowProductForm(true);
                  setSetFormOpen(false);
                }}
              >
                <FaPlus />
                <span>Product</span>
              </button>
              <button
                type="button"
                className="stc-toolbar-btn"
                disabled={busy}
                onClick={() => {
                  setSetFormOpen(true);
                  setShowProductForm(false);
                }}
              >
                <FaPlus />
                <span>Set</span>
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => handleImportExcel(e.target.files?.[0])}
              />
            </div>
            <details className="stc-help-details">
              <summary>Excel import format</summary>
              <p>
                Columns: SKU, Product Name, Quantity. Products/components only (not sets). Quantities apply only to this location.
              </p>
            </details>

            <label className="stc-label">Search or scan</label>
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

            {search.trim() ? (
              <div className="stc-results">
                {catalogLoading ? (
                  <div className="stc-note stc-empty-hint">Searching…</div>
                ) : searchQuery.trim().length < 2 && results.length === 0 ? (
                  <div className="stc-note stc-empty-hint">Type at least 2 characters.</div>
                ) : results.length === 0 ? (
                  <div className="stc-note stc-empty-hint">No matches for this location.</div>
                ) : results.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    className="stc-result"
                    disabled={busy}
                    onPointerDown={() => beginLongPress(item)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActionItem(item);
                    }}
                    onClick={() => {
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false;
                        return;
                      }
                      openPopup(item);
                    }}
                  >
                    {item.type === 'set' && <span className="stc-badge">SET</span>}
                    {item.name || item.combo_name}
                    {item.sku ? ` (${item.sku})` : ''}
                  </button>
                ))}
              </div>
            ) : (
              <div className="stc-note stc-search-hint stc-note-muted">
                Type a product name or SKU to search.
              </div>
            )}
          </>
        )}
      </div>

      {canCount && (
        <div className="stc-card">
          <div className="stc-cart-header">
            <div>
              <div className="stc-section-title">My counts</div>
              <div className="stc-note stc-note-muted">Auto-saved — safe to refresh or close.</div>
            </div>
            <button
              type="button"
              className="stc-mini-danger"
              disabled={busy || cart.length === 0}
              onClick={handleClearMyCart}
              title="Clear my cart"
              aria-label="Clear my cart"
            >
              <FaTrashAlt />
              <span>Clear</span>
            </button>
          </div>
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
                  <tr><td colSpan={3} className="stc-note stc-note-muted">Nothing counted yet.</td></tr>
                ) : cart.map((row) => (
                  <tr
                    key={row.product_id}
                    onPointerDown={() => beginLongPress({ ...row, id: row.product_id, type: 'product' })}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActionItem({ ...row, id: row.product_id, type: 'product' });
                    }}
                  >
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

      {actionItem && (
        <div className="stc-modal-backdrop">
          <div className="stc-modal stc-action-modal">
            <div className="stc-modal-title">Choose action</div>
            <div className="stc-note">
              {actionItem.type === 'set' && <span className="stc-badge">SET</span>}
              {actionItem.name || actionItem.combo_name}
              {actionItem.sku ? ` (${actionItem.sku})` : ''}
            </div>
            <div className="stc-actions stc-actions-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="stc-btn stc-btn-primary"
                disabled={busy}
                onClick={() => {
                  setActionItem(null);
                  openPopup(actionItem);
                }}
              >
                Add qty
              </button>
              {actionItem.type === 'product' && cartByProductId.has(String(actionItem.id || actionItem.product_id)) && (
                <button
                  type="button"
                  className="stc-btn stc-btn-danger"
                  disabled={busy}
                  onClick={() => handleRemoveMyProductCount(actionItem.id || actionItem.product_id)}
                >
                  Remove count
                </button>
              )}
              <button
                type="button"
                className="stc-btn stc-btn-ghost"
                disabled={busy}
                onClick={() => setActionItem(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                  {(setPickerProducts.length ? setPickerProducts : catalog.products || []).map((p) => (
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
