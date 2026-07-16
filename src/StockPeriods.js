import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import supabase from './supabase';
import { fromPublic } from './dbSchema';
import BackToDashboard from './BackToDashboard';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { applyInventoryBulk } from './utils/inventoryApi';

const PERIOD_STATUS_OPEN = 'open';
const PERIOD_STATUS_CLOSED = 'closed';
const PERIOD_STATUS_LOCKED = 'open_locked';
const STOCKTAKE_SUMMARY_ONLY = true;
const ADMIN_USER_ID = 1;

const toNumber = (val) => {
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
};

const uniqueIds = (list = []) => Array.from(new Set(list.filter(Boolean).map(id => String(id))));

const chunkList = (list = [], size = 50) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
};

const toYMD = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const formatNumber = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  const hasDecimals = Math.abs(num % 1) > 0.000001;
  return num.toLocaleString(undefined, hasDecimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);
};

const initialNewProductForm = {
  name: '',
  sku: '',
  sku_type: 'auto',
  cost_price: '',
  price: '',
  promotional_price: '',
  currency: '',
  category_id: '',
  unit_of_measure_id: '',
  locations: [],
  image: null,
  opening_qty: '',
};


export default function StockPeriods() {
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [period, setPeriod] = useState(null);
  const [openingSaved, setOpeningSaved] = useState(false);
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItemsMap, setComboItemsMap] = useState(new Map());
  const [openingDraft, setOpeningDraft] = useState({});
  const [closingDraft, setClosingDraft] = useState({});
  const [openingItems, setOpeningItems] = useState([]);
  const [openingSessionTotals, setOpeningSessionTotals] = useState({});
  const [closingSessionTotals, setClosingSessionTotals] = useState({});
  const [openingDraftDirty, setOpeningDraftDirty] = useState(false);
  const [closingDraftDirty, setClosingDraftDirty] = useState(false);
  const [closingMode, setClosingMode] = useState(false);
  const [openingEditId, setOpeningEditId] = useState('');
  const [openingEditValue, setOpeningEditValue] = useState('');
  const [openingEditSaving, setOpeningEditSaving] = useState(false);
  const [openingHiddenIds, setOpeningHiddenIds] = useState([]);
  const [openingAddOpen, setOpeningAddOpen] = useState(false);
  const [openingAddBusy, setOpeningAddBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [searchClosing, setSearchClosing] = useState('');
  const [searchVariance, setSearchVariance] = useState('');
  const [newProductForm, setNewProductForm] = useState(initialNewProductForm);
  const [newProductSaving, setNewProductSaving] = useState(false);
  const [newProductError, setNewProductError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [lastClosedPeriod, setLastClosedPeriod] = useState(null);
  const [trackingRows, setTrackingRows] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [varianceExpanded, setVarianceExpanded] = useState(true);
  const fileInputRef = useRef(null);
  const [adminUserId, setAdminUserId] = useState(0);

  const currencyOptions = useMemo(() => ([
    { code: 'K', name: 'K' },
    { code: 'USD', name: '$' },
  ]), []);

  const productsById = useMemo(() => {
    const map = new Map();
    (products || []).forEach(p => map.set(String(p.id), p));
    return map;
  }, [products]);

  const productsBySku = useMemo(() => {
    const map = new Map();
    (products || []).forEach(p => {
      const skuKey = String(p.sku || '').trim().toLowerCase();
      if (skuKey) map.set(skuKey, p);
    });
    return map;
  }, [products]);

  const getCanonicalProductInfo = useCallback((productId) => {
    const pid = String(productId || '');
    const byId = productsById.get(pid);
    if (byId) {
      const skuKey = String(byId.sku || '').trim().toLowerCase();
      const bySku = skuKey ? productsBySku.get(skuKey) : null;
      return {
        id: pid,
        name: bySku?.name || byId.name || pid,
        sku: byId.sku || bySku?.sku || '',
      };
    }
    const fallbackSkuKey = pid.trim().toLowerCase();
    const bySku = fallbackSkuKey ? productsBySku.get(fallbackSkuKey) : null;
    if (bySku) {
      return {
        id: String(bySku.id),
        name: bySku.name || pid,
        sku: bySku.sku || pid,
      };
    }
    return { id: pid, name: pid, sku: '' };
  }, [productsById, productsBySku]);

  const getProductDisplayLabel = useCallback((productId) => {
    const info = getCanonicalProductInfo(productId);
    return `${info.name}${info.sku ? ` (${info.sku})` : ''}`;
  }, [getCanonicalProductInfo]);

  const fetchProductsByIds = useCallback(async (ids) => {
    const unique = uniqueIds(ids || []);
    if (!unique.length) return [];
    const batches = chunkList(unique);
    const merged = new Map();
    for (const batch of batches) {
      const { data, error } = await fromPublic('products')
        .select('id, name, sku')
        .in('id', batch);
      if (error) throw error;
      (data || []).forEach(row => {
        if (!row?.id) return;
        merged.set(String(row.id), row);
      });
    }
    const result = Array.from(merged.values());
    if (result.length) {
      setProducts(prev => {
        const existing = new Set((prev || []).map(p => String(p.id)));
        const next = [...(prev || [])];
        result.forEach(p => {
          if (!existing.has(String(p.id))) next.push(p);
        });
        return next;
      });
    }
    return result;
  }, []);

  const ensureProductsLoadedForIds = useCallback(async (ids) => {
    const missing = (ids || []).filter(id => !productsById.has(String(id)));
    if (!missing.length) return;
    await fetchProductsByIds(missing);
  }, [fetchProductsByIds, productsById]);

  const isPeriodOpen = period && period.status === PERIOD_STATUS_OPEN;
  const isPeriodLocked = period && period.status === PERIOD_STATUS_LOCKED;
  const isAdminUser = Number(adminUserId) === ADMIN_USER_ID;
  const trackingStartAt = isPeriodLocked
    ? (period.opened_at || period.updated_at)
    : null;

  useEffect(() => {
    (async () => {
      const [{ data: locData }, { data: catData }, { data: unitData }] = await Promise.all([
        supabase.from('locations').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('unit_of_measure').select('id, name, abbreviation').order('created_at', { ascending: false }),
      ]);
      setLocations(locData || []);
      setCategories(catData || []);
      setUnits(unitData || []);
    })();
  }, []);

  useEffect(() => {
    const readUserId = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return 0;
        const parsed = JSON.parse(raw);
        const id = Number(parsed?.id || 0);
        return Number.isFinite(id) ? id : 0;
      } catch {
        return 0;
      }
    };
    const fallbackId = readUserId('user');
    setAdminUserId(fallbackId || 0);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const fetchCatalog = useCallback(async (locId) => {
    if (!locId) return { products: [], combos: [] };
    const [{ data: prodData, error: prodErr }, { data: comboData, error: comboErr }] = await Promise.all([
      fromPublic('products').select('id, name, sku, price, promotional_price').order('name'),
      fromPublic('combos').select('id, combo_name, sku').order('combo_name'),
    ]);
    if (prodErr) throw prodErr;
    if (comboErr) throw comboErr;
    return { products: prodData || [], combos: comboData || [] };
  }, []);

  const ensureComboItemsLoaded = useCallback(async (combo) => {
    if (!combo?.id) return [];
    if (comboItemsMap.has(combo.id)) return comboItemsMap.get(combo.id);
    const { data, error } = await fromPublic('combo_items')
      .select('product_id, quantity, products(name, sku)')
      .eq('combo_id', combo.id);
    if (error) throw error;
    const mapped = (data || []).map(it => ({
      product_id: it.product_id,
      quantity: toNumber(it.quantity),
      name: it.products?.name,
      sku: it.products?.sku,
    }));
    setComboItemsMap(prev => {
      const next = new Map(prev);
      next.set(combo.id, mapped);
      return next;
    });
    return mapped;
  }, [comboItemsMap]);

  const getApiBase = useCallback(() => {
    const base = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
    if (!base) return '';
    return base.replace(/\/+$/, '');
  }, []);

  const shouldUseApi = useCallback(() => {
    const apiBase = getApiBase();
    if (apiBase) return true;
    return process.env.NODE_ENV === 'production';
  }, [getApiBase]);

  const postProductLocations = useCallback(async (rows) => {
    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}/api/product-locations` : '/api/product-locations';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'Failed to save product locations.');
    }
    return data || {};
  }, [getApiBase]);

  const getLocationProductIds = useCallback(async (locId) => {
    if (!locId) return [];
    const [{ data: invRows }, { data: locRows }] = await Promise.all([
      fromPublic('inventory').select('product_id, location').eq('location', locId),
      fromPublic('product_locations').select('product_id, location_id').eq('location_id', locId),
    ]);
    const ids = new Set();
    (invRows || []).forEach(r => { if (r.product_id) ids.add(String(r.product_id)); });
    (locRows || []).forEach(r => { if (r.product_id) ids.add(String(r.product_id)); });
    return Array.from(ids);
  }, []);

  const applyInventoryQuantities = useCallback(async (locId, entries) => {
    if (!locId || entries.length === 0) return;
    const [{ data: invRows, error: invErr }, { data: locRows, error: locErr }] = await Promise.all([
      fromPublic('inventory')
        .select('id, product_id')
        .eq('location', locId),
      fromPublic('product_locations')
        .select('product_id, location_id')
        .eq('location_id', locId),
    ]);
    if (invErr) throw invErr;
    if (locErr) throw locErr;

    const rowsByProduct = new Map();
    (invRows || []).forEach(r => {
      if (!r.product_id) return;
      const key = String(r.product_id);
      if (!rowsByProduct.has(key)) rowsByProduct.set(key, []);
      rowsByProduct.get(key).push(r);
    });

    const nowIso = new Date().toISOString();
    const inserts = [];
    const updates = [];

    entries.forEach(entry => {
      const key = String(entry.product_id);
      const rows = rowsByProduct.get(key) || [];
      if (rows.length === 0) {
        inserts.push({
          product_id: entry.product_id,
          location: locId,
          quantity: entry.qty,
          updated_at: nowIso,
        });
      } else {
        updates.push({ id: rows[0].id, qty: entry.qty });
      }
    });

    const locMap = new Set((locRows || []).map(r => String(r.product_id)));
    const locInserts = entries
      .filter(entry => !locMap.has(String(entry.product_id)))
      .map(entry => ({ product_id: entry.product_id, location_id: locId }));
    if (locInserts.length > 0) {
      const useApi = shouldUseApi();
      let inserted = false;
      if (useApi) {
        try {
          await postProductLocations(locInserts);
          inserted = true;
        } catch (err) {
          if (process.env.NODE_ENV === 'production') throw err;
        }
      }
      if (!inserted) {
        const { error: locInsertErr } = await fromPublic('product_locations').insert(locInserts);
        if (locInsertErr) throw locInsertErr;
      }
    }

    if (inserts.length > 0 || updates.length > 0) {
      await applyInventoryBulk({
        inserts,
        updates: updates.map(row => ({ id: row.id, quantity: row.qty, updated_at: nowIso })),
      }, supabase);
    }
  }, [postProductLocations, shouldUseApi]);

  const refreshPeriod = useCallback(async (locId) => {
    if (!locId) return;
    setLoading(true);
    setError('');
    try {
      const { data: openRow, error: openErr } = await fromPublic('stock_periods')
        .select('*')
        .eq('location_id', locId)
        .in('status', [PERIOD_STATUS_OPEN, PERIOD_STATUS_LOCKED])
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openErr) throw openErr;
      setPeriod(openRow || null);

      if (openRow) {
        const { count: openCount, error: countErr } = await fromPublic('opening_stock_entries')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', openRow.id);
        if (countErr) throw countErr;
        setOpeningSaved((openCount || 0) > 0);
      } else {
        setOpeningSaved(false);
      }

      const { data: closedRow, error: closedErr } = await fromPublic('stock_periods')
        .select('*')
        .eq('location_id', locId)
        .eq('status', PERIOD_STATUS_CLOSED)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (closedErr) throw closedErr;
      setLastClosedPeriod(closedRow || null);
    } catch (e) {
      setError(e?.message || 'Failed to load stock period data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!locationId) {
      setPeriod(null);
      setProducts([]);
      setCombos([]);
      setOpeningSaved(false);
      setOpeningDraft({});
      setClosingDraft({});
      setOpeningItems([]);
      setOpeningSessionTotals({});
      setClosingSessionTotals({});
      setOpeningDraftDirty(false);
      setClosingDraftDirty(false);
      setClosingMode(false);
      setOpeningHiddenIds([]);
      setSearch('');
      setSearchClosing('');
      setTrackingRows([]);
      setTrackingLoading(false);
      setTrackingError('');
      setNewProductForm({
        ...initialNewProductForm,
        locations: locationId ? [locationId] : [],
      });
      setNewProductError('');
      return;
    }
    setNewProductForm({
      ...initialNewProductForm,
      locations: [locationId],
    });
    setClosingMode(false);
    (async () => {
      try {
        const catalog = await fetchCatalog(locationId);
        setProducts(catalog.products || []);
        setCombos(catalog.combos || []);
      } catch (err) {
        console.warn('Failed to load products for stock periods search.', err);
        setProducts([]);
        setCombos([]);
      }
    })();
    refreshPeriod(locationId);
  }, [locationId, fetchCatalog, refreshPeriod]);

  useEffect(() => {
    setOpeningHiddenIds([]);
  }, [period?.id]);

  const handleOpenPeriod = async () => {
    if (!locationId) return;
    if (period && (period.status === PERIOD_STATUS_OPEN || period.status === PERIOD_STATUS_LOCKED)) {
      setToast('There is already an open period for this location.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const nowIso = new Date().toISOString();
      const { data, error: insErr } = await fromPublic('stock_periods')
        .insert([{ location_id: locationId, opened_at: nowIso, status: PERIOD_STATUS_OPEN }])
        .select()
        .single();
      if (insErr) throw insErr;
      setPeriod(data);
      setOpeningSaved(false);
      setOpeningDraft({});
      setClosingDraft({});
      setOpeningItems([]);
      setOpeningSessionTotals({});
      setClosingSessionTotals({});
      setOpeningDraftDirty(false);
      setClosingDraftDirty(false);
      setSearch('');
      setSearchClosing('');
      setNewProductForm({
        ...initialNewProductForm,
        locations: locationId ? [locationId] : [],
      });
      setNewProductError('');
      setToast('Period opened. Enter opening stock.');
    } catch (e) {
      setError(e?.message || 'Failed to open period.');
    } finally {
      setLoading(false);
    }
  };

  const addOpeningQty = (productId, qty) => {
    if (!productId) return;
    const safeQty = toNumber(qty || 0);
    if (safeQty <= 0) return;
    setOpeningItems(prev => (prev.includes(productId) ? prev : [...prev, productId]));
    setOpeningDraft(prev => {
      const current = toNumber(prev[productId] ?? 0);
      return { ...prev, [productId]: current + safeQty };
    });
    setOpeningDraftDirty(true);
  };

  const addClosingQty = (productId, qty) => {
    if (!productId) return;
    const safeQty = toNumber(qty || 0);
    if (safeQty <= 0) return;
    setClosingDraft(prev => {
      const current = toNumber(prev[productId] ?? 0);
      return { ...prev, [productId]: current + safeQty };
    });
    setClosingDraftDirty(true);
  };

  const setClosingQty = (productId, qty) => {
    if (!productId) return;
    const safeQty = toNumber(qty);
    setClosingDraft(prev => ({ ...prev, [productId]: safeQty }));
    setClosingDraftDirty(true);
  };

  const generateAutoSku = async () => {
    const { data: allSkus, error } = await fromPublic('products').select('sku');
    if (error) throw error;
    const used = new Set();
    (allSkus || []).forEach(row => {
      const raw = (row?.sku || '').toString().trim();
      const match = raw.match(/^#?(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) used.add(num);
      }
    });
    let i = 1;
    while (used.has(i)) i++;
    return `#${String(i).padStart(5, '0')}`;
  };

  const handleNewProductChange = (e) => {
    const { name, value, type, files, checked } = e.target;
    if (name === 'locations') {
      const locId = value;
      setNewProductForm((prev) => ({
        ...prev,
        locations: checked
          ? [...prev.locations, locId]
          : prev.locations.filter(id => id !== locId),
      }));
      return;
    }
    if (type === 'file') {
      setNewProductForm((prev) => ({ ...prev, image: files?.[0] || null }));
      return;
    }
    setNewProductForm((prev) => ({ ...prev, [name]: value }));
  };

  const promptQty = (label, defaultQty = 1) => {
    const raw = window.prompt(`Enter qty for ${label}`, String(defaultQty));
    if (raw === null) return null;
    const qty = toNumber(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      setToast('Enter a valid quantity.');
      return null;
    }
    return qty;
  };

  const handleAddOpeningResult = async (item) => {
    if (!item) return;
    try {
      if (item._type === 'combo') {
        const qty = promptQty(item.combo_name || 'Set', 1);
        if (qty === null) return;
        const components = await ensureComboItemsLoaded(item);
        if (!components.length) {
          setToast('No components found for this set.');
          return;
        }
        components.forEach(component => {
          const componentQty = toNumber(component.quantity) * qty;
          addOpeningQty(String(component.product_id), componentQty);
        });
      } else {
        const qty = promptQty(item.name || item.sku || 'Product', 1);
        if (qty === null) return;
        addOpeningQty(String(item.id), qty);
      }
      setSearch('');
    } catch (e) {
      setToast(e?.message || 'Failed to add item.');
    }
  };

  const handleAddClosingResult = async (item) => {
    if (!item) return;
    try {
      if (item._type === 'combo') {
        const qty = promptQty(item.combo_name || 'Set', 1);
        if (qty === null) return;
        const components = await ensureComboItemsLoaded(item);
        if (!components.length) {
          setToast('No components found for this set.');
          return;
        }
        components.forEach(component => {
          const componentQty = toNumber(component.quantity) * qty;
          addClosingQty(String(component.product_id), componentQty);
        });
      } else {
        const qty = promptQty(item.name || item.sku || 'Product', 1);
        if (qty === null) return;
        setClosingQty(String(item.id), qty);
      }
      setSearchClosing('');
    } catch (e) {
      setToast(e?.message || 'Failed to add item.');
    }
  };

  const handleAddOpeningProduct = async () => {
    if (!locationId || !period) return;
    const name = (newProductForm.name || '').trim();
    if (!name) {
      setNewProductError('Enter a product name.');
      return;
    }
    if (!newProductForm.category_id) {
      setNewProductError('Select a category.');
      return;
    }
    if (!newProductForm.unit_of_measure_id) {
      setNewProductError('Select a unit of measure.');
      return;
    }
    if (!newProductForm.currency) {
      setNewProductError('Select a currency.');
      return;
    }
    setNewProductSaving(true);
    setNewProductError('');
    try {
      const qty = toNumber(newProductForm.opening_qty || 0);
      let skuToUse = (newProductForm.sku || '').trim();
      let skuIsAuto = newProductForm.sku_type === 'auto';
      if ((newProductForm.sku_type === 'auto' && !skuToUse) || !skuToUse) {
        skuIsAuto = true;
        skuToUse = await generateAutoSku();
      }

      const productData = {
        name,
        sku: skuToUse,
        sku_type: skuIsAuto,
        cost_price: newProductForm.cost_price ? parseFloat(newProductForm.cost_price) : 0,
        price: newProductForm.price ? parseFloat(newProductForm.price) : 0,
        promotional_price: newProductForm.promotional_price ? parseFloat(newProductForm.promotional_price) : null,
        currency: newProductForm.currency,
        category_id: newProductForm.category_id ? parseInt(newProductForm.category_id, 10) : null,
        unit_of_measure_id: newProductForm.unit_of_measure_id ? parseInt(newProductForm.unit_of_measure_id, 10) : null,
      };

      const { data: inserted, error: insertErr } = await fromPublic('products')
        .insert([productData])
        .select('id, name, sku')
        .single();
      if (insertErr) throw insertErr;

      const locationIds = uniqueIds([
        locationId,
        ...(newProductForm.locations || []),
      ]);
      if (locationIds.length > 0) {
        const { error: locErr } = await fromPublic('product_locations')
          .insert(locationIds.map(loc => ({ product_id: inserted.id, location_id: loc })));
        if (locErr) throw locErr;
      }

      const nowIso = new Date().toISOString();
      const { error: invErr } = await fromPublic('inventory')
        .insert([{ product_id: inserted.id, location: locationId, quantity: qty, updated_at: nowIso }]);
      if (invErr) throw invErr;

      if (newProductForm.image) {
        const file = newProductForm.image;
        const fileExt = file.name.split('.').pop();
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${safeName}_${inserted.id}_${Date.now()}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage
          .from('productimages')
          .upload(fileName, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: publicUrlData } = supabase.storage
          .from('productimages')
          .getPublicUrl(fileName);
        const publicUrl = publicUrlData?.publicUrl;
        if (!publicUrl) throw new Error('Failed to get public URL for image.');

        const { error: imageInsertError } = await fromPublic('product_images')
          .insert([{ product_id: inserted.id, image_url: publicUrl }]);
        if (imageInsertError) throw imageInsertError;

        const { error: prodImgUpdateError } = await fromPublic('products')
          .update({ image_url: publicUrl })
          .eq('id', inserted.id);
        if (prodImgUpdateError) throw prodImgUpdateError;
      }

      setProducts(prev => [{ id: inserted.id, name: inserted.name, sku: inserted.sku }, ...prev]);
      addOpeningQty(String(inserted.id), qty);
      setNewProductForm({
        ...initialNewProductForm,
        locations: locationId ? [locationId] : [],
        currency: newProductForm.currency || '',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setToast('Product added to opening stock.');
    } catch (e) {
      setNewProductError(e?.message || 'Failed to add product.');
    } finally {
      setNewProductSaving(false);
    }
  };

  const removeOpeningItem = (productId) => {
    setOpeningItems(prev => prev.filter(id => String(id) !== String(productId)));
    setOpeningDraftDirty(true);
  };

  const loadOpeningEntries = useCallback(async (sessionId, applyToDraft = true) => {
    if (!sessionId) return;
    const { data, error: loadErr } = await fromPublic('opening_stock_entries')
      .select('product_id, qty')
      .eq('session_id', sessionId);
    if (loadErr) throw loadErr;
    const draft = {};
    const items = [];
    (data || []).forEach(row => {
      const qty = toNumber(row.qty);
      if (!row.product_id) return;
      const pid = String(row.product_id);
      draft[pid] = toNumber(draft[pid] ?? 0) + qty;
      if (!items.includes(pid)) items.push(pid);
    });
    setOpeningSessionTotals(draft);
    await ensureProductsLoadedForIds(items);
    if (applyToDraft) {
      setOpeningDraft(draft);
      setOpeningItems(items);
      setOpeningDraftDirty(false);
    }
  }, [ensureProductsLoadedForIds]);

  const loadClosingEntries = useCallback(async (sessionId, applyToDraft = true) => {
    if (!sessionId) return;
    const { data, error: loadErr } = await fromPublic('closing_stock_entries')
      .select('product_id, qty')
      .eq('session_id', sessionId);
    if (loadErr) throw loadErr;
    const draft = {};
    const items = [];
    (data || []).forEach(row => {
      const qty = toNumber(row.qty);
      if (!row.product_id) return;
      const pid = String(row.product_id);
      draft[pid] = toNumber(draft[pid] ?? 0) + qty;
      if (!items.includes(pid)) items.push(pid);
    });
    setClosingSessionTotals(draft);
    await ensureProductsLoadedForIds(items);
    if (applyToDraft) {
      setClosingDraft(draft);
      setClosingDraftDirty(false);
    }
  }, [ensureProductsLoadedForIds]);

  const rtTickEntries = useRealtimeRefresh(
    period?.id ? ['opening_stock_entries', 'closing_stock_entries'] : [],
    400,
    period?.id
      ? {
        opening_stock_entries: { column: 'session_id', value: period.id },
        closing_stock_entries: { column: 'session_id', value: period.id },
      }
      : undefined
  );

  useEffect(() => {
    if (!period?.id) return;
    if (isPeriodLocked) {
      loadClosingEntries(period.id, !closingDraftDirty).catch(() => {});
      return;
    }
    loadOpeningEntries(period.id, !openingDraftDirty).catch(() => {});
  }, [period?.id, isPeriodLocked, rtTickEntries, openingDraftDirty, closingDraftDirty, loadOpeningEntries, loadClosingEntries]);

  useEffect(() => {
    if (!isPeriodLocked) setClosingMode(false);
  }, [isPeriodLocked, period?.id]);

  useEffect(() => {
    if (!closingMode) setSearchClosing('');
  }, [closingMode]);

  const openingSessionList = useMemo(() => {
    const hiddenIds = new Set((openingHiddenIds || []).map(id => String(id)));
    const ids = new Set();
    Object.entries(openingSessionTotals || {}).forEach(([id, qty]) => {
      if (toNumber(qty) > 0 && !hiddenIds.has(String(id))) ids.add(String(id));
    });
    const list = Array.from(ids);
    list.sort((a, b) => {
      const aName = getCanonicalProductInfo(a).name || String(a);
      const bName = getCanonicalProductInfo(b).name || String(b);
      return aName.localeCompare(bName);
    });
    return list;
  }, [openingSessionTotals, openingHiddenIds, getCanonicalProductInfo]);

  const visibleTrackingRows = useMemo(() => {
    const base = (trackingRows || []).filter(row =>
      row.opening > 0 ||
      row.transfersIn > 0 ||
      row.salesQty > 0 ||
      row.hasClosingEntry ||
      row.hasInventory
    );
    const term = (searchVariance || '').trim().toLowerCase();
    if (!term) return base;
    return base.filter(row =>
      (row.name && row.name.toLowerCase().includes(term)) ||
      (row.sku && String(row.sku).toLowerCase().includes(term))
    );
  }, [trackingRows, searchVariance]);

  const buildOpeningCsvLines = useCallback(() => {
    const header = ['Product', 'SKU', 'Session Qty'];
    const lines = [header.join(',')];
    openingSessionList.forEach(pid => {
      const info = getCanonicalProductInfo(pid);
      const name = info.name || pid;
      const sku = info.sku || '';
      const qty = toNumber(openingSessionTotals[pid] ?? 0);
      lines.push([
        `"${String(name).replace(/"/g, '""')}"`,
        `"${String(sku).replace(/"/g, '""')}"`,
        qty,
      ].join(','));
    });
    return lines;
  }, [openingSessionList, openingSessionTotals, getCanonicalProductInfo]);

  const parseQtyInput = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).replace(/,/g, '.').trim();
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  };

  const getClosingInputValue = useCallback((pid) => {
    if (Object.prototype.hasOwnProperty.call(closingDraft, pid)) return closingDraft[pid];
    if (closingSessionTotals && closingSessionTotals[pid] !== undefined) return closingSessionTotals[pid];
    return '';
  }, [closingDraft, closingSessionTotals]);

  const handleClosingInputChange = (pid, value) => {
    const val = value === '' ? '' : value;
    setClosingDraft(prev => {
      const next = { ...prev };
      if (val === '') {
        delete next[pid];
      } else {
        next[pid] = val;
      }
      return next;
    });
    setClosingDraftDirty(true);
  };

  const postOpeningEntry = useCallback(async (payload) => {
    const apiBase = getApiBase();
    const entryUrl = apiBase ? `${apiBase}/api/opening-stock-entry` : '/api/opening-stock-entry';
    const response = await fetch(entryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'Failed to save opening entry.');
    }
    return data || {};
  }, [getApiBase]);

  const handleExportOpeningCsv = () => {
    if (!openingSessionList.length) return;
    const lines = buildOpeningCsvLines();
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Opening_Stock_${toYMD(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildVarianceCsvLines = useCallback(() => {
    const header = ['Product', 'SKU', 'Opening', 'Transfers In', 'Sales', 'Expected', 'Closing', 'Variance'];
    const lines = [header.join(',')];
    visibleTrackingRows.forEach(row => {
      lines.push([
        `"${String(row.name || '').replace(/"/g, '""')}"`,
        `"${String(row.sku || '').replace(/"/g, '""')}"`,
        row.opening,
        row.transfersIn,
        row.salesQty,
        row.expected,
        row.closingQty === null ? '' : row.closingQty,
        row.variance === null ? '' : row.variance,
      ].join(','));
    });
    return lines;
  }, [visibleTrackingRows]);

  const handleExportVarianceCsv = () => {
    if (!visibleTrackingRows.length) return;
    const lines = buildVarianceCsvLines();
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Variance_Report_${trackingStartAt ? toYMD(trackingStartAt) : toYMD(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const removeOpeningEntry = async (pid) => {
    if (!period?.id) return;
    if (shouldUseApi()) {
      try {
        await postOpeningEntry({ action: 'delete', sessionId: period.id, productId: pid });
        return;
      } catch (err) {
        // Fallback to direct write if API is unreachable.
      }
    }
    const { error: delErr } = await fromPublic('opening_stock_entries')
      .delete()
      .eq('session_id', period.id)
      .eq('product_id', pid);
    if (!delErr) return;
    const { error: upErr } = await fromPublic('opening_stock_entries')
      .upsert([{ session_id: period.id, product_id: pid, qty: 0 }], { onConflict: 'session_id,product_id' });
    if (upErr) throw upErr;
  };

  const upsertOpeningEntry = useCallback(async (pid, qty) => {
    if (!period?.id) return;
    const info = getCanonicalProductInfo(pid);
    const canonicalId = String(info?.id || pid || '');
    if (!canonicalId) throw new Error('Invalid product id.');
    if (!productsById.has(canonicalId)) {
      const fetched = await fetchProductsByIds([canonicalId]);
      const found = (fetched || []).some(row => String(row.id) === canonicalId);
      if (!found) throw new Error('Product not found. Remove this entry and try again.');
    }
    if (shouldUseApi()) {
      try {
        const result = await postOpeningEntry({ action: 'upsert', sessionId: period.id, productId: canonicalId, qty });
        const saved = result?.qty;
        return saved === undefined || saved === null ? qty : Number(saved);
      } catch (err) {
        // Fallback to direct write if API is unreachable.
      }
    }
    const { error: upErr } = await fromPublic('opening_stock_entries')
      .upsert([{ session_id: period.id, product_id: canonicalId, qty }], { onConflict: 'session_id,product_id' });
    if (upErr) throw upErr;
    const { data, error: loadErr } = await fromPublic('opening_stock_entries')
      .select('qty')
      .eq('session_id', period.id)
      .eq('product_id', canonicalId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    return data?.qty === undefined || data?.qty === null ? qty : Number(data.qty);
  }, [fetchProductsByIds, getCanonicalProductInfo, period?.id, postOpeningEntry, productsById, shouldUseApi]);

  const applyOpeningSessionDelta = useCallback(async (productId, deltaQty) => {
    if (!period?.id || !isPeriodOpen || isPeriodLocked) return;
    const pid = String(productId);
    const current = toNumber(openingSessionTotals[pid] ?? 0);
    const nextQty = Math.max(0, current + toNumber(deltaQty));
    const savedQty = await upsertOpeningEntry(pid, nextQty);
    setOpeningSessionTotals(prev => ({ ...prev, [pid]: savedQty }));
    if (savedQty > 0) {
      setOpeningHiddenIds(prev => prev.filter(id => String(id) !== pid));
    }
  }, [openingSessionTotals, isPeriodLocked, isPeriodOpen, period?.id, upsertOpeningEntry]);

  const handleAddOpeningFromList = async (item) => {
    if (!item || !period?.id || !isPeriodOpen || isPeriodLocked) return;
    if (openingAddBusy) return;
    setOpeningAddBusy(true);
    setError('');
    try {
      if (item._type === 'combo') {
        const qty = promptQty(item.combo_name || 'Set', 1);
        if (qty === null) return;
        const components = await ensureComboItemsLoaded(item);
        if (!components.length) {
          setToast('No components found for this set.');
          return;
        }
        for (const component of components) {
          const componentQty = toNumber(component.quantity) * qty;
          if (componentQty > 0) {
            await applyOpeningSessionDelta(component.product_id, componentQty);
          }
        }
      } else {
        const qty = promptQty(item.name || item.sku || 'Product', 1);
        if (qty === null) return;
        await applyOpeningSessionDelta(item.id, qty);
      }
      setSearch('');
      setToast('Opening entry added.');
    } catch (e) {
      setError(e?.message || 'Failed to add opening entry.');
    } finally {
      setOpeningAddBusy(false);
    }
  };

  const handleStartOpeningEdit = (productId) => {
    const pid = String(productId);
    if (openingEditId === pid) {
      setOpeningEditId('');
      setOpeningEditValue('');
      return;
    }
    const current = openingSessionTotals[pid] ?? '';
    setOpeningEditId(pid);
    setOpeningEditValue(String(current));
  };

  const handleSaveOpeningEdit = async (productId) => {
    if (!period?.id) return;
    const pid = String(productId);
    if (openingEditId !== pid) return;
    setOpeningEditSaving(true);
    setError('');
    try {
      const qty = parseQtyInput(openingEditValue);
      if (qty === null) {
        setError('Enter a valid qty.');
        return;
      }
      if (qty < 0) {
        setError('Qty cannot be negative.');
        return;
      }
      const savedQty = await upsertOpeningEntry(pid, qty);
      setOpeningSessionTotals(prev => ({ ...prev, [pid]: savedQty }));
      if (savedQty !== qty) {
        setToast(`Saved qty adjusted to ${savedQty}.`);
      }
      if (qty > 0) {
        setOpeningHiddenIds(prev => prev.filter(id => String(id) !== pid));
      }
      setOpeningEditId('');
      setOpeningEditValue('');
      setToast('Opening qty saved.');
    } catch (e) {
      setError(e?.message || 'Failed to save opening qty.');
    } finally {
      setOpeningEditSaving(false);
    }
  };

  const handleDeleteOpeningRow = async (productId) => {
    if (!period?.id) return;
    const answer = window.prompt('Type yes to delete this row.');
    if (!answer || answer.trim().toLowerCase() !== 'yes') return;
    const pid = String(productId);
    setOpeningEditSaving(true);
    setError('');
    try {
      setOpeningHiddenIds(prev => (prev.includes(pid) ? prev : [...prev, pid]));
      await removeOpeningEntry(pid);
      setOpeningSessionTotals(prev => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
      setOpeningItems(prev => prev.filter(id => String(id) !== pid));
      setOpeningDraft(prev => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
      if (openingEditId === pid) {
        setOpeningEditId('');
        setOpeningEditValue('');
      }
      setToast('Row deleted.');
    } catch (e) {
      setError(e?.message || 'Failed to delete row.');
    } finally {
      setOpeningEditSaving(false);
    }
  };
  const handleSyncOpeningEntries = async () => {
    if (!period?.id) return;
    setLoading(true);
    setError('');
    try {
      await loadOpeningEntries(period.id, true);
      setOpeningEditId('');
      setOpeningEditValue('');
      setToast('Opening entries refreshed.');
    } catch (e) {
      setError(e?.message || 'Failed to refresh opening entries.');
    } finally {
      setLoading(false);
    }
  };

  const buildOpeningInventoryEntries = useCallback(async () => {
    if (!period?.id || !locationId) return [];
    const [{ data: openingRows, error: openingErr }, locProductIds] = await Promise.all([
      fromPublic('opening_stock_entries')
        .select('product_id, qty')
        .eq('session_id', period.id),
      getLocationProductIds(locationId),
    ]);
    if (openingErr) throw openingErr;
    const map = new Map();
    (openingRows || []).forEach(row => {
      if (!row?.product_id) return;
      const key = String(row.product_id);
      const current = map.get(key) || 0;
      map.set(key, current + toNumber(row.qty));
    });
    (locProductIds || []).forEach(pid => {
      const key = String(pid);
      if (!map.has(key)) map.set(key, 0);
    });
    (openingHiddenIds || []).forEach(pid => {
      map.set(String(pid), 0);
    });
    const candidateIds = Array.from(map.keys());
    if (!candidateIds.length) return [];
    const validProducts = await fetchProductsByIds(candidateIds);
    const validIdSet = new Set((validProducts || []).map(p => String(p.id)));
    return Array.from(map.entries())
      .filter(([product_id]) => validIdSet.has(String(product_id)))
      .map(([product_id, qty]) => ({ product_id, qty }));
  }, [fetchProductsByIds, getLocationProductIds, locationId, openingHiddenIds, period?.id]);

  const handleLockOpening = async () => {
    if (!period || !locationId) return;
    if (isPeriodLocked) return;
    if (!isAdminUser) {
      setToast('Admin access required to lock opening stock.');
      return;
    }
    if (openingEditId || openingEditSaving) {
      setToast('Save opening edits before locking stock.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const entries = await buildOpeningInventoryEntries();
      const openingRows = entries.map(entry => ({
        session_id: period.id,
        product_id: entry.product_id,
        qty: entry.qty,
      }));
      if (openingRows.length > 0) {
        const { error: upErr } = await fromPublic('opening_stock_entries')
          .upsert(openingRows, { onConflict: 'session_id,product_id' });
        if (upErr) throw upErr;
      }
      if (entries.length > 0) {
        await applyInventoryQuantities(locationId, entries);
      }

      const lockedAt = new Date().toISOString();
      const { data, error: lockErr } = await fromPublic('stock_periods')
        .update({ status: PERIOD_STATUS_LOCKED, updated_at: lockedAt })
        .eq('id', period.id)
        .select()
        .single();
      if (lockErr) throw lockErr;
      setPeriod(data);
      setOpeningSaved(true);
      setToast('Opening stock locked. Tracking started.');
    } catch (e) {
      setError(e?.message || 'Failed to lock opening stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleReapplyOpeningInventory = async () => {
    if (!period || !locationId || !isPeriodLocked) return;
    setLoading(true);
    setError('');
    try {
      const entries = await buildOpeningInventoryEntries();
      if (!entries.length) {
        setToast('No opening entries found for this period.');
        return;
      }
      await applyInventoryQuantities(locationId, entries);
      setToast('Opening stock applied to inventory.');
    } catch (e) {
      setError(e?.message || 'Failed to apply opening stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockOpening = async () => {
    if (!period || !isPeriodLocked) return;
    const answer = window.prompt('Type UNLOCK to reopen opening stock for this period.');
    if (!answer || answer.trim().toUpperCase() !== 'UNLOCK') return;
    setLoading(true);
    setError('');
    try {
      const nowIso = new Date().toISOString();
      const { data, error: unlockErr } = await fromPublic('stock_periods')
        .update({ status: PERIOD_STATUS_OPEN, updated_at: nowIso })
        .eq('id', period.id)
        .select()
        .single();
      if (unlockErr) throw unlockErr;
      setPeriod(data || null);
      setToast('Opening stock unlocked. You can submit opening entries again.');
    } catch (e) {
      setError(e?.message || 'Failed to unlock opening stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClosing = async () => {
    if (!period || !locationId) return;
    if (!isPeriodLocked) {
      setToast('Lock opening stock before saving closing stock.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const locProductIds = await getLocationProductIds(locationId);
      const sourceTotals = { ...(closingSessionTotals || {}), ...(closingDraft || {}) };
      let openingIds = [];
      if (!STOCKTAKE_SUMMARY_ONLY) {
        const { data: openingRows, error: openingErr } = await fromPublic('opening_stock_entries')
          .select('product_id, qty')
          .eq('session_id', period.id);
        if (openingErr) throw openingErr;
        openingIds = (openingRows || [])
          .filter(row => toNumber(row.qty) > 0)
          .map(row => String(row.product_id));
      }
      const draftIds = Object.keys(sourceTotals || {}).map(id => String(id));
      const allIds = uniqueIds([...locProductIds, ...draftIds, ...openingIds]);
      const entries = allIds.map(pid => ({
        session_id: period.id,
        product_id: pid,
        qty: toNumber(sourceTotals[pid] ?? 0),
      }));
      if (entries.length > 0) {
        const { error: upErr } = await fromPublic('closing_stock_entries')
          .upsert(entries, { onConflict: 'session_id,product_id' });
        if (upErr) throw upErr;
        await applyInventoryQuantities(locationId, entries.map(e => ({ product_id: e.product_id, qty: e.qty })));
      }

      const closedAt = new Date().toISOString();
      const { error: updErr } = await fromPublic('stock_periods')
        .update({ status: PERIOD_STATUS_CLOSED, closed_at: closedAt })
        .eq('id', period.id);
      if (updErr) throw updErr;

      const closedPeriod = { ...period, status: PERIOD_STATUS_CLOSED, closed_at: closedAt };
      setLastClosedPeriod(closedPeriod);

      const { data: nextPeriod, error: nextErr } = await fromPublic('stock_periods')
        .insert([{ location_id: locationId, opened_at: closedAt, status: PERIOD_STATUS_OPEN }])
        .select()
        .single();
      if (nextErr) throw nextErr;

      if (entries.length > 0) {
        const nextEntries = entries
          .filter(row => toNumber(row.qty) > 0)
          .map(row => ({
            session_id: nextPeriod.id,
            product_id: row.product_id,
            qty: row.qty,
          }));
        if (nextEntries.length > 0) {
          const { error: nextUpErr } = await fromPublic('opening_stock_entries')
            .upsert(nextEntries, { onConflict: 'session_id,product_id' });
          if (nextUpErr) throw nextUpErr;
        }
      }

      setPeriod(nextPeriod);
      setOpeningSaved(true);
      setOpeningDraft({});
      setClosingDraft({});
      setOpeningItems([]);
      setClosingDraftDirty(false);
      setClosingMode(false);
      setSearch('');
      setSearchClosing('');
      setToast('Closing stock saved. New period opened.');
    } catch (e) {
      setError(e?.message || 'Failed to save closing stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncClosingEntries = async () => {
    if (!period?.id) return;
    setLoading(true);
    setError('');
    try {
      await loadClosingEntries(period.id, true);
      setToast('Closing entries refreshed.');
    } catch (e) {
      setError(e?.message || 'Failed to refresh closing entries.');
    } finally {
      setLoading(false);
    }
  };

  const loadTrackingData = useCallback(async () => {
    if (!locationId || !period || !isPeriodLocked || !trackingStartAt) {
      setTrackingRows([]);
      setTrackingError('');
      return;
    }
    setTrackingLoading(true);
    setTrackingError('');
    try {
      const startISO = new Date(trackingStartAt).toISOString();
      const endAt = period.closed_at || new Date().toISOString();
      const endISO = new Date(endAt).toISOString();
      const startDate = toYMD(trackingStartAt);
      const endDate = toYMD(endAt);

      const [{ data: openingRows, error: openingErr }, { data: closingRows, error: closingErr }] = await Promise.all([
        fromPublic('opening_stock_entries')
          .select('product_id, qty')
          .eq('session_id', period.id),
        fromPublic('closing_stock_entries')
          .select('product_id, qty')
          .eq('session_id', period.id),
      ]);
      if (openingErr) throw openingErr;
      if (closingErr) throw closingErr;

      const { data: inventoryRows, error: inventoryErr } = await fromPublic('inventory')
        .select('product_id, quantity')
        .eq('location', locationId);
      if (inventoryErr) throw inventoryErr;

      const [transferInDtRes, transferInDateRes] = await Promise.all([
        fromPublic('stock_transfer_sessions')
          .select('id, transfer_datetime, created_at')
          .eq('to_location', locationId)
          .not('transfer_datetime', 'is', null)
          .gte('transfer_datetime', startISO)
          .lte('transfer_datetime', endISO),
        fromPublic('stock_transfer_sessions')
          .select('id, transfer_date, created_at')
          .eq('to_location', locationId)
          .is('transfer_datetime', null)
          .gte('transfer_date', startDate)
          .lte('transfer_date', endDate),
      ]);

      const transferInSessions = [
        ...(transferInDtRes?.data || []),
        ...(transferInDateRes?.data || []),
      ];
      const transferSessionIds = transferInSessions.map(s => s.id).filter(Boolean);
      let transferEntries = [];
      if (transferSessionIds.length > 0) {
        const { data: entries, error: entriesErr } = await fromPublic('stock_transfer_entries')
          .select('session_id, product_id, quantity')
          .in('session_id', transferSessionIds);
        if (entriesErr) throw entriesErr;
        transferEntries = entries || [];
      }

      const [salesByDateRes, salesByCreatedRes] = await Promise.all([
        fromPublic('sales')
          .select('id, sale_date, created_at')
          .eq('location_id', locationId)
          .gte('sale_date', startDate)
          .lte('sale_date', endDate),
        fromPublic('sales')
          .select('id, sale_date, created_at')
          .eq('location_id', locationId)
          .is('sale_date', null)
          .gte('created_at', startISO)
          .lte('created_at', endISO),
      ]);
      if (salesByDateRes.error) throw salesByDateRes.error;
      if (salesByCreatedRes.error) throw salesByCreatedRes.error;

      const salesRows = [...(salesByDateRes.data || []), ...(salesByCreatedRes.data || [])];
      const saleIds = Array.from(new Set((salesRows || []).map(r => r.id).filter(Boolean)));
      let salesItems = [];
      if (saleIds.length > 0) {
        const { data: itemRows, error: itemsErr } = await fromPublic('sales_items')
          .select('sale_id, product_id, quantity')
          .in('sale_id', saleIds);
        if (itemsErr) throw itemsErr;
        salesItems = itemRows || [];
      }

      const openingMap = new Map();
      (openingRows || []).forEach(row => {
        if (!row.product_id) return;
        const qty = toNumber(row.qty);
        if (qty <= 0) return;
        const pid = String(row.product_id);
        openingMap.set(pid, qty);
      });

      const closingMap = new Map();
      (closingRows || []).forEach(row => {
        if (!row.product_id) return;
        const pid = String(row.product_id);
        closingMap.set(pid, toNumber(row.qty));
      });
      const closingDraftIds = Object.keys(closingDraft || {}).map(id => String(id));
      closingDraftIds.forEach(pid => {
        closingMap.set(pid, toNumber(closingDraft[pid] ?? 0));
      });
      const closeStarted = closingDraftIds.length > 0 || (closingRows || []).length > 0;

      const transfersInMap = new Map();
      (transferEntries || []).forEach(row => {
        if (!row.product_id || !row.session_id) return;
        const pid = String(row.product_id);
        const qty = toNumber(row.quantity);
        transfersInMap.set(pid, (transfersInMap.get(pid) || 0) + qty);
      });

      const salesMap = new Map();
      (salesItems || []).forEach(row => {
        if (!row.product_id) return;
        const pid = String(row.product_id);
        const current = salesMap.get(pid) || 0;
        salesMap.set(pid, current + toNumber(row.quantity));
      });

      const inventoryMap = new Map();
      (inventoryRows || []).forEach(row => {
        if (!row.product_id) return;
        const pid = String(row.product_id);
        inventoryMap.set(pid, toNumber(row.quantity));
      });

      const allIds = uniqueIds([
        ...Array.from(openingMap.keys()),
        ...Array.from(transfersInMap.keys()),
        ...Array.from(closingMap.keys()),
        ...Array.from(salesMap.keys()),
        ...Array.from(inventoryMap.keys()),
      ]);

      const rows = allIds.map(pid => {
        const info = getCanonicalProductInfo(pid);
        const opening = openingMap.get(pid) || 0;
        const transfersIn = transfersInMap.get(pid) || 0;
        const salesQty = salesMap.get(pid) || 0;
        const expected = opening + transfersIn - salesQty;
        const hasClosingEntry = closingMap.has(pid);
        const hasInventory = inventoryMap.has(pid);
        const closingQty = hasClosingEntry
          ? closingMap.get(pid)
          : (closingMode ? null : (hasInventory ? inventoryMap.get(pid) : (closeStarted && openingMap.has(pid) ? 0 : null)));
        const variance = closingQty === null ? null : (closingQty - expected);
        const includeRow = opening > 0 || transfersIn > 0 || salesQty > 0 || hasClosingEntry || hasInventory;
        if (!includeRow) return null;
        return {
          product_id: pid,
          name: info?.name || pid,
          sku: info?.sku || '',
          hasClosingEntry,
          hasInventory,
          opening,
          transfersIn,
          salesQty,
          expected,
          closingQty,
          variance,
        };
      }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

      setTrackingRows(rows);
    } catch (e) {
      setTrackingError(e?.message || 'Failed to load tracking data.');
      setTrackingRows([]);
    } finally {
      setTrackingLoading(false);
    }
  }, [locationId, period, isPeriodLocked, trackingStartAt, getCanonicalProductInfo, closingDraft, closingMode]);

  useEffect(() => {
    loadTrackingData();
  }, [loadTrackingData]);

  const formatTrackingDateTime = (value, offsetHours = 2) => {
    if (!value) return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
    const shifted = new Date(utcMs + offsetHours * 3600000);
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const year = String(shifted.getUTCFullYear()).slice(-2);
    let hours = shifted.getUTCHours();
    const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
    const seconds = String(shifted.getUTCSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const hourStr = String(hours).padStart(2, '0');
    return `${day}/${month}/${year}, ${hourStr}:${minutes}:${seconds} ${ampm}`;
  };

  const loadImage = (url) => new Promise((resolve) => {
    if (!url) return resolve(null);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });

  const loadVarianceLogo = async () => {
    try {
      const { data } = await supabase.from('company_settings').select('company_logo, logo').single();
      const url = data?.company_logo || data?.logo || '';
      if (url) return await loadImage(url);
    } catch {}
    try {
      const fallback = typeof window !== 'undefined'
        ? `${window.location.origin}/bestrest-logo.png`
        : '/bestrest-logo.png';
      return await loadImage(fallback);
    } catch {}
    return null;
  };

  const buildVariancePdf = async (rows, titleSuffix, fileSuffix) => {
    if (!rows.length) return;
    const doc = new jsPDF('p', 'pt', 'a4');
    const locationName = (locations || []).find(l => String(l.id) === String(locationId))?.name || locationId || '-';
    const rangeStart = trackingStartAt ? formatTrackingDateTime(trackingStartAt) : '-';
    const rangeEnd = period?.closed_at ? formatTrackingDateTime(period.closed_at) : '';
    const logo = await loadVarianceLogo();

    if (logo) {
      try { doc.addImage(logo, 'PNG', 40, 24, 40, 40); } catch {}
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`Variance Report${titleSuffix}`, doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Location: ${locationName}`, doc.internal.pageSize.getWidth() / 2, 60, { align: 'center' });
    doc.text(
      rangeEnd
        ? `Tracking: ${rangeStart} to ${rangeEnd}`
        : `Tracking: ${rangeStart}`,
      doc.internal.pageSize.getWidth() / 2,
      74,
      { align: 'center' }
    );

    const body = rows.map(row => {
      const openingPdf = row.opening;
      const transfersInPdf = row.transfersIn;
      return [
        `${row.name}${row.sku ? ` (${row.sku})` : ''}`,
        formatNumber(openingPdf),
        formatNumber(transfersInPdf),
        formatNumber(row.salesQty),
        formatNumber(row.expected),
        row.closingQty === null ? '-' : formatNumber(row.closingQty),
        row.variance === null ? '-' : formatNumber(row.variance),
      ];
    });

    autoTable(doc, {
      startY: 100,
      head: [['Product', 'Opening', 'Transfers In', 'Sales', 'Expected', 'Closing', 'Variance']],
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 180, 216] },
      columnStyles: {
        0: { cellWidth: 200 },
      },
    });

    const datePart = trackingStartAt ? toYMD(trackingStartAt) : toYMD(new Date());
    doc.save(`Variance_Report${fileSuffix}_${datePart}.pdf`);
  };

  const handleExportVariancePdf = () => {
    buildVariancePdf(visibleTrackingRows, '', '');
  };

  const handleExportVariancePdfNonZero = () => {
    const filtered = (visibleTrackingRows || []).filter(row => row.variance !== null && row.variance !== 0);
    buildVariancePdf(filtered, ' (Non-zero)', '_NonZero');
  };

  const buildSearchResults = useCallback((term) => {
    const value = (term || '').trim().toLowerCase();
    if (!value) return [];
    const productHits = (products || []).filter(p =>
      (p.name && p.name.toLowerCase().includes(value)) ||
      (p.sku && String(p.sku).toLowerCase().includes(value)) ||
      (p.price !== undefined && p.price !== null && String(p.price).toLowerCase().includes(value)) ||
      (p.promotional_price !== undefined && p.promotional_price !== null && String(p.promotional_price).toLowerCase().includes(value))
    ).map(p => ({ ...p, _type: 'product' }));
    const comboHits = (combos || []).filter(c =>
      (c.combo_name && c.combo_name.toLowerCase().includes(value)) ||
      (c.sku && String(c.sku).toLowerCase().includes(value))
    ).map(c => ({ ...c, _type: 'combo' }));
    return [...comboHits, ...productHits].slice(0, 20);
  }, [products, combos]);

  const filteredProducts = useMemo(() => buildSearchResults(search), [buildSearchResults, search]);
  const filteredClosingProducts = useMemo(() => buildSearchResults(searchClosing), [buildSearchResults, searchClosing]);

  const openingSessionTotalQty = useMemo(() => {
    const hiddenIds = new Set((openingHiddenIds || []).map(id => String(id)));
    return Object.entries(openingSessionTotals || {}).reduce((sum, [id, qty]) => {
      if (hiddenIds.has(String(id))) return sum;
      return sum + toNumber(qty);
    }, 0);
  }, [openingSessionTotals, openingHiddenIds]);
  const closingSessionTotalQty = useMemo(() => Object.values(closingSessionTotals || {})
    .reduce((sum, qty) => sum + toNumber(qty), 0), [closingSessionTotals]);
  const sessionTotalLabel = isPeriodLocked
    ? 'Closing Session Total Qty'
    : isPeriodOpen
      ? 'Opening Session Total Qty'
      : 'Session Total Qty';
  const sessionTotalQty = isPeriodLocked ? closingSessionTotalQty : openingSessionTotalQty;

  const openHelper = isPeriodLocked
    ? 'Opening stock locked. Transfers and sales are now tracked for this period.'
    : isPeriodOpen
      ? (STOCKTAKE_SUMMARY_ONLY
        ? 'Session totals loaded. Approve opening stock when ready.'
        : 'Period open. Save opening stock, then lock to start tracking.')
      : 'Open a new stock period for this location.';


  return (
    <div className="stock-periods-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 style={{ margin: 0 }}>Stock Periods</h2>
      </div>

      <div className="stock-periods-card">
        <div className="stock-periods-section-title">{sessionTotalLabel}</div>
        <div className="stock-periods-note" style={{ fontSize: 20, fontWeight: 700 }}>
          {sessionTotalQty}
        </div>
      </div>

      <div className="stock-periods-card">
        <label className="stock-periods-label">Location</label>
        <select
          className="pos-control pos-select"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">Select Location</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        {isPeriodOpen && (
          <div className="stock-periods-note">Open period started: {new Date(period.opened_at).toLocaleString()}</div>
        )}
        {isPeriodLocked && (
          <div className="stock-periods-note">Opening locked at: {new Date(trackingStartAt).toLocaleString()}</div>
        )}
        {!period && lastClosedPeriod && (
          <div className="stock-periods-note">Last closed period ended: {new Date(lastClosedPeriod.closed_at).toLocaleString()}</div>
        )}
      </div>

      <div className="stock-periods-actions">
        <button
          type="button"
          className="stock-periods-btn stock-periods-btn-primary"
          onClick={handleOpenPeriod}
          disabled={!locationId || loading || (isPeriodOpen || isPeriodLocked)}
        >
          Open Period
        </button>
        {isPeriodOpen && (
          <button
            type="button"
            className="stock-periods-btn stock-periods-btn-secondary"
            onClick={handleSyncOpeningEntries}
            disabled={loading || !period?.id}
          >
            Refresh Opening Entries
          </button>
        )}
        {isPeriodOpen && (
          <button
            type="button"
            className="stock-periods-btn stock-periods-btn-primary"
            onClick={handleLockOpening}
            disabled={loading}
          >
            Lock Opening Stock
          </button>
        )}
        {isPeriodOpen && STOCKTAKE_SUMMARY_ONLY && (
          <button
            type="button"
            className="stock-periods-btn stock-periods-btn-secondary"
            onClick={handleExportOpeningCsv}
            disabled={openingSessionList.length === 0}
          >
            Export CSV
          </button>
        )}
        <div className="stock-periods-note">{openHelper}</div>
        {isPeriodLocked && (
          <button
            type="button"
            className="stock-periods-btn stock-periods-btn-secondary"
            onClick={handleSyncClosingEntries}
            disabled={loading || !period?.id}
          >
            Refresh Closing Entries
          </button>
        )}
        {isPeriodLocked && (
          <button
            type="button"
            className="stock-periods-btn stock-periods-btn-danger"
            onClick={handleUnlockOpening}
            disabled={loading || !period?.id}
          >
            Unlock Opening
          </button>
        )}
        {isPeriodLocked && (
          <button
            type="button"
            className="stock-periods-btn stock-periods-btn-secondary"
            onClick={handleReapplyOpeningInventory}
            disabled={loading || !period?.id}
          >
            Reapply Opening Stock
          </button>
        )}
      </div>

      {error && <div className="stock-periods-error">{error}</div>}
      {toast && <div className="stock-periods-toast">{toast}</div>}

      {isPeriodOpen && (STOCKTAKE_SUMMARY_ONLY || !openingSaved) && (
        <div className="stock-periods-card">
          <div className="stock-periods-section-title">Opening Stock</div>
          {STOCKTAKE_SUMMARY_ONLY ? (
            <>
              <div className="stock-periods-note">Enter or adjust opening quantities here, then lock opening stock for this period.</div>
              <div className="stock-periods-search">
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-secondary"
                  onClick={() => {
                    setOpeningAddOpen(prev => !prev);
                    if (openingAddOpen) setSearch('');
                  }}
                  disabled={loading || openingEditSaving || openingAddBusy}
                >
                  {openingAddOpen ? 'Close Add Product' : 'Add Product From List'}
                </button>
              </div>
              {openingAddOpen && (
                <div className="stock-periods-search">
                  <input
                    className="pos-control pos-search-wide"
                    type="text"
                    placeholder="Search product"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={openingAddBusy}
                  />
                  {filteredProducts.length > 0 && (
                    <div className="stock-periods-search-results">
                      {filteredProducts.map(p => (
                        <button
                          key={(p._type === 'combo' ? 'combo:' : 'prod:') + p.id}
                          type="button"
                          className="stock-periods-search-item"
                          onClick={() => handleAddOpeningFromList(p)}
                          disabled={openingAddBusy}
                        >
                          {p._type === 'combo' ? `[SET] ${p.combo_name}` : p.name} {p.sku ? `(${p.sku})` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <table className="pos-table stock-periods-table sticky-header-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Product</th>
                    <th>Session Qty</th>
                    <th className="stock-periods-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {openingSessionList.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16 }}>No entries yet.</td></tr>
                  )}
                  {openingSessionList.map(pid => {
                    const label = getProductDisplayLabel(pid);
                    const value = openingSessionTotals[pid] ?? 0;
                    const isEditing = openingEditId === String(pid);
                    return (
                      <tr key={pid}>
                        <td style={{ textAlign: 'left' }}>{label}</td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              className="pos-control pos-compact"
                              value={openingEditValue}
                              onChange={(e) => setOpeningEditValue(e.target.value)}
                            />
                          ) : (
                            value ?? 0
                          )}
                        </td>
                        <td className="stock-periods-actions-col">
                          <div className="stock-periods-action-buttons">
                            <button
                              type="button"
                              className="stock-periods-btn stock-periods-btn-secondary stock-periods-btn-icon"
                              onClick={() => handleStartOpeningEdit(pid)}
                              disabled={loading || openingEditSaving}
                            >
                              <i className="fa fa-cog" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="stock-periods-btn stock-periods-btn-primary stock-periods-btn-icon"
                              onClick={() => handleSaveOpeningEdit(pid)}
                              disabled={!isEditing || openingEditSaving}
                            >
                              <i className="fa fa-check" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="stock-periods-btn stock-periods-btn-danger stock-periods-btn-icon"
                              onClick={() => handleDeleteOpeningRow(pid)}
                              disabled={loading || openingEditSaving}
                            >
                              <i className="fa fa-minus" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="stock-periods-footer">
                <div className="stock-periods-note">Lock opening stock to apply counted quantities and zero-fill uncounted items.</div>
              </div>
            </>
          ) : (
            <>
          <div className="stock-periods-subcard">
            <div className="stock-periods-note">Add a new product to this location (opening period only).</div>
            <div className="form-grid name-row">
              <input
                name="name"
                className="pos-control pos-search-wide"
                type="text"
                placeholder="Product Name"
                value={newProductForm.name}
                onChange={handleNewProductChange}
              />
            </div>
            <div className="form-grid">
              <select
                name="category_id"
                className="pos-control"
                value={newProductForm.category_id}
                onChange={handleNewProductChange}
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <select
                name="unit_of_measure_id"
                className="pos-control"
                value={newProductForm.unit_of_measure_id}
                onChange={handleNewProductChange}
              >
                <option value="">Select Unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>
                ))}
              </select>
              <select
                name="sku_type"
                className="pos-control"
                value={newProductForm.sku_type}
                onChange={handleNewProductChange}
              >
                <option value="auto">Auto SKU</option>
                <option value="manual">Manual SKU</option>
              </select>
              <input
                name="sku"
                className="pos-control"
                type="text"
                placeholder="SKU (leave blank for auto)"
                value={newProductForm.sku}
                onChange={handleNewProductChange}
              />
            </div>
            <div className="form-grid">
              <select
                name="currency"
                className="pos-control"
                value={newProductForm.currency}
                onChange={handleNewProductChange}
              >
                <option value="">Select Currency</option>
                {currencyOptions.map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <input
                name="cost_price"
                className="pos-control"
                type="number"
                step="0.01"
                placeholder={`Cost Price (${newProductForm.currency || 'Currency'})`}
                value={newProductForm.cost_price}
                onChange={handleNewProductChange}
              />
              <input
                name="price"
                className="pos-control"
                type="number"
                step="0.01"
                placeholder={`Standard Price (${newProductForm.currency || 'Currency'})`}
                value={newProductForm.price}
                onChange={handleNewProductChange}
              />
              <input
                name="promotional_price"
                className="pos-control"
                type="number"
                step="0.01"
                placeholder={`Promotional Price (${newProductForm.currency || 'Currency'})`}
                value={newProductForm.promotional_price}
                onChange={handleNewProductChange}
              />
            </div>
            <div className="form-grid">
              <input
                name="opening_qty"
                className="pos-control"
                type="number"
                placeholder="Opening Qty"
                value={newProductForm.opening_qty}
                onChange={handleNewProductChange}
              />
            </div>
            <div className="stock-periods-note">Locations</div>
            <div className="stock-periods-search">
              {(locations || []).map(loc => (
                <label key={loc.id} className="stock-periods-note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    name="locations"
                    value={loc.id}
                    checked={loc.id === locationId || newProductForm.locations.includes(loc.id)}
                    disabled={loc.id === locationId}
                    onChange={handleNewProductChange}
                  />
                  {loc.name}
                </label>
              ))}
            </div>
            <input
              ref={fileInputRef}
              name="image"
              type="file"
              accept="image/*"
              onChange={handleNewProductChange}
              style={{ display: 'none' }}
            />
            <div className="stock-periods-actions">
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose Image
              </button>
              {newProductForm.image && (
                <div className="stock-periods-note">{newProductForm.image.name}</div>
              )}
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-primary"
                onClick={handleAddOpeningProduct}
                disabled={newProductSaving}
              >
                Add Product
              </button>
            </div>
            {newProductError && <div className="stock-periods-error">{newProductError}</div>}
          </div>
          <div className="stock-periods-search">
            <input
              className="pos-control pos-search-wide"
              type="text"
              placeholder="Search product"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filteredProducts.length > 0 && (
              <div className="stock-periods-search-results">
                {filteredProducts.map(p => (
                  <button
                    key={(p._type === 'combo' ? 'combo:' : 'prod:') + p.id}
                    type="button"
                    className="stock-periods-search-item"
                    onClick={() => handleAddOpeningResult(p)}
                  >
                    {p._type === 'combo' ? `[SET] ${p.combo_name}` : p.name} {p.sku ? `(${p.sku})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <table className="pos-table stock-periods-table sticky-header-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Product</th>
                <th>Qty</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {openingItems.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16 }}>Add items to set opening stock.</td></tr>
              )}
              {openingItems.map(pid => {
                const label = getProductDisplayLabel(pid);
                return (
                  <tr key={pid}>
                    <td style={{ textAlign: 'left' }}>{label}</td>
                    <td>
                      <input
                        type="number"
                        className="pos-control pos-compact"
                        value={openingDraft[pid] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOpeningDraft(prev => ({ ...prev, [pid]: val }));
                          setOpeningDraftDirty(true);
                        }}
                      />
                      {openingSessionTotals[pid] !== undefined && (
                        <div className="stock-periods-note" style={{ marginTop: 6 }}>
                          Session total: {openingSessionTotals[pid]}
                        </div>
                      )}
                    </td>
                    <td>
                      <button type="button" className="stock-periods-btn stock-periods-btn-danger" onClick={() => removeOpeningItem(pid)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="stock-periods-footer">
            <div className="stock-periods-note">Use "Lock Opening Stock" above to apply opening quantities.</div>
          </div>
            </>
          )}
        </div>
      )}

      {isPeriodLocked && openingSaved && (
        <div className="stock-periods-card">
          <div className="stock-periods-accordion">
            <div>
              <div className="stock-periods-section-title">Closing Stock</div>
              <div className="stock-periods-note">
                Use the variance table below to enter closing quantities. Items not entered will be zeroed when closing ends.
              </div>
            </div>
            <div className="stock-periods-accordion-actions">
              {!closingMode ? (
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-secondary"
                  onClick={() => {
                    setClosingMode(true);
                    setVarianceExpanded(true);
                  }}
                  disabled={loading}
                >
                  Start Closing Stock
                </button>
              ) : (
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-primary"
                  onClick={handleSaveClosing}
                  disabled={loading}
                >
                  End Closing Stock
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isPeriodLocked && (
        <div className="stock-periods-card">
          <div className="stock-periods-accordion">
            <div>
              <div className="stock-periods-section-title">Variance Report</div>
              <div className="stock-periods-note">
                Tracking from {trackingStartAt ? new Date(trackingStartAt).toLocaleString() : '-'} to{' '}
                {period?.closed_at ? new Date(period.closed_at).toLocaleString() : 'now'}.
              </div>
            </div>
            <div className="stock-periods-accordion-actions">
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-secondary"
                onClick={() => setVarianceExpanded(prev => !prev)}
              >
                {varianceExpanded ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-secondary"
                onClick={handleExportVarianceCsv}
                disabled={!visibleTrackingRows.length}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-primary"
                onClick={handleExportVariancePdf}
                disabled={!visibleTrackingRows.length}
              >
                Variance Report
              </button>
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-secondary"
                onClick={handleExportVariancePdfNonZero}
                disabled={!visibleTrackingRows.some(row => row.variance !== null && row.variance !== 0)}
              >
                Variance Report (Non-zero)
              </button>
            </div>
          </div>
          {closingMode && (
            <div className="stock-periods-search">
              <input
                className="pos-control pos-search-wide"
                type="text"
                placeholder="Search product, SKU or price"
                value={searchClosing}
                onChange={(e) => setSearchClosing(e.target.value)}
              />
              {filteredClosingProducts.length > 0 && (
                <div className="stock-periods-search-results">
                  {filteredClosingProducts.map(p => (
                    <button
                      key={(p._type === 'combo' ? 'combo:' : 'prod:') + p.id}
                      type="button"
                      className="stock-periods-search-item"
                      onClick={() => handleAddClosingResult(p)}
                    >
                      {p._type === 'combo' ? `[SET] ${p.combo_name}` : p.name} {p.sku ? `(${p.sku})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {varianceExpanded && (
            <>
              <div className="stock-periods-search">
                <input
                  className="pos-control pos-search-wide"
                  type="text"
                  placeholder="Search product or SKU"
                  value={searchVariance}
                  onChange={(e) => setSearchVariance(e.target.value)}
                />
              </div>
              {trackingError && <div className="stock-periods-error">{trackingError}</div>}
              {trackingLoading ? (
                <div className="stock-periods-note">Loading variance report...</div>
              ) : (
                <table className="pos-table stock-periods-table sticky-header-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Product</th>
                      <th>Opening</th>
                      <th>Transfers In</th>
                      <th>Sales</th>
                      <th>Expected</th>
                      <th>Closing</th>
                      <th>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrackingRows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 16 }}>
                          No tracking data for this period yet.
                        </td>
                      </tr>
                    )}
                    {visibleTrackingRows.map(row => (
                      <tr key={row.product_id}>
                        <td style={{ textAlign: 'left' }}>{row.name} {row.sku ? `(${row.sku})` : ''}</td>
                        <td>{row.opening}</td>
                        <td>{row.transfersIn}</td>
                        <td>{row.salesQty}</td>
                        <td>{row.expected}</td>
                        <td>
                          {closingMode ? (
                            <input
                              type="number"
                              className="pos-control pos-compact"
                              style={{ width: 90, textAlign: 'center' }}
                              value={getClosingInputValue(row.product_id)}
                              onChange={(e) => handleClosingInputChange(row.product_id, e.target.value)}
                            />
                          ) : (
                            row.closingQty === null ? '-' : row.closingQty
                          )}
                        </td>
                        <td>{row.variance === null ? '-' : row.variance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
