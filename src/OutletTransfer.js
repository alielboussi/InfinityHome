/* eslint-disable no-unused-vars */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import db from './dataClient';
import { useNavigate } from 'react-router-dom';
import { FaFilePdf } from 'react-icons/fa';
import { buildTransferPdf, triggerDownload } from './utils/transferPdf';

/*
  OutletTransfer.js
  Touch-friendly outlet transfer capture page.
  - Transfer number manual entry with on-screen keyboard (not persisted until save)
  - From/To locked to specified outlet locations
  - Auto date/time (display only, captured at save)
  - Product search by name / sku / scanned code
  - Selected products table with +/- and direct qty edit (default 1)
  - Allow adding even if source qty is 0 (we do not block, we just show current qty)
  - Save button navigates to summary with state persisted in localStorage (key: pendingOutletTransfer)
*/

const FROM_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const TO_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const LS_KEY = 'pendingOutletTransfer';
const RETURN_KEY = 'outletTransfer:returnTo';
const ALLOW_PRODUCTS_KEY = 'outletTransfer:allowProducts';
const DRAFT_KEY = 'outletTransfer:draft';
const BUCKET = 'WarehouseTransfers';

const toYMD = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const toDMY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const normalizeDateInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3) {
      const [dd, mm, yy] = parts;
      if (yy && yy.length === 4) {
        return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yy}`;
      }
    }
  }
  if (raw.includes('-')) {
    const parts = raw.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [yy, mm, dd] = parts;
      return `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yy}`;
    }
  }
  return raw;
};

const parseDMY = (value) => {
  const normalized = normalizeDateInput(value);
  if (!normalized || !normalized.includes('/')) return null;
  const parts = normalized.split('/');
  if (parts.length !== 3) return null;
  const [ddRaw, mmRaw, yyRaw] = parts;
  const day = parseInt(ddRaw, 10);
  const month = parseInt(mmRaw, 10);
  const year = parseInt(yyRaw, 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
};

function useNowTick(ms = 1000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// Inline phone-style search keyboard (compact, always fits 1024x768 when shown)
function PhoneSearchKeyboard({ value, onChange, onEnter, onClose }) {
  const rows = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L','-'],
    ['Z','X','C','V','B','N','M','/','.','#']
  ];
  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const [narrow, setNarrow] = useState(false);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function calc() {
      if (!containerRef.current || !innerRef.current) return;
      const avail = containerRef.current.offsetWidth;
      const contentW = innerRef.current.scrollWidth;
      let rawScale = contentW > 0 ? Math.min(1, avail / contentW) : 1;
      if (rawScale < 0.88) rawScale = 0.88;
      const snap = rawScale > 0.995 ? 1 : rawScale;
      setScale(snap);
      setNarrow(avail < 840);
    }
    calc();
    const ro = new ResizeObserver(calc);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', calc);
    return () => { window.removeEventListener('resize', calc); ro.disconnect(); };
  }, []);
  const keyH = narrow ? 40 : 44;
  return (
    <div ref={containerRef} className="wt-inline-kb" data-narrow={narrow ? '1' : '0'} data-scale={scale.toFixed(3)} aria-label="Search Keyboard" style={{ minHeight: 200 }}>
      <div ref={innerRef} style={{ width: '100%', position: 'relative', padding: '0', boxSizing: 'border-box', minHeight: 180 }}>
        <div className="wt-inline-kb-header">
          <span>Search Keyboard</span>
          <button className="wt-kb-close wt-kb-close-abs" onClick={onClose}>x</button>
        </div>
        <div className="wt-inline-kb-rows" style={{ gap: 2, padding: '2px 4px' }}>
          {rows.map((row, i) => (
            <div key={i} className="wt-inline-kb-row" style={{ display: 'flex', flexWrap: 'nowrap' }}>
              {row.map(k => (
                <button
                  key={k}
                  className="wt-kb-key"
                  style={{ height: keyH, flex: '1 1 0', minWidth: 0, margin: '0 1px' }}
                  onPointerDown={(e) => {
                    const el = e.currentTarget; el.classList.add('wt-kb-pressed');
                  }}
                  onPointerUp={(e) => { e.currentTarget.classList.remove('wt-kb-pressed'); }}
                  onPointerLeave={(e) => { e.currentTarget.classList.remove('wt-kb-pressed'); }}
                  onClick={() => onChange(value + k)}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
          <div className="wt-inline-kb-row" style={{ display: 'flex', flexWrap: 'nowrap' }}>
            <button className="wt-kb-key wt-kb-warn" style={{ height: keyH, flex: 1, marginRight: 2 }} onPointerDown={(e) => e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e) => e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e) => e.currentTarget.classList.remove('wt-kb-pressed')} onClick={() => onChange(value.slice(0, -1))}>Bksp</button>
            <button className="wt-kb-key wt-kb-danger" style={{ height: keyH, flex: 1, marginRight: 2 }} onPointerDown={(e) => e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e) => e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e) => e.currentTarget.classList.remove('wt-kb-pressed')} onClick={() => onChange('')}>Clear</button>
            <button className="wt-kb-key wt-kb-primary" style={{ height: keyH, flex: 1 }} onPointerDown={(e) => e.currentTarget.classList.add('wt-kb-pressed')} onPointerUp={(e) => e.currentTarget.classList.remove('wt-kb-pressed')} onPointerLeave={(e) => e.currentTarget.classList.remove('wt-kb-pressed')} onClick={() => { onEnter && onEnter(); onClose(); }}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Numeric pad for transfer number
function PhoneNumPad({ value, onChange, onClose, inline = false }) {
  const wrapRef = useRef(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    function calc() { if (wrapRef.current) { setNarrow(wrapRef.current.offsetWidth < 380); } }
    calc(); window.addEventListener('resize', calc); return () => window.removeEventListener('resize', calc);
  }, []);
  const keyH = narrow ? 50 : 56;
  return (
    <div ref={wrapRef} className={"wt-inline-numpad" + (inline ? ' wt-inline-numpad-inline' : '')} data-narrow={narrow ? '1' : '0'} aria-label="Number Pad">
      <button className="wt-kb-close" style={{ position: 'absolute', top: 6, right: 6 }} onClick={onClose}>x</button>
      <div className="wt-numpad" aria-label="Digits">
        <div className="wt-numpad-row">
          {['1','2','3'].map(d => <button key={d} className="wt-numpad-btn" onClick={() => onChange(value + d)}>{d}</button>)}
        </div>
        <div className="wt-numpad-row">
          {['4','5','6'].map(d => <button key={d} className="wt-numpad-btn" onClick={() => onChange(value + d)}>{d}</button>)}
        </div>
        <div className="wt-numpad-row">
          {['7','8','9'].map(d => <button key={d} className="wt-numpad-btn" onClick={() => onChange(value + d)}>{d}</button>)}
        </div>
        <div className="wt-numpad-row">
          <button className="wt-numpad-btn wt-wide" onClick={() => onChange(value + '0')}>0</button>
        </div>
        <div className="wt-numpad-actions">
          <button className="wt-numpad-btn wt-danger" onClick={() => onChange('')}>Clear</button>
          <button className="wt-numpad-btn wt-warn" onClick={() => onChange(value.slice(0, -1))}>Bksp</button>
          <button className="wt-numpad-btn wt-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export default function OutletTransfer() {
  const navigate = useNavigate();
  const now = useNowTick();
  const [transferNumber, setTransferNumber] = useState('');
  const [transferDate, setTransferDate] = useState(() => toDMY(new Date()));
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItemsMap, setComboItemsMap] = useState(new Map());
  const [inventory, setInventory] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const searchRef = useRef(null);
  const transferInputRef = useRef(null);
  const [activeKeyboard, setActiveKeyboard] = useState(null);
  const [lastAdded, setLastAdded] = useState(null);
  const highlightTimerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [pageScale, setPageScale] = useState(1);
  const [fromLocationName, setFromLocationName] = useState('');
  const [toLocationName, setToLocationName] = useState('');
  const [transferHistory, setTransferHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [company, setCompany] = useState(null);
  const [pdfBusyId, setPdfBusyId] = useState('');
  const [pdfError, setPdfError] = useState('');

  const fromLabel = fromLocationName || FROM_LOCATION_ID;
  const toLabel = toLocationName || TO_LOCATION_ID;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await db
          .from('locations')
          .select('id, name')
          .in('id', [FROM_LOCATION_ID, TO_LOCATION_ID]);
        const fromLoc = (data || []).find(l => String(l.id) === String(FROM_LOCATION_ID));
        const toLoc = (data || []).find(l => String(l.id) === String(TO_LOCATION_ID));
        setFromLocationName(fromLoc?.name || '');
        setToLocationName(toLoc?.name || '');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await db.from('company_settings').select('*').single();
        setCompany(data || null);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      if (w <= 1024) { setScale(1); setPageScale(1); }
      else if (w > 1600) { setScale(1.1); setPageScale(1); } else { setScale(1); setPageScale(1); }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pageScale]);

  // Restore draft when returning from Products; otherwise start clean
  useEffect(() => {
    let restored = false;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && Array.isArray(draft.selected)) {
          setSelected(draft.selected);
          setTransferNumber(draft.transferNumber || '');
          setTransferDate(normalizeDateInput(draft.transferDate || toDMY(new Date())));
          restored = true;
        }
      }
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.removeItem(ALLOW_PRODUCTS_KEY);
    } catch {}
    if (!restored) {
      localStorage.removeItem(LS_KEY);
      setTransferNumber('');
      setSelected([]);
      setTransferDate(toDMY(new Date()));
    }
  }, []);

  useEffect(() => {
    try {
      const payload = JSON.stringify({ transferNumber, transferDate, selected });
      sessionStorage.setItem(DRAFT_KEY, payload);
    } catch {}
  }, [transferNumber, transferDate, selected]);

  // Navigation lock: keep user on /Kitwe-Lusaka while this component is mounted
  useEffect(() => {
    if (window.location.pathname !== '/Kitwe-Lusaka') return;
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    function guardFactory(fn) {
      return function (state, title, url) {
        try {
          if (typeof url === 'string') {
            const a = document.createElement('a'); a.href = url;
            let allowProducts = false;
            try { allowProducts = sessionStorage.getItem(ALLOW_PRODUCTS_KEY) === '1'; } catch {}
            const allowed = ['/Kitwe-Lusaka', '/Kitwe-Lusaka-summary', '/dashboard', ...(allowProducts ? ['/products'] : [])];
            if (a.origin === window.location.origin && !allowed.includes(a.pathname)) {
              setTimeout(() => { if (window.location.pathname !== '/Kitwe-Lusaka') window.location.replace('/Kitwe-Lusaka'); }, 0);
              return;
            }
          }
        } catch {}
        return fn.apply(window.history, arguments);
      };
    }
    window.history.pushState = guardFactory(origPush);
    window.history.replaceState = guardFactory(origReplace);
    const popHandler = () => {
      let allowProducts = false;
      try { allowProducts = sessionStorage.getItem(ALLOW_PRODUCTS_KEY) === '1'; } catch {}
      const allowed = ['/Kitwe-Lusaka', '/Kitwe-Lusaka-summary', '/dashboard', ...(allowProducts ? ['/products'] : [])];
      if (!allowed.includes(window.location.pathname)) {
        window.location.replace('/Kitwe-Lusaka');
      }
    };
    window.addEventListener('popstate', popHandler);
    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', popHandler);
    };
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const [{ data: prods }, { data: inv }, { data: cbs }] = await Promise.all([
        db.from('products').select('id,name,sku'),
        db.from('inventory').select('product_id,location,quantity').in('location', [FROM_LOCATION_ID, TO_LOCATION_ID]),
        db.from('combos').select('id,combo_name,sku')
      ]);
      setProducts(prods || []);
      setInventory(inv || []);
      setCombos(cbs || []);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // Fetch product catalog + combos + inventory for source/destination
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  useEffect(() => {
    let active = true;
    (async () => {
      setHistoryLoading(true);
      setHistoryError('');
      try {
        const { data, error } = await db
          .from('stock_transfer_sessions')
          .select('id, transfer_date, created_at, transfer_datetime, delivery_number, total_qty, status, notes, metadata, pdf_url')
          .eq('from_location', FROM_LOCATION_ID)
          .eq('to_location', TO_LOCATION_ID)
          .order('created_at', { ascending: false })
          .limit(12);
        if (error) throw error;
        if (active) setTransferHistory(data || []);
      } catch (err) {
        if (active) {
          setHistoryError(err?.message || 'Failed to load transfer history.');
          setTransferHistory([]);
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function ensureComboItemsLoaded(combo) {
    if (comboItemsMap.has(combo.id)) return comboItemsMap.get(combo.id);
    const { data: items } = await db
      .from('combo_items')
      .select('product_id,quantity, products(name,sku)')
      .eq('combo_id', combo.id);
    const mapped = (items || []).map(it => ({ product_id: it.product_id, quantity: it.quantity, name: it.products?.name, sku: it.products?.sku }));
    setComboItemsMap(prev => { const n = new Map(prev); n.set(combo.id, mapped); return n; });
    return mapped;
  }

  const filteredProducts = products.filter(p => {
    if (!search.trim()) return false;
    const s = search.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(s)) || (p.sku && p.sku.toLowerCase().includes(s)) || p.id === search.trim();
  }).slice(0, 30);
  const filteredCombos = combos.filter(c => {
    if (!search.trim()) return false;
    const s = search.toLowerCase();
    return (c.combo_name && c.combo_name.toLowerCase().includes(s)) || (c.sku && c.sku.toLowerCase().includes(s));
  }).slice(0, 20);
  const filtered = [...filteredCombos.map(c => ({ ...c, _type: 'combo' })), ...filteredProducts.map(p => ({ ...p, _type: 'product' }))];

  function beep() {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 660;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.start(); o.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  function addProduct(p) {
    setSelected(prev => {
      const existing = prev.find(x => x.kind === 'product' && x.product_id === p.id);
      if (existing) {
        return prev.map(x => x.kind === 'product' && x.product_id === p.id ? { ...x, qty: x.qty + 1 } : x);
      }
      return [...prev, { id: p.id, kind: 'product', product_id: p.id, sku: p.sku, name: p.name, qty: 1 }];
    });
    setSearch('');
    if (searchRef.current) searchRef.current.focus();
    setLastAdded(p.id);
    beep();
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setLastAdded(null), 1500);
  }

  async function addSet(combo) {
    const items = await ensureComboItemsLoaded(combo);
    setSelected(prev => {
      const parent = prev.find(l => l.kind === 'set-parent' && l.combo_id === combo.id);
      if (parent) {
        const newQty = parent.qty + 1;
        return prev.map(l => {
          if (l.kind === 'set-parent' && l.combo_id === combo.id) return { ...l, qty: newQty };
          if (l.kind === 'set-component' && l.parent_combo_id === combo.id) return { ...l, qty: l.per_set_qty * newQty };
          return l;
        });
      }
      const parentLine = { id: `set:${combo.id}`, kind: 'set-parent', combo_id: combo.id, name: combo.combo_name, sku: combo.sku, qty: 1 };
      const componentLines = items.map(it => ({ id: `set:${combo.id}:p:${it.product_id}`, kind: 'set-component', parent_combo_id: combo.id, product_id: it.product_id, name: it.name, sku: it.sku, per_set_qty: it.quantity, qty: it.quantity }));
      return [...prev, parentLine, ...componentLines];
    });
    setSearch('');
    if (searchRef.current) searchRef.current.focus();
    beep();
  }

  function updateQtyForLine(lineId, delta) {
    let parentChangedCombo = null;
    setSelected(prev => {
      const updated = prev.map(l => {
        if (l.id === lineId) {
          if (l.kind === 'set-parent') {
            parentChangedCombo = l.combo_id;
            const newQty = Math.max(0, l.qty + delta);
            return { ...l, qty: newQty };
          }
          if (l.kind === 'product') return { ...l, qty: Math.max(0, l.qty + delta) };
        }
        return l;
      });
      if (parentChangedCombo !== null) {
        return updated.map(l => {
          if (l.kind === 'set-component' && l.parent_combo_id === parentChangedCombo) {
            const parent = updated.find(p => p.kind === 'set-parent' && p.combo_id === parentChangedCombo);
            if (parent) return { ...l, qty: l.per_set_qty * parent.qty };
          }
          return l;
        });
      }
      return updated;
    });
  }

  function setQtyForLine(lineId, val) {
    const num = Number(val); if (!Number.isFinite(num) || num < 0) return;
    setSelected(prev => prev.map(l => {
      if (l.id === lineId) {
        if (l.kind === 'set-parent') return { ...l, qty: num };
        if (l.kind === 'product') return { ...l, qty: num };
      }
      return l;
    }));
    setSelected(prev => prev.map(l => {
      if (l.kind === 'set-component') {
        const parent = prev.find(p => p.kind === 'set-parent' && p.combo_id === l.parent_combo_id);
        if (parent) return { ...l, qty: l.per_set_qty * parent.qty };
      }
      return l;
    }));
  }

  function removeLine(line) {
    if (line.kind === 'set-parent') {
      setSelected(prev => prev.filter(l => !(l.kind === 'set-parent' && l.combo_id === line.combo_id) && !(l.kind === 'set-component' && l.parent_combo_id === line.combo_id)));
    } else if (line.kind === 'product') {
      setSelected(prev => prev.filter(l => !(l.kind === 'product' && l.product_id === line.product_id)));
    }
  }

  const grandTotal = selected.filter(x => x.kind !== 'set-parent').reduce((s, x) => s + (Number(x.qty) || 0), 0);

  function handleAddNewProduct() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ transferNumber, transferDate, selected }));
      sessionStorage.setItem(RETURN_KEY, '/Kitwe-Lusaka');
      sessionStorage.setItem(ALLOW_PRODUCTS_KEY, '1');
    } catch {}
    navigate('/products?return=/Kitwe-Lusaka');
  }

  function handleSave() {
    if (!selected.length) { alert('Add at least one product'); return; }
    const nowDate = new Date();
    let capturedAt = nowDate;
    const parsedDate = parseDMY(transferDate);
    if (parsedDate) {
      capturedAt = new Date(nowDate);
      capturedAt.setFullYear(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    }
    const payload = {
      transferNumber: transferNumber.trim(),
      from: FROM_LOCATION_ID,
      to: TO_LOCATION_ID,
      transferDate: normalizeDateInput(transferDate) || null,
      capturedAt: capturedAt.toISOString(),
      items: selected.filter(i => (i.kind === 'set-parent') || (Number(i.qty) || 0) > 0)
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    navigate('/Kitwe-Lusaka-summary');
  }

  function sourceQty(pid) {
    const row = inventory.find(r => r.product_id === pid && r.location === FROM_LOCATION_ID);
    return row ? Number(row.quantity) || 0 : 0;
  }

  function handleSearchKey(e) {
    if (e.key === 'Enter') {
      if (filtered.length > 0) {
        const first = filtered[0];
        if (first._type === 'combo') addSet(first); else addProduct(first);
      }
    }
  }

  function parseHistoryMeta(row) {
    if (!row) return {};
    let meta = row.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch {}
    }
    if (!meta && typeof row.notes === 'string') {
      try { meta = JSON.parse(row.notes); } catch {}
    }
    return meta && typeof meta === 'object' ? meta : {};
  }

  function getHistoryTransferNumber(row) {
    const meta = parseHistoryMeta(row);
    return row?.delivery_number || meta?.transfer_number || '';
  }

  function getHistoryStatus(row) {
    const meta = parseHistoryMeta(row);
    return String(meta?.status || row?.status || '').trim();
  }

  function formatHistoryDate(row) {
    const raw = row?.transfer_datetime || row?.created_at || row?.transfer_date;
    if (!raw) return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString();
  }

  function getHistoryPdfFileName(row) {
    const raw = row?.transfer_datetime || row?.transfer_date || row?.created_at || new Date().toISOString();
    const datePart = new Date(raw).toISOString().slice(0, 10);
    return `Outlet_Transfer_${datePart}.pdf`;
  }

  async function uploadHistoryPdf(sessionId, pdfBlob, fileName, transferNumber) {
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    let pdfUrl = null;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-pdf', sessionId, fileName, pdfBase64 }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (resp.ok) {
        const json = await resp.json();
        pdfUrl = json.publicUrl || null;
      }
    } catch {}

    if (!pdfUrl) {
      try {
        const path = `${sessionId}/${fileName}`;
        const { error: upErr } = await db.storage
          .from(BUCKET)
          .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });
        if (!upErr) {
          const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
          pdfUrl = pub?.publicUrl || null;
        }
      } catch {}
    }

    if (pdfUrl) {
      try {
        const updatePayload = {
          pdf_url: pdfUrl,
          metadata: { pdf_url: pdfUrl, transfer_number: transferNumber || null },
          notes: JSON.stringify({ pdf_url: pdfUrl, transfer_number: transferNumber || null })
        };
        await db.from('stock_transfer_sessions').update(updatePayload).eq('id', sessionId);
      } catch {}
    }

    return pdfUrl;
  }

  async function handleHistoryPdf(row) {
    if (!row?.id) return;
    const sessionId = String(row.id);
    if (pdfBusyId) return;
    setPdfBusyId(sessionId);
    setPdfError('');
    try {
      const fileName = getHistoryPdfFileName(row);

      const { data: entryRows, error: entryErr } = await db
        .from('stock_transfer_entries')
        .select('product_id, quantity')
        .eq('session_id', sessionId);
      if (entryErr) throw entryErr;

      const qtyByProduct = new Map();
      (entryRows || []).forEach((rowEntry) => {
        if (!rowEntry?.product_id) return;
        const pid = String(rowEntry.product_id);
        const prev = qtyByProduct.get(pid) || 0;
        qtyByProduct.set(pid, prev + (Number(rowEntry.quantity) || 0));
      });
      const productIds = Array.from(qtyByProduct.keys());
      if (!productIds.length) throw new Error('No items to export.');

      const { data: prodRows, error: prodErr } = await db
        .from('products')
        .select('id, name, sku')
        .in('id', productIds);
      if (prodErr) throw prodErr;
      const prodMap = new Map((prodRows || []).map(p => [String(p.id), p]));

      const items = productIds.map(pid => ({
        product_id: pid,
        name: prodMap.get(pid)?.name || pid,
        sku: prodMap.get(pid)?.sku || '',
        qty: qtyByProduct.get(pid) || 0,
        kind: 'product',
      })).filter(item => Number(item.qty) > 0);

      const { data: invRows } = await db
        .from('inventory')
        .select('product_id, location, quantity')
        .in('product_id', productIds)
        .in('location', [FROM_LOCATION_ID, TO_LOCATION_ID]);

      const srcCur = new Map();
      const dstCur = new Map();
      (invRows || []).forEach((r) => {
        const qty = Number(r.quantity) || 0;
        if (r.location === FROM_LOCATION_ID) srcCur.set(String(r.product_id), qty);
        if (r.location === TO_LOCATION_ID) dstCur.set(String(r.product_id), qty);
      });

      const remainingSrcMap = new Map();
      const destCurrentMap = new Map();
      productIds.forEach(pid => {
        remainingSrcMap.set(pid, srcCur.get(pid) ?? 0);
        destCurrentMap.set(pid, dstCur.get(pid) ?? 0);
      });

      const transferNumber = getHistoryTransferNumber(row);
      const capturedAt = row.transfer_datetime || row.transfer_date || row.created_at;
      const pdfBlob = await buildTransferPdf({
        title: 'Kitwe To Lusaka Transfer',
        transferNumber,
        capturedAt,
        fromLabel,
        toLabel,
        fromName: fromLocationName || fromLabel,
        toName: toLocationName || toLabel,
        items,
        remainingSrcMap,
        destCurrentMap,
        company,
      });

      const pdfUrl = await uploadHistoryPdf(sessionId, pdfBlob, fileName, transferNumber);
      if (pdfUrl) {
        await triggerDownload(pdfUrl, fileName, true);
      } else {
        const fallbackUrl = URL.createObjectURL(pdfBlob);
        await triggerDownload(fallbackUrl, fileName, false);
        setTimeout(() => { try { URL.revokeObjectURL(fallbackUrl); } catch {} }, 1500);
      }
    } catch (err) {
      setPdfError(err?.message || 'Failed to create PDF.');
    } finally {
      setPdfBusyId('');
    }
  }


  return (
    <>
      <div className="wt-page-bg" />
      <div className="wt-wrapper" style={{ transform: `scale(${pageScale})`, transformOrigin: 'top center' }}>
        <h1 className="wt-title">Kitwe To Lusaka Transfer Entry</h1>
        <div className="wt-grid-top">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label className="wt-label">Transfer # (Manual)</label>
            <div className="wt-transfer-group">
              <input
                ref={transferInputRef}
                value={transferNumber}
                onChange={e => {
                  let v = e.target.value.replace(/[^0-9-]/g, '');
                  const firstDash = v.indexOf('-');
                  if (firstDash !== -1) {
                    v = v.slice(0, firstDash + 1) + v.slice(firstDash + 1).replace(/-/g, '');
                  }
                  setTransferNumber(v);
                }}
                className="wt-input wt-input-compact"
                placeholder="Enter transfer reference"
                inputMode="numeric"
                onFocus={() => { setActiveKeyboard('numpad'); }}
              />
              <button
                type="button"
                aria-label="Show Number Pad"
                onClick={() => {
                  setActiveKeyboard(k => k === 'numpad' ? null : 'numpad');
                  setTimeout(() => transferInputRef.current?.focus(), 0);
                }}
                className="wt-btn wt-btn-compact wt-btn-numpad"
              ><span>123</span></button>
              {activeKeyboard === 'numpad' && (
                <div className="wt-floating-numpad">
                  <PhoneNumPad
                    value={transferNumber}
                    onChange={setTransferNumber}
                    onClose={() => setActiveKeyboard(null)}
                    inline
                  />
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: '2cm', alignItems: 'flex-end', flexWrap: 'nowrap' }}>
              <div style={{ maxWidth: 220, flex: '0 0 220px' }}>
                <label className="wt-label" style={{ textAlign: 'center' }}>Grand Qty</label>
                <div className="wt-lock-box wt-grand-small" style={{ justifyContent: 'center' }}>{grandTotal}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label className="wt-label">From (Locked)</label>
            <div className="wt-lock-box">{fromLabel}</div>
            <label className="wt-label">To (Locked)</label>
            <div className="wt-lock-box">{toLabel}</div>
            <label className="wt-label">Transfer Date</label>
            <input
              type="text"
              className="wt-input wt-input-compact"
              value={transferDate}
              placeholder="dd/mm/yyyy"
              inputMode="numeric"
              maxLength={10}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9/]/g, '');
                setTransferDate(raw);
              }}
              onBlur={() => setTransferDate(normalizeDateInput(transferDate))}
            />
            <label className="wt-label">Current Time</label>
            <div className="wt-lock-box">{now.toLocaleTimeString()}</div>
          </div>
        </div>
        <div className="wt-search-wide">
          <label className="wt-label">Product Search / Scan</label>
          <div className="wt-flex wt-gap-8">
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              className="wt-input wt-input-wide"
              placeholder="Type name, SKU or scan code"
              enterKeyHint="search"
              autoComplete="off"
            />
            <button
              type="button"
              aria-label="Show Search Keyboard"
              onClick={() => { setActiveKeyboard(k => k === 'search' ? null : 'search'); setTimeout(() => searchRef.current?.focus(), 0); }}
              className="wt-btn wt-btn-compact"
            >KB</button>
            <button
              type="button"
              onClick={loadCatalog}
              className="wt-btn"
              disabled={catalogLoading}
            >
              {catalogLoading ? 'Refreshing...' : 'Refresh List'}
            </button>
            <button
              type="button"
              onClick={handleAddNewProduct}
              className="wt-btn wt-btn-warn"
            >Add Product</button>
          </div>
          {activeKeyboard === 'search' && (
            <div className="wt-inline-kb-wrapper" style={{ marginTop: 12 }}>
              <PhoneSearchKeyboard
                value={search}
                onChange={setSearch}
                onEnter={() => { if (filtered.length > 0) addProduct(filtered[0]); }}
                onClose={() => setActiveKeyboard(null)}
              />
            </div>
          )}
          {search.trim() && (
            <div className="wt-search-results">
              {filtered.length === 0 && <div className="wt-search-empty">No matches</div>}
              {filtered.map(p => (
                <div key={(p._type === 'combo' ? 'combo:' : 'prod:') + p.id} className="wt-search-row" onClick={() => p._type === 'combo' ? addSet(p) : addProduct(p)}>
                  <b>{p._type === 'combo' ? '[SET] ' + p.combo_name : p.name}</b> <span className="wt-search-sku">{p.sku}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="wt-selected-wrapper">
          <h2 style={{ margin: '0 0 12px' }}>Selected Products</h2>
          <div className="wt-selected-table-wrapper">
            <table className="wt-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr style={{ background: '#23272f' }}>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Source Qty</th>
                  <th>Transfer Qty</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {selected.map(item => {
                  const isParent = item.kind === 'set-parent';
                  const isComponent = item.kind === 'set-component';
                  const highlight = item.kind === 'product' && item.product_id === lastAdded;
                  return (
                    <tr key={item.id || item.product_id} className={highlight ? 'wt-row-highlight' : (isParent ? 'wt-row-parent' : 'wt-row-default')} style={{ transition: 'background 0.3s' }}>
                      <td style={{ paddingLeft: isComponent ? 28 : 8, fontStyle: isParent ? 'italic' : 'normal' }}>
                        {isComponent ? '-> ' + item.name : item.name}{isParent ? ' (Set)' : ''}
                      </td>
                      <td>{item.sku || '-'}</td>
                      <td>{item.product_id ? sourceQty(item.product_id) : '-'}</td>
                      <td>
                        {isComponent ? (
                          <div style={{ textAlign: 'center' }}>{item.qty}</div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <button className="wt-qty-btn" onClick={() => updateQtyForLine(item.id, -1)}>-</button>
                            <input type="number" value={item.qty} onChange={e => setQtyForLine(item.id, e.target.value)} style={{ width: 80, textAlign: 'center', padding: 6, borderRadius: 6, border: '1px solid #00b4d8', background: '#111', color: '#e0e6ed' }} />
                            <button className="wt-qty-btn" onClick={() => updateQtyForLine(item.id, 1)}>+</button>
                          </div>
                        )}
                      </td>
                      <td>
                        {isComponent ? <span style={{ opacity: 0.4 }}>-</span> : (
                          <button aria-label="Remove" onClick={() => removeLine(item)} className="wt-qty-btn" style={{ background: '#e74c3c', padding: '6px 10px' }}>X</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {selected.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#8ab' }}>No products yet.</td></tr>
                )}
              </tbody>
              {selected.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#23272f', fontWeight: 'bold' }}>
                    <td style={{ textAlign: 'right' }} colSpan={4}>Grand Total</td>
                    <td>{grandTotal}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        <div className="wt-bottom-actions">
          <button onClick={handleSave} className="wt-btn wt-btn-primary">Save and Review</button>
          {selected.length > 0 && (
            <button onClick={() => {
              if (window.confirm('Clear all selected products?')) {
                setSelected([]);
                try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
              }
            }} className="wt-btn wt-btn-danger">Clear All</button>
          )}
        </div>
        <div style={{ marginTop: 24 }}>
          <h2 style={{ margin: '0 0 12px' }}>Recent Transfers</h2>
          {pdfError && <div style={{ color: '#e74c3c', marginBottom: 8 }}>{pdfError}</div>}
          {historyLoading ? (
            <div style={{ color: '#9aa4b2' }}>Loading transfer history...</div>
          ) : historyError ? (
            <div style={{ color: '#e74c3c' }}>{historyError}</div>
          ) : transferHistory.length === 0 ? (
            <div style={{ color: '#9aa4b2' }}>No transfers yet.</div>
          ) : (
            <div className="wt-history-scroll">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {transferHistory.map((row) => {
                  const transferNo = getHistoryTransferNumber(row);
                  const status = getHistoryStatus(row) || 'unknown';
                  const statusColor = status.toLowerCase() === 'approved'
                    ? '#43aa8b'
                    : status.toLowerCase() === 'pending'
                      ? '#f4d35e'
                      : '#9aa4b2';
                  const totalQty = Number(row?.total_qty);
                  const pdfBusy = pdfBusyId === String(row.id);
                  return (
                    <div
                      key={row.id}
                      style={{
                        background: '#23272f',
                        border: '1px solid #1f3b4d',
                        borderRadius: 12,
                        padding: 12,
                        boxShadow: '0 8px 18px rgba(0,0,0,0.35)'
                      }}
                    >
                      <div className="wt-history-card-head">
                        <div className="wt-history-card-title">{transferNo ? `#${transferNo}` : `#${row.id}`}</div>
                        <div className="wt-history-card-actions">
                          <button
                            type="button"
                            className="wt-history-pdf"
                            aria-label="Download transfer PDF"
                            title={pdfBusy ? 'Preparing PDF...' : 'Download PDF'}
                            disabled={pdfBusy}
                            onClick={() => handleHistoryPdf(row)}
                          >
                            <FaFilePdf aria-hidden="true" />
                          </button>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: statusColor }}>{status}</div>
                        </div>
                      </div>
                      <div style={{ color: '#9aa4b2', fontSize: '0.85rem', marginTop: 6 }}>{formatHistoryDate(row)}</div>
                      <div style={{ marginTop: 8 }}>Total Qty: <b>{Number.isFinite(totalQty) ? totalQty : '-'}</b></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {(!activeKeyboard || activeKeyboard === 'numpad') && (
          <div className="wt-bottom-bar">
            <div className="wt-bottom-bar-inner">
              <div>Lines: <b>{selected.length}</b></div>
              <div>Total Qty: <b>{grandTotal}</b></div>
              <div style={{ opacity: 0.6 }}>From: {fromLabel} {'->'} To: {toLabel}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
