/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from "react";
import { getMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import { FaCalendarAlt, FaCashRegister, FaFilePdf } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import supabase from "./supabase";
import { isFahme, computeFahmeOverrides, computePosBadgeDue, FAHME_ID, computeLaybyRollups } from './laybyRules';
import useLaybyData from './hooks/useLaybyData';
import { checkout as checkoutApi } from './services/checkout';
import { insertLaybyPayments } from './services/laybyPayments';
import { insertSalesPayments } from './services/salesPayments';
import { createSale } from './services/sales';
import { fromPublic } from './dbSchema';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { cacheGet, cacheSet } from './utils/staleCache';
import { computeCustomerOutstandingLikeLaybyPage } from './utils/financials';
import { logUserActivity } from './utils/userActivityLog';
import { probeSupabaseOnce } from './utils/devProbe';
import { notifyLaybyWhatsApp, notifySaleWhatsApp } from './services/whatsappNotify';
import { previewPosSalePdfSample } from './services/whatsappPdfs';
import { getCurrentUser, resolveSaleActor } from './accessControl';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import { fetchPosCatalogViaApi, fetchPosLocationsViaApi } from './services/posCatalogApi';
import BackToDashboard from './BackToDashboard';
import { syncProductLocations } from './services/productLocations';
import {
  applyComboLocationPricing,
  applyProductLocationPricing,
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
} from './utils/locationPricing';
import {
  fetchComboLocationPricesForLocation,
  fetchProductLocationPricesForLocation,
  saveComboLocationPrice,
  saveProductLocationPrice,
} from './services/locationPricing';
import { applySaleInventoryDeductionViaApi } from './utils/inventoryApi';
import {
  findExistingReceiptSale,
  formatPosReceiptNumber,
  RECEIPT_DUPLICATE_ERROR,
} from './utils/receiptNumber';

const normalizeCurrencyCode = (raw) => {
  if (!raw) return 'K';
  const value = String(raw).trim().toUpperCase();
  if (['USD', 'US$', '$', 'US DOLLAR', 'DOLLAR'].includes(value)) return 'USD';
  if (['K', 'ZMW', 'KWACHA', 'ZAMBIAN KWACHA'].includes(value)) return 'K';
  return value;
};

const titleCaseWords = (text) => String(text || '')
  .split(/\s+/)
  .filter(Boolean)
  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

const canonicalName = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizePhone = (val) => {
  const s = String(val || '').trim();
  if (!s) return '';
  const digits = s.replace(/[^\d+]/g, '');
  return digits.replace(/^(?:\+)?(\d.*)$/,'+$1');
};

const getCurrencyLabel = (value) => (normalizeCurrencyCode(value) === 'USD' ? '$' : 'K');

const formatDateDisplay = (isoDate) => {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${Number(day)}/${Number(month)}/${year}`;
};

const parseDateDisplay = (displayDate) => {
  const raw = String(displayDate || '').trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || month > 12 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getApiBase = () => {
  const base = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
  return base ? base.replace(/\/+$/, '') : '';
};

const isLocalHost = () => {
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch {
    return false;
  }
};

const buildApiUrl = (path) => {
  const apiBase = getApiBase();
  if (isLocalHost()) return path;
  return apiBase ? `${apiBase}${path}` : path;
};

const saveCustomerViaApi = async (payload) => {
  const response = await fetch(buildApiUrl('/api/customers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Failed to save customer');
  }
  return data?.customer || data?.row || null;
};

const normalizeCustomerRecord = (row = {}) => {
  const name = titleCaseWords(
    row.name
    || row.customer_name
    || row.business_name
    || row.full_name
    || row.company_name
    || ''
  );
  const phone = row.phone || row.contact_phone || row.mobile || '';
  return {
    ...row,
    name: name || 'Unknown Customer',
    phone,
    currency: normalizeCurrencyCode(row.currency || 'K'),
    credit_balance: Number(row.credit_balance || 0),
    opening_balance: Number(row.opening_balance || 0),
  };
};

const dedupeCustomers = (list = []) => {
  const seenById = new Set();
  const seenByNamePhone = new Set();
  const output = [];
  for (const c of list) {
    const idKey = c.id ? String(c.id) : null;
    const nameKey = canonicalName(c.name);
    const phoneKey = normalizePhone(c.phone);
    const composite = `${nameKey}|${phoneKey}`;
    if (idKey && seenById.has(idKey)) continue;
    if (!idKey && (nameKey || phoneKey) && seenByNamePhone.has(composite)) continue;
    output.push(c);
    if (idKey) seenById.add(idKey);
    if (nameKey || phoneKey) seenByNamePhone.add(composite);
  }
  return output;
};

const chunkArray = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

const POS_REQUIRED_LOCATIONS = [
  { id: 'f72aa989-3888-4a45-96ed-15dc45b5d399', name: 'Outlet (f72aa989)' },
];

const POS_EXCLUDED_LOCATION_IDS = new Set([
  '39ffaa82-8aee-4a33-8de8-06584cbaffcf',
  '20abb7a3-9df9-45bd-885e-6440503ea728',
]);

const POS_CUSTOM_PRODUCT_BLOCKED_USERS = new Set([
  '99a0cdc5-1e67-40ff-93d4-a961cb9cff39',
  '148d3357-0c7f-4600-99fa-6056c09e4014',
  '44f085ee-8ade-4da4-9b2f-d39fd0a34179',
]);

function blockNumberInputWheel(event) {
  if (event.target instanceof HTMLInputElement && event.target.type === 'number') {
    event.preventDefault();
  }
}


const filterLocations = (rows = []) => (
  (rows || []).filter(row => row && isUuid(row.id) && !POS_EXCLUDED_LOCATION_IDS.has(String(row.id)))
);

const filterUuidCustomers = (list = []) => (
  (list || []).filter(row => row && isUuid(row.id))
);

const pickValidLocationId = (candidates = [], locationsList = []) => {
  const validIds = new Set((locationsList || []).map((row) => String(row.id)));
  for (const candidate of candidates) {
    const id = String(candidate || '').trim();
    if (isUuid(id) && validIds.has(id)) return id;
  }
  const first = (locationsList || []).find((row) => isUuid(row?.id));
  return first ? String(first.id) : '';
};

const mergeLocations = (rows = [], extras = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    if (!row || row.id == null) return;
    map.set(String(row.id), row);
  });
  (extras || []).forEach((row) => {
    if (!row || row.id == null) return;
    const key = String(row.id);
    if (!map.has(key)) map.set(key, row);
  });
  return Array.from(map.values());
};

const buildComboLocationsByCombo = (rows = []) => {
  const map = {};
  (rows || []).forEach((row) => {
    const comboId = row?.combo_id == null ? '' : String(row.combo_id);
    const locationId = row?.location_id == null ? '' : String(row.location_id);
    if (!comboId || !locationId) return;
    if (!map[comboId]) map[comboId] = new Set();
    map[comboId].add(locationId);
  });
  return map;
};

const comboIsAvailableAtLocation = (combo, locationId, comboLocationsByCombo = {}) => {
  const selectedLocationId = locationId == null ? '' : String(locationId);
  if (!selectedLocationId) return false;

  const explicitLocationIds = comboLocationsByCombo[String(combo?.id)]
    ? Array.from(comboLocationsByCombo[String(combo.id)])
    : [];

  if (explicitLocationIds.length > 0) {
    return explicitLocationIds.includes(selectedLocationId);
  }

  const embeddedLocationIds = Array.isArray(combo?.combo_locations)
    ? combo.combo_locations
      .map((row) => (row?.location_id == null ? '' : String(row.location_id)))
      .filter(Boolean)
    : [];

  if (embeddedLocationIds.length > 0) {
    return embeddedLocationIds.includes(selectedLocationId);
  }

  // Legacy combos may have no combo_locations rows at all. In that case,
  // let stock calculation decide visibility for the current location.
  return true;
};

export default function POS({ isMobile = false }) {
  // Place ALL hooks here, inside the function!
  const navigate = useNavigate();
  const [saleTypeFilter, setSaleTypeFilter] = useState('all');
  // Removed per request: history uses the selected customer at top
  const [amountFilter, setAmountFilter] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [dateInput, setDateInput] = useState(() => formatDateDisplay(new Date().toISOString().slice(0, 10)));
  const datePickerRef = useRef(null);
  const posContainerRef = useRef(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", phonePrefix: "+260", tpin: "", address: "", city: "" });
  const [editCustomerForm, setEditCustomerForm] = useState({ id: null, name: "", phone: "", tpin: "", address: "", city: "", currency: 'K' });
  const [customerError, setCustomerError] = useState("");
  const [editCustomerError, setEditCustomerError] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [editCustomerLoading, setEditCustomerLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pdfPreviewBusy, setPdfPreviewBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSuccess, setCheckoutSuccess] = useState("");
  const [currency, setCurrency] = useState('K');
  const currencyLabel = getCurrencyLabel(currency);
  const [products, setProducts] = useState([]);
  const [sets, setSets] = useState([]);
  const [comboItemsByCombo, setComboItemsByCombo] = useState({}); // combo_id -> [{product_id, quantity, name?, sku?}]
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0); // manual trigger when realtime misses
  const forceCatalogRefresh = () => setCatalogRefreshKey((key) => key + 1);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{product, qty, price, color, vat}]
  const [vatIncluded, setVatIncluded] = useState(true);
  const [discountAll, setDiscountAll] = useState(0);
  // Multiple payments support: array of { method, amount (string for UI), ref }
  const [paymentLines, setPaymentLines] = useState([{ method: 'Cash', amount: '', ref: '' }]);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDuplicateError, setReceiptDuplicateError] = useState("");
  const receiptDuplicateCheckRef = useRef(0);
  const [customerLaybys, setCustomerLaybys] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [customPriceIdx, setCustomPriceIdx] = useState(null);
  const [customPriceValue, setCustomPriceValue] = useState('');
  const [customPriceError, setCustomPriceError] = useState('');
  const [showCustomProductModal, setShowCustomProductModal] = useState(false);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: '', qty: 1 });
  const [customProductError, setCustomProductError] = useState('');
  const [catalogPriceDrafts, setCatalogPriceDrafts] = useState({});
  const [catalogPriceErrors, setCatalogPriceErrors] = useState({});
  const [catalogPriceSaving, setCatalogPriceSaving] = useState('');
  const [posUser, setPosUser] = useState(() => getCurrentUser());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [inventoryDeductedMsg, setInventoryDeductedMsg] = useState(""); // New state for inventory deducted message
  const [remainingDue, setRemainingDue] = useState(0); // Total due across active laybys
  const [activeLaybyId, setActiveLaybyId] = useState(null); // first active layby for hook-driven rollup
  // Hook for active layby (if any) to keep its rollup fresh without manual recompute
  const { statement: activeLaybyStatement, rollups: activeLaybyRollups } = useLaybyData(selectedCustomer, activeLaybyId);
  const activeLaybyOutstanding = activeLaybyRollups?.outstanding;
  // Fahme constants centralized in laybyRules.js
  // Decision modal when advance < sale total and outstanding remains
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(null); // holds computed checkout data until user decides
  const canAddCustomProduct = !POS_CUSTOM_PRODUCT_BLOCKED_USERS.has(String(posUser?.id || '').toLowerCase());
  // Realtime ticks for key tables
  const rtTickCustomers = useRealtimeRefresh(['customers'], 250, isUuid(selectedCustomer) ? { customers: { column: 'id', value: selectedCustomer } } : undefined);
  // Include sales_items so any product/qty/price edits trigger refresh of outstanding & PDF data
  const rtTickLayby = useRealtimeRefresh(['laybys','sales','sales_payments','sales_items'], 250, isUuid(selectedCustomer) ? {
    laybys: { column: 'customer_id', value: selectedCustomer },
    sales: { column: 'customer_id', value: selectedCustomer },
    sales_payments: undefined,
    sales_items: undefined,
  } : undefined);
  const rtTickCatalog = useRealtimeRefresh(
    ['products','inventory','combos','combo_items','product_locations','combo_locations','product_location_prices','combo_location_prices'],
    250,
    isUuid(selectedLocation) ? {
      inventory: { column: 'location', value: selectedLocation },
      product_locations: { column: 'location_id', value: selectedLocation },
      combo_locations: { column: 'location_id', value: selectedLocation },
    } : undefined
  );

  // Removed: credit refresh logic and ledger reconciliation

  // Dev-only probe to surface local environment misconfigurations
  useEffect(() => { try { probeSupabaseOnce('POS'); } catch {} }, []);
  useEffect(() => { setPosUser(getCurrentUser()); }, []);
  useEffect(() => {
    const trimmed = receiptNumber.trim();
    if (!trimmed) {
      setReceiptDuplicateError("");
      return undefined;
    }

    const checkId = receiptDuplicateCheckRef.current + 1;
    receiptDuplicateCheckRef.current = checkId;
    const timer = setTimeout(async () => {
      const formatted = formatPosReceiptNumber(receiptNumber);
      try {
        const existing = await findExistingReceiptSale(supabase, 'sales', formatted);
        if (receiptDuplicateCheckRef.current !== checkId) return;
        setReceiptDuplicateError(existing ? RECEIPT_DUPLICATE_ERROR : "");
      } catch (_) {
        if (receiptDuplicateCheckRef.current !== checkId) return;
        setReceiptDuplicateError("");
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [receiptNumber]);
  useEffect(() => {
    const root = posContainerRef.current;
    if (!root) return undefined;
    root.addEventListener('wheel', blockNumberInputWheel, { passive: false, capture: true });
    return () => root.removeEventListener('wheel', blockNumberInputWheel, { capture: true });
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authUid = data?.user?.id;
        if (!authUid || !isUuid(authUid)) return;
        setPosUser((current) => {
          const base = current || getCurrentUser();
          if (!base) return current;
          if (isUuid(base.user_uid) || isUuid(base.id)) return base;
          return {
            ...base,
            id: authUid,
            user_uid: authUid,
            user_id: Number.isFinite(Number(base.user_id)) ? Number(base.user_id)
              : (Number.isFinite(Number(base.id)) ? Number(base.id) : null),
          };
        });
      } catch {}
    })();
  }, []);
  useEffect(() => {
    const nextDate = parseDateDisplay(dateInput);
    if (nextDate && nextDate !== date) setDate(nextDate);
  }, [dateInput, date]);

  // When realtime changes occur on layby-related tables, refresh the selected customer's balances immediately
  useEffect(() => {
    (async () => {
      if (selectedCustomer) {
        try {
          await fetchCustomerLaybys(selectedCustomer);
          const { data: freshCust } = await fromPublic('customers')
            .select('id, credit_balance')
            .eq('id', selectedCustomer)
            .single();
          if (freshCust) {
            setCustomers(prev => prev.map(c => String(c.id) === String(selectedCustomer)
              ? { ...c, credit_balance: Number(freshCust.credit_balance || 0) }
              : c));
          }
        } catch {}
      }
    })();
  }, [rtTickLayby]);

  // Fetch locations and customers (hydrate from cache, then revalidate)
  useEffect(() => {
    try {
      const locSnap = cacheGet('pos:locations:v2');
      if (locSnap) setLocations(filterLocations(mergeLocations(locSnap, POS_REQUIRED_LOCATIONS)));
      const custSnap = cacheGet('pos:customers:v2');
      if (custSnap) setCustomers(filterUuidCustomers(dedupeCustomers((custSnap || []).map(normalizeCustomerRecord))));
    } catch {}
    (async () => {
      let locs = [];
      try {
        const { data, error } = await fromPublic('locations').select('id, name');
        if (error) throw error;
        locs = data || [];
      } catch {
        try {
          locs = await fetchPosLocationsViaApi();
        } catch {
          locs = [];
        }
      }

      const mergedLocs = filterLocations(mergeLocations(locs, POS_REQUIRED_LOCATIONS));
      setLocations(mergedLocs);
      try { cacheSet('pos:locations:v2', mergedLocs, 10 * 60 * 1000); } catch {}
      try {
        const stored = localStorage.getItem('pos:selectedLocation');
        if (stored && !isUuid(stored)) {
          localStorage.removeItem('pos:selectedLocation');
        }
        setSelectedLocation((current) => pickValidLocationId(
          [current, stored && isUuid(stored) ? stored : null],
          mergedLocs
        ));
      } catch {}
      // Fetch customers directly from Supabase
      try {
        let rows = [];
        try {
          const { data, error } = await fromPublic('customers')
            .select('id, name, phone, currency, opening_balance, credit_balance')
            .order('name', { ascending: true });
          if (error) throw error;
          rows = data || [];
        } catch (directErr) {
          try {
            const resp = await fetch('/api/customers');
            const json = await resp.json();
            if (json?.ok && Array.isArray(json.rows)) {
              rows = json.rows;
            } else {
              throw new Error(json?.error || 'Customer API returned no data');
            }
          } catch (apiErr) {
            rows = [];
          }
        }
        const normalizedCustomers = filterUuidCustomers(dedupeCustomers((rows || []).map(normalizeCustomerRecord)));
        setCustomers(normalizedCustomers);
        try { cacheSet('pos:customers:v2', normalizedCustomers, 5 * 60 * 1000); } catch {}
      } catch {
        setCustomers([]);
      }
    })();
  }, [rtTickCustomers]);

  useEffect(() => {
    try {
      if (selectedLocation && isUuid(selectedLocation)) {
        localStorage.setItem('pos:selectedLocation', selectedLocation);
      }
    } catch {}
  }, [selectedLocation]);

  useEffect(() => {
    if (selectedCustomer && !isUuid(selectedCustomer)) {
      setSelectedCustomer('');
    }
  }, [selectedCustomer, customers]);


  // --- FIXED LOGIC BELOW ---
  useEffect(() => {
    if (!selectedLocation || !isUuid(selectedLocation)) {
      setProducts([]);
      setSets([]);
      return;
    }

    async function fetchProductsAndSets() {
      // Serve cached per-location snapshot instantly
      try {
        const key = `pos:catalog:${selectedLocation}`;
        const snap = cacheGet(key);
        if (snap && snap.products && snap.sets) {
          setProducts((snap.products || []).filter((p) => isUuid(p?.id)));
          setSets(snap.sets || []);
        }
      } catch {}
      // Fetch inventory minimal shape, then hydrate products and locations to avoid 406/400s
      const [invSnap, combosRes, comboLocationsRes, comboItemsRes, locRowsRes, productLocationPricesRes, comboLocationPricesRes] = await Promise.all([
        fetchInventorySnapshot(selectedLocation),
        fromPublic('combos')
          .select('id, combo_name, sku, standard_price, promotional_price, combo_price, currency'),
        fromPublic('combo_locations')
          .select('combo_id, location_id'),
        fromPublic('combo_items')
          .select('combo_id, product_id, quantity'),
        fromPublic('product_locations')
          .select('product_id, location_id')
          .eq('location_id', selectedLocation),
        fetchProductLocationPricesForLocation(supabase, selectedLocation).catch(() => []),
        fetchComboLocationPricesForLocation(supabase, selectedLocation).catch(() => []),
      ]);

      let combosData = combosRes?.data || [];
      let comboLocationsData = comboLocationsRes?.data || [];
      let comboItemsData = comboItemsRes?.data || [];
      let locRowsSafe = locRowsRes?.data || [];
      let directCatalogError = combosRes?.error || comboLocationsRes?.error || comboItemsRes?.error || locRowsRes?.error || null;
      const productLocationPriceMap = buildProductLocationPriceMap(productLocationPricesRes || []);
      const comboLocationPriceMap = buildComboLocationPriceMap(comboLocationPricesRes || []);

      let invData = (invSnap?.data || []).map(r => ({ product_id: r.product_id, quantity: r.quantity }));
      // Collect valid product ids from inventory or location links
      const prodIds = Array.from(new Set([
        ...(invData || []).map(r => r.product_id),
        ...(locRowsSafe || []).map(r => r.product_id),
      ].filter((id) => isUuid(id))));
      let prodRows = [];
      if (prodIds.length) {
        const chunks = chunkArray(prodIds, 200);
        for (const chunk of chunks) {
          const { data: pRows, error: pErr } = await fromPublic('products')
            .select('id, name, sku, price, promotional_price, currency')
            .in('id', chunk);
          if (pErr) {
            directCatalogError = directCatalogError || pErr;
            continue;
          }
          prodRows = prodRows.concat(pRows || []);
        }
      } else {
        const { data: allProducts, error: allProductsErr } = await fromPublic('products')
          .select('id, name, sku, price, promotional_price, currency');
        if (allProductsErr) {
          directCatalogError = directCatalogError || allProductsErr;
        }
        prodRows = allProducts || [];
      }

      if (directCatalogError || !prodRows.length) {
        try {
          const fallbackRows = await fetchPosCatalogViaApi({
            locationId: selectedLocation,
            productIds: prodIds,
          });
          combosData = Array.isArray(fallbackRows?.combos) ? fallbackRows.combos : combosData;
          comboLocationsData = Array.isArray(fallbackRows?.combo_locations) ? fallbackRows.combo_locations : comboLocationsData;
          comboItemsData = Array.isArray(fallbackRows?.combo_items) ? fallbackRows.combo_items : comboItemsData;
          locRowsSafe = Array.isArray(fallbackRows?.product_locations) ? fallbackRows.product_locations : locRowsSafe;
          if (!prodRows.length || directCatalogError) {
            prodRows = Array.isArray(fallbackRows?.products) ? fallbackRows.products : prodRows;
          }
        } catch {}
      }

      const productMap = {};
      const allowedProductIds = prodIds.length ? new Set(prodIds.map(id => String(id))) : null;
      // Aggregate inventory by product for this location
      const qtyByProduct = {};
      (invData || []).forEach(r => {
        if (!r.product_id) return;
        qtyByProduct[r.product_id] = (qtyByProduct[r.product_id] || 0) + Number(r.quantity || 0);
      });
      (prodRows || []).forEach(p => {
        if (allowedProductIds && !allowedProductIds.has(String(p.id))) return;
        const priced = applyProductLocationPricing(p, selectedLocation, productLocationPriceMap);
        productMap[p.id] = {
          ...priced,
          stock: Number(qtyByProduct[p.id] || 0),
        };
      });

      const comboLocationsByCombo = buildComboLocationsByCombo(comboLocationsData || []);

      // Filter combos for this location
      const combosForLocation = (combosData || []).filter(combo => {
        return comboIsAvailableAtLocation(combo, selectedLocation, comboLocationsByCombo);
      });
      // Filtered combos for this location
      // Centralized set inventory calculation
      function getSetQty(comboId) {
        const items = comboItemsData.filter(ci => String(ci.combo_id) === String(comboId));
        const productStock = {};
        Object.values(productMap).forEach(p => { productStock[p.id] = p.stock; });
        return getMaxSetQty(items, productStock);
      }

      // Create filtered sets
          const filteredSets = combosForLocation
            .map(combo => {
              const priced = applyComboLocationPricing(combo, selectedLocation, comboLocationPriceMap);
              const setQty = getSetQty(priced.id);
          const basePrice = (priced.combo_price ?? priced.standard_price ?? 0);
          const promoPrice = (priced.promotional_price ?? 0);
          return {
            ...priced,
            name: priced.combo_name, // ensure table shows the set name
            price: basePrice, // base price stored; UI uses getBestPrice(promotional_price, price)
            promotional_price: promoPrice,
            currency: priced.currency ?? '',
            stock: setQty,
            isSet: true,
          };
        })
        .filter(set => set.stock > 0);
      setSets(filteredSets);

      // Calculate used stock per product for sets
      const usedStock = {};
      filteredSets.forEach(set => {
        const setQty = set.stock;
        comboItemsData
          .filter(ci => ci.combo_id === set.id)
          .forEach(item => {
            usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
          });
      });

      // Keep zero-stock items visible but mark them as unavailable
      const filteredProducts = Object.values(productMap)
        .map(p => {
          const remainingStock = p.stock - (usedStock[p.id] || 0);
          return {
            ...p,
            stock: remainingStock,
            stockState: remainingStock > 0 ? 'in-stock' : (p.stock > 0 ? 'reserved' : 'out'),
          };
        });

      setProducts(filteredProducts);
      // Build quick lookup of combo items enriched with names/SKUs for UI transparency
      try {
        const map = {};
        (comboItemsData || []).forEach(ci => {
          const prod = productMap[ci.product_id];
          if (!map[ci.combo_id]) map[ci.combo_id] = [];
          map[ci.combo_id].push({
            product_id: ci.product_id,
            quantity: Number(ci.quantity || 0),
            name: prod?.name || '',
            sku: prod?.sku || ''
          });
        });
        setComboItemsByCombo(map);
      } catch {}
      // Cache snapshot for this location to make next entry instant
      try { cacheSet(`pos:catalog:${selectedLocation}`, { products: filteredProducts, sets: filteredSets }, 2 * 60 * 1000); } catch {}
    }

    fetchProductsAndSets();
  }, [selectedLocation, rtTickCatalog, catalogRefreshKey]);
  // --- END OF FIXED LOGIC ---



  // When customer changes, fetch laybys and refresh their current credit/ledger immediately
  useEffect(() => {
    // No credit refresh; only laybys and currency
    if (selectedCustomer) {
      // noop for credit
    }
    fetchCustomerLaybys(selectedCustomer);
    // Also fetch credit ledger entries for the selected customer
    // (Already called above when selectedCustomer exists)
    // Set POS currency from selected customer's preferred currency when customer changes
    const cust = customers.find(c => String(c.id) === String(selectedCustomer));
    if (cust?.currency) setCurrency(normalizeCurrencyCode(cust.currency));
  }, [selectedCustomer, rtTickLayby]);

  // Refresh ledger when customer/ledger changes (realtime on customers & ledger tables)
  useEffect(() => {
    // No credit ledger polling
  }, [rtTickCustomers]);

  // Fetch permissions and actions
  // Removed permissions fetching logic for open access




  // Removed user and checkingUser checks for open access

  // Helper: get correct price (use promo if present and > 0, else use price if present and > 0)
  const getBestPrice = (item) => selectPrice(item.promotional_price, item.price);

  const getCatalogPriceKey = (item, isSet = false) => `${isSet ? 'set' : 'product'}:${item?.id}`;

  const needsCatalogPrice = (item) => getBestPrice(item) <= 0;

  const patchPosCatalogCache = (mutator) => {
    if (!selectedLocation) return;
    try {
      const cacheKey = `pos:catalog:${selectedLocation}`;
      const snap = cacheGet(cacheKey);
      if (!snap) return;
      const next = mutator({
        products: Array.isArray(snap.products) ? [...snap.products] : [],
        sets: Array.isArray(snap.sets) ? [...snap.sets] : [],
      });
      cacheSet(cacheKey, next, 2 * 60 * 1000);
    } catch {}
  };

  const saveCatalogPrice = async (item, isSet = false) => {
    const key = getCatalogPriceKey(item, isSet);
    const raw = String(catalogPriceDrafts[key] ?? '').trim();
    const price = parseAmountInput(raw);
    if (!Number.isFinite(price) || price <= 0) {
      setCatalogPriceErrors((prev) => ({ ...prev, [key]: 'Enter a valid price greater than 0.' }));
      return;
    }

    setCatalogPriceSaving(key);
    setCatalogPriceErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      if (isSet) {
        await saveComboLocationPrice(supabase, {
          comboId: item.id,
          locationId: selectedLocation,
          field: 'price',
          value: price,
          baseCombo: item,
        });

        const updatedSet = {
          ...item,
          price,
          standard_price: price,
          combo_price: price,
          isSet: true,
        };
        setSets((prev) => prev.map((row) => (
          String(row.id) === String(item.id) ? { ...row, ...updatedSet } : row
        )));
        patchPosCatalogCache((snap) => ({
          ...snap,
          sets: snap.sets.map((row) => (
            String(row.id) === String(item.id) ? { ...row, ...updatedSet } : row
          )),
        }));
      } else {
        await saveProductLocationPrice(supabase, {
          productId: item.id,
          locationId: selectedLocation,
          field: 'price',
          value: price,
          baseProduct: item,
        });

        const updatedProduct = { ...item, price };
        setProducts((prev) => prev.map((row) => (
          String(row.id) === String(item.id) ? { ...row, ...updatedProduct } : row
        )));
        patchPosCatalogCache((snap) => ({
          ...snap,
          products: snap.products.map((row) => (
            String(row.id) === String(item.id) ? { ...row, ...updatedProduct } : row
          )),
        }));
      }

      const itemName = isSet ? (item.combo_name || item.name) : item.name;
      logUserActivity({
        actionType: 'product_price_change',
        actionLabel: 'POS Catalog Price Set',
        details: `${itemName} • price set to ${price}`,
        reference: 'price',
        entityType: isSet ? 'combo' : 'product',
        entityId: String(item.id),
        route: '/pos',
      });

      setCatalogPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      setCatalogPriceErrors((prev) => ({
        ...prev,
        [key]: err?.message || 'Failed to save price.',
      }));
    } finally {
      setCatalogPriceSaving('');
    }
  };

  const renderCatalogPriceEditor = (item, isSet = false) => {
    const key = getCatalogPriceKey(item, isSet);
    const saving = catalogPriceSaving === key;
    const error = catalogPriceErrors[key];
    return (
      <div
        className="pos-catalog-price-edit"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="pos-catalog-price-edit__label">Set price to sell</div>
        <input
          type="number"
          min="0"
          step="any"
          className="pos-catalog-price-edit__input"
          placeholder={`Price (${currencyLabel})`}
          value={catalogPriceDrafts[key] ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            setCatalogPriceDrafts((prev) => ({ ...prev, [key]: value }));
            setCatalogPriceErrors((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveCatalogPrice(item, isSet);
            }
          }}
          disabled={saving}
        />
        <button
          type="button"
          className="pos-catalog-price-edit__save"
          onClick={() => saveCatalogPrice(item, isSet)}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Price'}
        </button>
        {error && <div className="pos-catalog-price-edit__error">{error}</div>}
      </div>
    );
  };

  const parseAmountInput = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '').trim();
    if (!cleaned) return 0;
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  // Add product or set to cart
  const addToCart = (item) => {
    setCart((prev) => {
      const basePrice = getBestPrice(item);
      return [
        ...prev,
        {
          ...item,
          qty: 1,
          price: basePrice,
          isSet: item.isSet || false,
          isCustom: false,
          color: '',
        }
      ];
    });
  };

  // Add custom product/service to cart
  const addCustomProductToCart = () => {
    if (!canAddCustomProduct) {
      setCustomProductError('Custom products are disabled for your account.');
      return;
    }
    setCustomProductError('');
    const name = customProductForm.name.trim();
    const price = Number(customProductForm.price);
    const qty = Number(customProductForm.qty);
    if (!name || isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
      setCustomProductError('Enter valid name, price, and quantity.');
      return;
    }
    setCart([
      ...cart,
      {
        id: `custom-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        name,
        sku: '',
        qty,
        price,
        isCustom: true,
        isSet: false,
        currency,
        color: ''
      }
    ]);
    setShowCustomProductModal(false);
    setCustomProductForm({ name: '', price: '', qty: 1 });
  };

  const handleProductClick = (product) => {
    if (!product || Number(product.stock || 0) <= 0) return;
    if (needsCatalogPrice(product)) return;
    addToCart(product);
  };

  const handleSetClick = (set) => {
    if (needsCatalogPrice(set)) return;
    addToCart(set);
  };

  // Update cart item
  const updateCartItem = (idx, changes) => {
    setCart(prev => prev.map((item, i) => (i === idx ? { ...item, ...changes } : item)));
  };

  const openCustomPriceModal = (idx, price) => {
    setCustomPriceIdx(idx);
    setCustomPriceValue(price != null && price !== '' ? String(price) : '');
    setCustomPriceError('');
    setShowCustomPriceModal(true);
  };

  const closeCustomPriceModal = () => {
    setShowCustomPriceModal(false);
    setCustomPriceIdx(null);
    setCustomPriceValue('');
    setCustomPriceError('');
  };

  const handleSaveCustomPrice = () => {
    if (customPriceIdx === null) return;
    const raw = String(customPriceValue ?? '').trim();
    const price = Number(raw);
    if (raw === '' || !Number.isFinite(price) || price < 0) {
      setCustomPriceError('Enter a valid price (0 or greater).');
      return;
    }
    updateCartItem(customPriceIdx, { price, overrideCurrency: currency });
    closeCustomPriceModal();
  };

  // Remove cart item
  const removeCartItem = (idx) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // Add new customer (modal logic)
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setCustomerError("");
    setCustomerLoading(true);
    if (!customerForm.name.trim() && !customerForm.phone.trim()) {
      setCustomerError("Please enter at least one field (name or phone).");
      setCustomerLoading(false);
      return;
    }
    // Capitalize name before saving
    const name = capitalizeWords(customerForm.name.trim());
    // Prevent duplicates: check by canonicalized name and normalized phone
    const nameKey = canonicalName(name);
    const existingByName = customers.find(c => canonicalName(String(c.name || '')) === nameKey);
    const fullPhone = (() => {
      const raw = (customerForm.phone || '').trim();
      const prefix = (customerForm.phonePrefix || '').trim();
      if (!raw) return '';
      // Strip leading zeros and existing prefix duplicates
      const digits = raw.replace(/\D/g, '');
      const normalized = digits.replace(/^0+/, '');
      // If user already typed the prefix digits at start, avoid duplication
      const prefixDigits = (prefix || '').replace(/\D/g, '');
      const finalDigits = normalized.startsWith(prefixDigits) ? normalized : `${prefixDigits}${normalized}`;
      return `+${finalDigits}`;
    })();
    const existingByPhone = fullPhone ? customers.find(c => normalizePhone(c.phone) === normalizePhone(fullPhone)) : null;
    if (existingByName || existingByPhone) {
      setCustomerError('A customer with the same name or phone already exists. Please select the existing customer or use a distinct name.');
      setCustomerLoading(false);
      return;
    }
    try {
      const dupeFilters = [];
      if (name) dupeFilters.push(`name.ilike.${name}`);
      if (fullPhone) dupeFilters.push(`phone.eq.${fullPhone}`);
      if (dupeFilters.length) {
        const { data: dupeRows, error: dupeErr } = await fromPublic('customers')
          .select('id, name, phone')
          .or(dupeFilters.join(','));
        if (dupeErr) throw dupeErr;
        if ((dupeRows || []).length > 0) {
          setCustomerError('A customer with the same name or phone already exists. Please select the existing customer or use a distinct name.');
          setCustomerLoading(false);
          return;
        }
      }
    } catch (dupeCheckErr) {
      // If browser-side reads are blocked in production, the API save path below
      // performs the same dedupe using the service-role client.
    }
    const payload = {
      name,
      phone: fullPhone,
      tpin: customerForm.tpin.trim(),
      address: customerForm.address.trim(),
      city: customerForm.city.trim(),
      currency: normalizeCurrencyCode(currency),
    };
    try {
      let customer = null;
      try {
        const { data, error: saveErr } = await fromPublic('customers')
          .insert([payload])
          .select('*')
          .single();
        if (saveErr) throw saveErr;
        customer = data;
      } catch (directErr) {
        customer = await saveCustomerViaApi(payload);
        if (!customer) throw directErr;
      }
      setCustomers((prev) => {
        const exists = prev.find(c => String(c.id) === String(customer.id));
        if (exists) return prev.map(c => String(c.id) === String(customer.id) ? { ...exists, ...customer } : c);
        return [...prev, customer];
      });
      setSelectedCustomer(customer.id);
      if (customer.currency) setCurrency(normalizeCurrencyCode(customer.currency));
      setShowCustomerModal(false);
      setCustomerForm({ name: "", phone: "", phonePrefix: "+260", tpin: "", address: "", city: "", currency: 'K' });
    } catch (error) {
      setCustomerError(error.message || 'Failed to save customer');
    }
    setCustomerLoading(false);
  };

  // Edit existing customer (modal logic)
  const openEditCustomerModal = (customer) => {
    setEditCustomerForm({
      id: customer.id,
      name: customer.name || "",
      phone: customer.phone || "",
      tpin: customer.tpin || "",
      address: customer.address || "",
  city: customer.city || "",
  currency: normalizeCurrencyCode(customer.currency || 'K')
    });
    setEditCustomerError("");
    setShowEditCustomerModal(true);
  };

  const handleEditCustomer = async (e) => {
    e.preventDefault();
    setEditCustomerError("");
    setEditCustomerLoading(true);
    if (!editCustomerForm.name.trim()) {
      setEditCustomerError("Please enter a name or business name.");
      setEditCustomerLoading(false);
      return;
    }
    // Capitalize name before saving
    const name = capitalizeWords(editCustomerForm.name.trim());
    const updatePayload = {
      name,
      phone: editCustomerForm.phone.trim(),
      tpin: editCustomerForm.tpin.trim(),
      address: editCustomerForm.address.trim(),
      city: editCustomerForm.city.trim(),
      currency: normalizeCurrencyCode(editCustomerForm.currency || 'K'),
    };
    try {
      const nameKey = canonicalName(name);
      const phoneKey = normalizePhone(editCustomerForm.phone);
      const hasDupe = customers.some(c => {
        if (String(c.id) === String(editCustomerForm.id)) return false;
        const sameName = nameKey && canonicalName(c.name) === nameKey;
        const samePhone = phoneKey && normalizePhone(c.phone) === phoneKey;
        return sameName || samePhone;
      });
      if (hasDupe) {
        setEditCustomerError('A customer with this name or phone already exists.');
        setEditCustomerLoading(false);
        return;
      }
      let updated = null;
      try {
        const { data, error: upErr } = await fromPublic('customers')
          .update(updatePayload)
          .eq('id', editCustomerForm.id)
          .select('*')
          .single();
        if (upErr) throw upErr;
        updated = data;
      } catch (directErr) {
        updated = await saveCustomerViaApi({ ...updatePayload, id: editCustomerForm.id });
        if (!updated) throw directErr;
      }
      setCustomers((prev) => prev.map(c => c.id === editCustomerForm.id ? { ...c, ...updated } : c));
      setShowEditCustomerModal(false);
      if (selectedCustomer === editCustomerForm.id) {
        setSelectedCustomer(editCustomerForm.id);
      }
    } catch (e) {
      setEditCustomerError(e.message || 'Failed to update customer');
    }
    setEditCustomerLoading(false);
  };

  // Calculate totals (VAT is inclusive, not added)
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty)), 0);
  const discountAmount = Number(discountAll) || 0;
  const total = subtotal - discountAmount;
  // Downpayment-only model: no credit auto-apply; any prior "credit" is not used here.
  const selectedCustObj = customers.find(c => String(c.id) === String(selectedCustomer));

  // Auto-fill the payment line(s) with the cart total. Lines the user has not
  // manually edited share the remaining balance equally, so adding another
  // payment splits the total automatically.
  const paymentManualSignature = (paymentLines || [])
    .map(L => `${L.manual ? 1 : 0}:${L.manual ? L.amount : ''}`)
    .join('|');
  useEffect(() => {
    setPaymentLines(lines => {
      const list = lines || [];
      if (list.length === 0) return list;
      const manualSum = list.reduce((s, L) => s + (L.manual ? parseAmountInput(L.amount) : 0), 0);
      const autoLines = list.filter(L => !L.manual);
      if (autoLines.length === 0) return list;
      const remaining = Math.max(0, total - manualSum);
      const nextAmount = total > 0 ? (remaining / autoLines.length).toFixed(2) : '';
      let changed = false;
      const next = list.map(L => {
        if (L.manual) return L;
        if (L.amount !== nextAmount) { changed = true; return { ...L, amount: nextAmount }; }
        return L;
      });
      return changed ? next : list;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, paymentManualSignature]);

  // Explicit credit top-up without creating a sale
  // Removed: addCustomerCredit (credit top-up flow)


  // Handle checkout (Supabase integration, supports partial payments/layby)
  // --- Restore inventory logic ---
  // Restore inventory for all products in a layby using only recorded sales_items
  const restoreInventoryForLayby = async (laybyId) => {
    // 1) Find sale and its location
    const { data: laybyData, error: laybyError } = await fromPublic('laybys')
      .select('sale_id')
      .eq('id', laybyId)
      .single();
    if (laybyError || !laybyData?.sale_id) return;
  const saleId = laybyData.sale_id;
    const { data: saleRow, error: saleRowError } = await fromPublic('sales')
      .select('location_id')
      .eq('id', saleId)
      .single();
    if (saleRowError || !saleRow?.location_id) return;
    const restoreLocation = saleRow.location_id;
    // 2) Get sale items and add their quantities back to inventory
    const { data: saleItems } = await fromPublic('sales_items')
      .select('product_id, quantity')
      .eq('sale_id', saleId);
    const ops = [];
    for (const item of saleItems || []) {
      if (!item.product_id) continue; // skip custom lines
      ops.push((async () => {
        const { data: invRows } = await fromPublic('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('location', restoreLocation);
        if (invRows && invRows.length > 0) {
          const invId = invRows[0].id;
          const newQty = (Number(invRows[0].quantity) || 0) + Number(item.quantity);
          await fromPublic('inventory')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', invId);
        } else {
          await fromPublic('inventory')
            .insert([
              {
                product_id: item.product_id,
                location: restoreLocation,
                quantity: Number(item.quantity),
                updated_at: new Date().toISOString()
              }
            ]);
        }
        // Ensure product_locations exists
        const { data: prodLocRows } = await fromPublic('product_locations')
          .select('id')
          .eq('product_id', item.product_id)
          .eq('location_id', restoreLocation);
        if (!prodLocRows || prodLocRows.length === 0) {
          await syncProductLocations({ rows: [{ product_id: item.product_id, location_id: restoreLocation }] }, supabase);
        }
      })());
    }
    await Promise.all(ops);
  };

  // Restore inventory for all laybys of a customer
  const restoreInventoryForCustomer = async (customerId) => {
    // Get all laybys for customer
    const { data: laybys } = await fromPublic('laybys')
      .select('id')
      .eq('customer_id', customerId);
    for (const layby of laybys || []) {
      await restoreInventoryForLayby(layby.id);
    }
  };

  // Handle checkout (Supabase integration, supports partial payments/layby)
  const handleCheckout = async () => {
    setCheckoutError("");
    setCheckoutSuccess("");
    if (!selectedLocation || !selectedCustomer || cart.length === 0) {
      setCheckoutError("Please select location, customer, and add products to cart.");
      return;
    }
    const customerObj = customers.find(c => String(c.id) === String(selectedCustomer));
    const customerId = customerObj ? customerObj.id : null;
    if (!customerId || !isUuid(customerId)) {
      setCheckoutError("Selected customer is not valid. Please select a valid customer.");
      return;
    }
    if (!isUuid(selectedLocation)) {
      setCheckoutError("Selected location is not valid. Please select a location again.");
      return;
    }
    // Require receipt number
    if (!receiptNumber.trim()) {
      setCheckoutError("Please enter a receipt number.");
      return;
    }
    if (receiptDuplicateError) {
      setCheckoutError(receiptDuplicateError);
      return;
    }
    const formattedReceipt = formatPosReceiptNumber(receiptNumber);
    // Prevent selling more than available stock
    for (const item of cart) {
      if (item.isCustom) continue;
      // Find product in products or sets
      let availableStock = null;
      if (item.isSet) {
        // Robustly get numeric combo id from either a number or a string like 'set-123'
        const comboIdInt = typeof item.id === 'string' ? parseInt(String(item.id).replace('set-', ''), 10) : Number(item.id);
        const setObj = sets.find(s => Number(s.id) === Number(comboIdInt));
        availableStock = setObj ? Number(setObj.stock) : null;
      } else {
        const prodObj = products.find(p => p.id === item.id);
        availableStock = prodObj ? prodObj.stock : null;
      }
      if (availableStock !== null && item.qty > availableStock) {
        setCheckoutError(`Cannot sell more than available stock for ${item.name}. Requested: ${item.qty}, Available: ${availableStock}`);
        return;
      }
    }

  // Validate payment against total
  const payAmt = (paymentLines || []).reduce((sum, p) => sum + parseAmountInput(p.amount), 0);
    if (payAmt < 0 || payAmt > total) {
      setCheckoutError("Enter a valid payment amount (<= total).");
      return;
    }
    // Normalize NaN
    const normPayAmt = Number(payAmt || 0);
    // Compute credit usage and outstanding first; if outstanding remains, show decision modal
    const cust = customers.find(c => String(c.id) === String(selectedCustomer));
  // No credit usage
  const currentCredit = 0;
  const useCredit = 0;
  const remainingPay = normPayAmt; // sum of all payment lines now
  const outstandingNow = Math.max(0, total - remainingPay);

    // If there is outstanding, check for existing active layby for this customer.
    // If one exists, automatically accrue to that layby (no modal). Otherwise, auto-create a new layby (no modal).
    if (outstandingNow > 0) {
      const desiredCurrency = normalizeCurrencyCode(currency);
      const activeLayby = (customerLaybys || [])
        .filter(l => String(l.status).toLowerCase() === 'active')
        .find(l => {
          const laybyCurrency = normalizeCurrencyCode(l.sale_currency || l.currency || '');
          return laybyCurrency ? laybyCurrency === desiredCurrency : false;
        });
      if (activeLayby) {
        setCheckoutLoading(true);
        try {
          await finalizeCheckout({
            customerId,
            // removed credit
            remainingPay,
            outstandingNow,
            // removed credit
            ctx: {
              cart: JSON.parse(JSON.stringify(cart)),
              selectedLocation,
              selectedCustomer,
              date,
              currency,
              discountAmount,
              total,
              receiptNumber: formattedReceipt,
            },
            existingLaybyId: activeLayby.id,
          });
        } catch (err) {
          setCheckoutError(err.message || "Checkout failed.");
        }
        setCheckoutLoading(false);
        return;
      }
      // No active layby: automatically create one and attach this sale
      setCheckoutLoading(true);
      try {
        await finalizeCheckout({
          customerId,
          // removed credit
          remainingPay,
          outstandingNow,
          // removed credit
          ctx: {
            cart: JSON.parse(JSON.stringify(cart)),
            selectedLocation,
            selectedCustomer,
            date,
            currency,
            discountAmount,
            total,
            receiptNumber: formattedReceipt,
          }
        });
      } catch (err) {
        setCheckoutError(err.message || "Checkout failed.");
      }
      setCheckoutLoading(false);
      return;
    }

    // Otherwise proceed immediately with a fully paid sale (credit + now covers total)
    setCheckoutLoading(true);
    try {
      await finalizeCheckout({
        customerId,
        remainingPay,
        outstandingNow,
        ctx: {
          cart: JSON.parse(JSON.stringify(cart)),
          selectedLocation,
          selectedCustomer,
          date,
          currency,
          discountAmount,
          total,
          receiptNumber: formattedReceipt,
        }
      });
    } catch (err) {
      setCheckoutError(err.message || "Checkout failed.");
    }
    setCheckoutLoading(false);
  };

  // Helper to execute the checkout DB writes after user chooses to proceed with layby/completed
  const finalizeCheckout = async ({ customerId, remainingPay, outstandingNow, ctx, existingLaybyId = null }) => {
    // Reverted to legacy flow (no RPC) due to schema mismatch (is_layby column not present in sales table in current environment)
    // 1. (Optional) Validate cart
    if (!ctx?.cart?.length) {
      setCheckoutError('Cart is empty.');
      return;
    }

    // Helper to recompute layby paid & status from all related sales & payments
    const recomputeLaybyRollup = async (laybyIdForRollup) => {
      if (!laybyIdForRollup) return;
      try {
        // Find all sales linked to this layby
        const { data: linkedSales } = await fromPublic('sales')
          .select('id, total_amount')
          .eq('layby_id', laybyIdForRollup);
        const saleIds = (linkedSales || []).map(s => s.id);
        let totalAmount = (linkedSales || []).reduce((a, s) => a + Number(s.total_amount || 0), 0);
        // Fallback: if no linked sales yet (should not happen), keep total_amount as-is
        if (!saleIds.length) return;
        // Sum non-credit payments across those sales
        const { data: payRows } = await fromPublic('sales_payments')
          .select('sale_id, amount, payment_type')
          .in('sale_id', saleIds);
        const paid = (payRows || []).filter(p => String(p.payment_type || '').toLowerCase() !== 'credit')
          .reduce((a, p) => a + Number(p.amount || 0), 0);
        const status = paid >= totalAmount ? 'completed' : 'active';
        await fromPublic('laybys')
          .update({ total_amount: totalAmount, paid_amount: paid, status, updated_at: new Date().toISOString() })
          .eq('id', laybyIdForRollup);
      } catch (e) {
        console.warn('Layby rollup recompute failed', e);
      }
    };

  let laybyId = null;
  let saleId = null;

    // Create or update layby FIRST when there is outstanding
    if (outstandingNow > 0) {
      if (existingLaybyId) {
        // We will update totals after inserting sale & payment via rollup; just capture id
        laybyId = existingLaybyId;
      } else {
        const { data: laybyData, error: laybyError } = await fromPublic('laybys')
          .insert([
            {
              customer_id: customerId,
              total_amount: 0, // will be recomputed after sale insertion
              paid_amount: 0,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              notes: null
            }
          ])
          .select();
        if (laybyError) throw laybyError;
        laybyId = laybyData?.[0]?.id;
      }
    }

    // Build sale header + items + payments and perform unified checkout via serverless API
    let storedReceiptNumber = ctx.receiptNumber;

    // If this sale created the layby, back-link laybys.sale_id AFTER the sale is inserted

    // Insert sale items
    const saleItems = [];
    for (const item of ctx.cart) {
      if (item.isCustom) {
        saleItems.push({
          sale_id: saleId,
          product_id: null,
          display_name: item.name,
          quantity: Number(item.qty),
          unit_price: Number(item.price),
          currency: item.currency || ctx.currency,
          color: item.color || null
        });
      } else if (item.isSet) {
        const comboIdInt = typeof item.id === 'string' ? parseInt(String(item.id).replace('set-', ''), 10) : item.id;
        // Add a priced parent line representing the set itself so accounts/PDF show the set name and price
        saleItems.push({
          sale_id: saleId,
          product_id: null,
          display_name: item.name || item.combo_name || 'Set',
          quantity: Number(item.qty),
          unit_price: Number(item.price),
          currency: item.overrideCurrency || item.currency || ctx.currency,
          color: item.color || null
        });
        const { data: comboItemsData } = await fromPublic('combo_items')
          .select('product_id, quantity')
          .eq('combo_id', comboIdInt);
        for (const ci of comboItemsData || []) {
          if (!isUuid(ci.product_id)) continue;
          saleItems.push({
            sale_id: saleId,
            product_id: ci.product_id,
            quantity: Number(ci.quantity) * Number(item.qty),
            unit_price: 0,
            currency: item.overrideCurrency || item.currency || ctx.currency,
            color: item.color || null
          });
        }
      } else {
        if (!isUuid(item.id)) {
          throw new Error(`Product "${item.name || item.id}" has an invalid ID. Refresh the page and add it again.`);
        }
        saleItems.push({
          sale_id: saleId,
          product_id: item.id,
          quantity: Number(item.qty),
          unit_price: Number(item.price),
          currency: item.overrideCurrency || item.currency || ctx.currency,
          color: item.color || null
        });
      }
    }
    const map = {
      'cash': 'cash',
      'bank transfer': 'bank_transfer',
      'mobile money': 'mobile_money',
      'cheque': 'cheque',
      'visa card': 'visa_card',
      'goods': 'goods',
    };
    const payDateIso = ctx.date ? new Date(ctx.date).toISOString() : new Date().toISOString();
    const paymentRows = (paymentLines || [])
      .map(p => ({
        amount: parseAmountInput(p.amount),
        method: p.method,
        ref: p.ref
      }))
      .filter(p => p.amount > 0)
      .map(p => {
        const norm = String(p.method || '').toLowerCase();
        const payment_type = (map[norm] || 'cash');
        const ref = ((p.ref || '').trim()) || ctx.receiptNumber; // keep human receipt reference
        return {
          amount: p.amount,
          payment_type,
          currency: ctx.currency,
          payment_date: payDateIso,
          reference: ref || null,
        };
      });

    const saleActor = resolveSaleActor(posUser);
    const saleHeader = {
      customer_id: customerId,
      sale_date: ctx.date,
      total_amount: ctx.total,
      status: outstandingNow > 0 ? 'layby' : 'completed',
      updated_at: new Date().toISOString(),
      location_id: ctx.selectedLocation,
      layby_id: laybyId,
      currency: ctx.currency,
      discount: ctx.discountAmount,
      receipt_number: storedReceiptNumber,
      user_uid: saleActor.user_uid,
      user_id: saleActor.user_id,
    };
    const { data: chkData, error: chkErr } = await checkoutApi({ sale: saleHeader, items: saleItems, payments: paymentRows });
    if (chkErr) throw chkErr;
    storedReceiptNumber = chkData?.storedReceiptNumber || storedReceiptNumber;
    saleId = chkData?.sale?.id;
    const inventoryAlreadyApplied = chkData?.inventoryApplied === true;

    if (laybyId && saleId && paymentRows.length > 0) {
      try {
        const laybyPaymentRows = paymentRows.map(p => ({
          sale_id: saleId,
          customer_id: customerId,
          amount: p.amount,
          payment_type: p.payment_type,
          currency: p.currency,
          payment_date: p.payment_date,
          reference: p.reference || null,
          notes: null,
          allocation_batch_uuid: p.allocation_batch_uuid || null,
        }));
        const { error: laybyPayErr } = await insertLaybyPayments(laybyPaymentRows, { customerId });
        if (laybyPayErr) {
          console.warn('Failed to write layby payments', laybyPayErr);
        }
      } catch (e) {
        console.warn('Layby payments write failed', e);
      }
    }

    // Back-link layby.sale_id now that we have saleId
    if (laybyId && !existingLaybyId && saleId) {
      try { await fromPublic('laybys').update({ sale_id: saleId }).eq('id', laybyId); } catch {}
    }

  // No credit consumption

    // Recompute layby rollup after payment & sale when outstanding path
    if (laybyId) {
      await recomputeLaybyRollup(laybyId);
    }

    let whatsappWarning = '';
    try {
      const notifyErrors = [];
      const isFahmeCheckout = isFahme(customerId);
      if (isFahmeCheckout) {
        // Fahme accounts never publish individual sale details. Send only the
        // refreshed customer layby statement PDF to the Fahme group.
        const result = await notifyLaybyWhatsApp({
          laybyId: laybyId || existingLaybyId || null,
          customerId,
          eventType: 'statement',
          saleId,
        });
        if (!result?.ok) notifyErrors.push(result?.error || 'Fahme PDF WhatsApp failed');
      } else if (laybyId && !existingLaybyId && outstandingNow > 0) {
        const result = await notifyLaybyWhatsApp({
          laybyId,
          customerId,
          eventType: 'new_layby',
          saleId,
        });
        if (!result?.ok) notifyErrors.push(result?.error || 'Layby WhatsApp failed');
      } else if (laybyId && existingLaybyId && remainingPay > 0) {
        const result = await notifyLaybyWhatsApp({
          laybyId,
          customerId,
          eventType: 'payment',
          saleId,
        });
        if (!result?.ok) notifyErrors.push(result?.error || 'Layby payment WhatsApp failed');
      }
      if (!isFahmeCheckout && saleId && outstandingNow <= 0) {
        const result = await notifySaleWhatsApp({ saleId });
        if (!result?.ok) notifyErrors.push(result?.error || 'Sale WhatsApp failed');
      }
      if (notifyErrors.length) whatsappWarning = notifyErrors.join('; ');
    } catch (e) {
      console.warn('WhatsApp notify failed:', e?.message || e);
      whatsappWarning = e?.message || 'WhatsApp alert failed';
    }

    // 3. Inventory deduction via server API (browser client cannot reliably write inventory due to RLS)
    try {
      const usageMap = {};
      for (const si of saleItems) {
        if (!si.product_id) continue;
        usageMap[si.product_id] = (usageMap[si.product_id] || 0) + Number(si.quantity || 0);
      }
      const usedProducts = Object.keys(usageMap);
      if (!inventoryAlreadyApplied && usedProducts.length > 0) {
        const adjustedProducts = await applySaleInventoryDeductionViaApi({
          items: saleItems,
          locationId: ctx.selectedLocation,
          saleId,
          receiptNumber: storedReceiptNumber,
          userUid: saleActor.user_uid,
          userId: saleActor.user_id,
        });
        if (adjustedProducts > 0) {
          setInventoryDeductedMsg(`Inventory updated for ${adjustedProducts} item(s).`);
        }
      } else if (inventoryAlreadyApplied && usedProducts.length > 0) {
        setInventoryDeductedMsg(`Inventory updated for ${usedProducts.length} item(s).`);
      }

      if (usedProducts.length > 0) {
        // Optimistic in-memory stock decrement so UI reflects change immediately without waiting for realtime
        try {
          const usageSnapshot = { ...usageMap };
          setProducts(prev => {
            if (!Array.isArray(prev) || !prev.length) return prev;
            return prev.map(p => {
              const used = usageSnapshot[p.id];
              if (!used) return p;
              const newStock = (Number(p.stock) || 0) - Number(used || 0);
              return { ...p, stock: newStock };
            });
          });
          // Lightly flag sets to refresh their computed quantity on next render by cloning state
          setSets(prev => Array.isArray(prev) ? prev.map(s => ({ ...s })) : prev);
        } catch (optimisticErr) {
          console.warn('Optimistic inventory update failed (non-fatal):', optimisticErr);
        }
        forceCatalogRefresh();
      }
    } catch (invErr) {
      console.error('Inventory deduction failed (sale still recorded)', invErr);
    }

    setCheckoutSuccess(
      whatsappWarning
        ? `Sale completed. WhatsApp alert failed: ${whatsappWarning}`
        : 'Sale completed successfully!'
    );
    const wasLayby = outstandingNow > 0;
    const wasNewLayby = wasLayby && !existingLaybyId;
    logUserActivity({
      actionType: wasLayby ? 'layby' : 'sale',
      actionLabel: wasNewLayby ? 'Layby Created' : wasLayby ? 'Layby Payment' : 'Sale Completed',
      details: `Receipt ${storedReceiptNumber || saleHeader.receipt_number || ''} • ${ctx.cart.length} item${ctx.cart.length === 1 ? '' : 's'} • Total ${formatAmount(ctx.total, saleHeader.currency || 'K')}${wasLayby ? ` • Outstanding ${formatAmount(outstandingNow, saleHeader.currency || 'K')}` : ''}`,
      reference: storedReceiptNumber || saleHeader.receipt_number || null,
      entityType: wasLayby ? 'layby' : 'sale',
      entityId: wasLayby ? String(laybyId) : (saleId != null ? String(saleId) : null),
    });

    // Refresh balances and reset UI
    try { if (selectedCustomer) await fetchCustomerLaybys(selectedCustomer); } catch {}

    setCart([]);
  setPaymentLines([{ method: 'Cash', amount: '', ref: '' }]);
  setReceiptNumber("");
    setReceiptDuplicateError("");
    setSelectedCustomer("");
    setSearch("");
    setDiscountAll(0);
    setRemainingDue(0);
  fetchCustomerLaybys("");
    if (ctx.selectedLocation) {
      // Minimal refresh: trigger catalog realtime or refetch via existing effect by touching state
      // No-op: use rtTickCatalog to re-run fetch on next tick
    }

    // If this was a newly created layby (partial sale path), perform SPA reset instead of full reload
    try {
      if (laybyId && !existingLaybyId && outstandingNow > 0) {
        // Clear core state explicitly (already mostly done above) and navigate to /pos to ensure route-level remount if desired
        setTimeout(() => {
          try {
            setCart([]);
            setPaymentLines([{ method: 'Cash', amount: '', ref: '' }]);
            setReceiptNumber('');
            setReceiptDuplicateError('');
            setSelectedCustomer('');
            setSearch('');
            setDiscountAll(0);
            setRemainingDue(0);
            // Use navigate to re-enter POS route cleanly (SPA soft reset)
            if (typeof navigate === 'function') navigate('/pos', { replace: true });
          } catch {}
        }, 400);
      }
    } catch {}
  };

  // Decision: user chose "Create Layby"
  const confirmCreateLayby = async () => {
    if (!pendingCheckout) return;
    setShowDecisionModal(false);
    setCheckoutLoading(true);
    try {
      await finalizeCheckout({
        customerId: pendingCheckout.customerId,
        // removed credit fields
        remainingPay: pendingCheckout.remainingPay,
        outstandingNow: pendingCheckout.outstandingNow,
        // removed credit fields
        ctx: {
          cart: pendingCheckout.snapshot.cart,
          selectedLocation: pendingCheckout.snapshot.selectedLocation,
          selectedCustomer: pendingCheckout.snapshot.selectedCustomer,
          date: pendingCheckout.snapshot.date,
          currency: pendingCheckout.snapshot.currency,
          discountAmount: pendingCheckout.snapshot.discountAmount,
          total: pendingCheckout.snapshot.total,
          receiptNumber: pendingCheckout.snapshot.receiptNumber,
        }
      });
    } catch (err) {
      setCheckoutError(err.message || 'Checkout failed.');
    }
    setCheckoutLoading(false);
    setPendingCheckout(null);
  };

  // Removed: Keep as Credit flow

  // Fetch laybys for customer
  const fetchCustomerLaybys = async (customerId) => {
    if (!customerId || !isUuid(customerId)) {
      setCustomerLaybys([]);
      setRemainingDue(0);
      return;
    }
    const { data: laybys } = await fromPublic('laybys')
      .select('id, customer_id, sale_id, total_amount, paid_amount, status, created_at, updated_at')
      .eq('customer_id', customerId)
      .not('status', 'eq', 'completed')
      .order('created_at', { ascending: false });
    let list = laybys || [];
    try {
      const saleIds = Array.from(new Set(list.map(l => l.sale_id).filter(Boolean)));
      const laybyIds = Array.from(new Set(list.map(l => l.id).filter(Boolean)));
      const [salesByIdRes, salesByLaybyRes] = await Promise.all([
        saleIds.length
          ? fromPublic('sales').select('id, currency').in('id', saleIds)
          : Promise.resolve({ data: [] }),
        laybyIds.length
          ? fromPublic('sales').select('id, currency, layby_id').in('layby_id', laybyIds)
          : Promise.resolve({ data: [] }),
      ]);
      const saleCurrencyById = (salesByIdRes.data || []).reduce((acc, row) => {
        acc[String(row.id)] = row.currency || null;
        return acc;
      }, {});
      const saleCurrencyByLayby = (salesByLaybyRes.data || []).reduce((acc, row) => {
        const key = String(row.layby_id || '');
        if (!key) return acc;
        if (!acc[key]) acc[key] = row.currency || null;
        return acc;
      }, {});
      list = list.map(l => {
        const direct = saleCurrencyById[String(l.sale_id)] || null;
        const viaLayby = saleCurrencyByLayby[String(l.id)] || null;
        const resolved = direct || viaLayby || null;
        return {
          ...l,
          sale_currency: resolved ? normalizeCurrencyCode(resolved) : null,
        };
      });
    } catch {}
  // Compute customer-wide due using the exact LaybyManagement aggregation
  let totalOutstanding = 0;
  try { totalOutstanding = await computeCustomerOutstandingLikeLaybyPage(supabase, customerId); }
    catch { /* fallback below */ }
    if (!Number.isFinite(totalOutstanding) || totalOutstanding < 0) {
      try {
        const rollups = await computeLaybyRollups(supabase, list);
        totalOutstanding = Object.values(rollups || {}).reduce((acc, r) => acc + Math.max(0, Number(r.outstanding || (Number(r.total||0) - Number(r.paid||0)))), 0);
      } catch {
        totalOutstanding = (list || []).reduce((acc, row) => acc + Math.max(0, Number(row.total_amount||0) - Number(row.paid_amount||0)), 0);
      }
    }

    // Note: Removed previous Fahme-only override. We now always show the aggregation that matches LaybyManagement.
    // Ensure list stored for UI components relying on customerLaybys
    setCustomerLaybys(list);
    setRemainingDue(totalOutstanding);
    // Track first active layby for hook rollups
    try {
      const desiredCurrency = normalizeCurrencyCode(currency);
      const firstActive = (list || []).find(l => {
        if (String(l.status || '').toLowerCase() !== 'active') return false;
        const laybyCurrency = normalizeCurrencyCode(l.sale_currency || l.currency || '');
        return laybyCurrency ? laybyCurrency === desiredCurrency : false;
      });
      setActiveLaybyId(firstActive ? firstActive.id : (list?.[0]?.id || null));
    } catch { setActiveLaybyId(null); }
  };

  // Removed: fetchCustomerCreditLedger

  // Delete sale and restore inventory
  const deleteSale = async (saleId) => {
    setCheckoutError("");
    setCheckoutSuccess("");
    setDeleteLoading(true);
    try {
      // 1. Restore inventory for all products in the sale (only for the sale's location)
      const { data: saleRow } = await fromPublic('sales')
        .select('location_id')
        .eq('id', saleId)
        .maybeSingle();
      const restoreLocation = saleRow?.location_id || selectedLocation;

      const { data: saleItems, error: saleItemsError } = await fromPublic('sales_items')
        .select('product_id, quantity')
        .eq('sale_id', saleId);
      if (saleItemsError) throw saleItemsError;
      for (const item of saleItems || []) {
        if (!item.product_id) continue;
        // Update inventory quantity for the product at the sale's location (handle duplicates)
        const { data: invRows, error: invError } = await fromPublic('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('location', restoreLocation);
        if (invError) throw invError;
        const rows = invRows || [];
        const nowIso = new Date().toISOString();
        if (rows.length === 0) {
          // Create new row at restoreLocation
          const { error: invInsErr } = await fromPublic('inventory')
            .insert([{ product_id: item.product_id, location: restoreLocation, quantity: Number(item.quantity || 0), updated_at: nowIso }]);
          if (invInsErr) throw invInsErr;
        } else if (rows.length === 1) {
          const invId = rows[0].id;
          const newQty = (Number(rows[0].quantity) || 0) + Number(item.quantity || 0);
          const { error: updateError } = await fromPublic('inventory')
            .update({ quantity: newQty, updated_at: nowIso })
            .eq('id', invId);
          if (updateError) throw updateError;
        } else {
          // Consolidate duplicates: add to first row, leave others unchanged for now (or could zero them as a cleanup step)
          const [first, ...rest] = rows.sort((a, b) => Number(a.id) - Number(b.id));
          const newQty = (Number(first.quantity) || 0) + Number(item.quantity || 0);
          const { error: updateError } = await fromPublic('inventory')
            .update({ quantity: newQty, updated_at: nowIso })
            .eq('id', first.id);
          if (updateError) throw updateError;
        }
      }
      // 2. Delete layby if exists
  await fromPublic('laybys').delete().eq('sale_id', saleId);
      // 3. Delete sale
  await fromPublic('sales').delete().eq('id', saleId);
      // 4. Delete sales_items and sales_payments for cleanup
  await fromPublic('sales_items').delete().eq('sale_id', saleId);
  await fromPublic('sales_payments').delete().eq('sale_id', saleId);
      // 5. Refresh laybys and products for UI
      await fetchCustomerLaybys(selectedCustomer);
      if (selectedLocation) {
        // Re-run fetchProductsAndSets logic
        async function refreshProductsAndSets() {
          const { data: invRows2 } = await fromPublic('inventory')
            .select('product_id, quantity')
            .eq('location', selectedLocation);
          const invData = invRows2 || [];
          const prodIds2 = Array.from(new Set((invData || []).map(r => r.product_id).filter(Boolean)));
          let prodRows2 = [];
          let prodLocRows2 = [];
          if (prodIds2.length) {
            const chunks = chunkArray(prodIds2, 200);
            for (const chunk of chunks) {
              const [{ data: pRows2 }, { data: plRows2 }] = await Promise.all([
                fromPublic('products').select('id, name, sku, price, promotional_price, currency').in('id', chunk),
                fromPublic('product_locations').select('product_id, location_id').in('product_id', chunk),
              ]);
              prodRows2 = prodRows2.concat(pRows2 || []);
              prodLocRows2 = prodLocRows2.concat(plRows2 || []);
            }
          }
          const locSet2 = new Set([String(selectedLocation)]);
          const productMap = {};
          const allowedProductIds2 = new Set(
            (prodLocRows2 || [])
              .filter(pl => locSet2.has(String(pl.location_id)))
              .map(pl => pl.product_id)
          );
          const qtyByProduct2 = {};
          (invData || []).forEach(r => {
            if (!r.product_id) return;
            qtyByProduct2[r.product_id] = (qtyByProduct2[r.product_id] || 0) + Number(r.quantity || 0);
          });
          (prodRows2 || []).forEach(p => {
            if (!allowedProductIds2.has(p.id)) return;
            productMap[p.id] = {
              ...p,
              stock: Number(qtyByProduct2[p.id] || 0),
            };
          });
          const { data: combosData } = await fromPublic("combos")
            .select("id, combo_name, sku, standard_price, promotional_price, combo_price, currency");
          const { data: comboLocationsData } = await fromPublic("combo_locations")
            .select("combo_id, location_id");
          const { data: comboItemsData } = await fromPublic("combo_items")
            .select("combo_id, product_id, quantity");
          const comboLocationsByCombo = buildComboLocationsByCombo(comboLocationsData || []);
          const combosForLocation = (combosData || []).filter(combo => {
            return comboIsAvailableAtLocation(combo, selectedLocation, comboLocationsByCombo);
          });
          function getMaxSetQtyForCombo(comboId) {
            const comboIdInt = typeof comboId === 'string' ? parseInt(comboId, 10) : comboId;
            const items = comboItemsData.filter(ci => {
              const ciComboIdInt = typeof ci.combo_id === 'string' ? parseInt(ci.combo_id, 10) : ci.combo_id;
              return ciComboIdInt === comboIdInt;
            });
            if (!items.length) return 0;
            let minQty = Infinity;
            for (const item of items) {
              const prod = productMap[item.product_id];
              const stock = prod ? prod.stock : 0;
              if (stock < item.quantity) {
                minQty = 0;
                break;
              }
              minQty = Math.min(minQty, Math.floor(stock / item.quantity));
            }
            return minQty === Infinity ? 0 : minQty;
          }
          const filteredSets = combosForLocation
            .map(combo => {
              const setQty = getMaxSetQtyForCombo(combo.id);
              return {
                ...combo,
                name: combo.combo_name, // ensure set name appears in cart table
                price: combo.combo_price ?? combo.standard_price ?? 0,
                promotional_price: combo.promotional_price ?? 0,
                currency: combo.currency ?? '',
                stock: setQty,
                isSet: true,
              };
            })
            .filter(set => set.stock > 0);
          setSets(filteredSets);
          // Calculate used stock per product for sets
          const usedStock = {};
          filteredSets.forEach(set => {
            const setQty = set.stock;
            comboItemsData
              .filter(ci => ci.combo_id === set.id)
              .forEach(item => {
                usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
              });
          });
          const filteredProducts = Object.values(productMap)
            .map(p => {
              const remainingStock = p.stock - (usedStock[p.id] || 0);
              return {
                ...p,
                stock: remainingStock,
                stockState: remainingStock > 0 ? 'in-stock' : (p.stock > 0 ? 'reserved' : 'out'),
              };
            });
          setProducts(filteredProducts);
        }
        await refreshProductsAndSets();
      }
      setCheckoutSuccess("Sale deleted and inventory restored.");
    } catch (err) {
      setCheckoutError(err.message || "Failed to delete sale.");
    }
    setDeleteLoading(false);
  };

  // Delete layby and restore inventory
  // Robust layby deletion: restore inventory, delete sales, delete layby
  const deleteLayby = async (laybyId) => {
    setCheckoutError("");
    setCheckoutSuccess("");
    setDeleteLoading(true);
    try {
      // 1. Restore inventory for this layby
      await restoreInventoryForLayby(laybyId);
      // 2. Find all sales referencing this layby
      let allSaleIds = [];
      // Only query by layby_id if it's numeric to match bigint column type
      const laybyIdNum = typeof laybyId === 'string' ? parseInt(laybyId, 10) : laybyId;
      if (Number.isFinite(laybyIdNum)) {
        const { data: salesData, error: salesError } = await fromPublic('sales')
          .select('id')
          .eq('layby_id', laybyIdNum);
        if (salesError) throw salesError;
        allSaleIds = salesData ? salesData.map(s => s.id) : [];
      }
      // 3. Delete sales_items, sales_payments, then sales
      if (allSaleIds.length > 0) {
        // Delete sales_items
  // Ensure sale_id list is numeric for bigint columns
  const allSaleIdsNumeric = allSaleIds.map(v => typeof v === 'string' ? parseInt(v, 10) : v).filter(v => Number.isFinite(v));
  const { error: itemsDeleteError } = await fromPublic('sales_items').delete().in('sale_id', allSaleIdsNumeric);
        if (itemsDeleteError) throw itemsDeleteError;
        // Delete sales_payments
  const { error: paymentsDeleteError } = await fromPublic('sales_payments').delete().in('sale_id', allSaleIdsNumeric);
        if (paymentsDeleteError) throw paymentsDeleteError;
        // Delete sales
  const { error: salesDeleteError } = await fromPublic('sales').delete().in('id', allSaleIds);
        if (salesDeleteError) throw salesDeleteError;
      }
      // 4. Delete layby record
  const { error: laybyDeleteError } = await fromPublic('laybys').delete().eq('id', laybyId);
      if (laybyDeleteError) throw laybyDeleteError;
      await fetchCustomerLaybys(selectedCustomer);
      setCheckoutSuccess("Layby and related sales deleted, inventory restored.");
    } catch (err) {
      setCheckoutError(err.message || "Failed to delete layby.");
    }
    setDeleteLoading(false);
  };

  // Delete customer and restore inventory for all their laybys
  // Robust customer deletion: restore inventory, delete laybys, delete sales, then customer
  const deleteCustomer = async (customerId) => {
    setCheckoutError("");
    try {
      // 1. Restore inventory for all laybys
      await restoreInventoryForCustomer(customerId);
      // 2. Find all laybys for customer
  const { data: laybys } = await fromPublic('laybys').select('id').eq('customer_id', customerId);
      for (const layby of laybys || []) {
        await deleteLayby(layby.id);
      }
      // 3. Find all sales for customer (not layby)
      const { data: salesData, error: salesError } = await fromPublic('sales')
        .select('id')
        .eq('customer_id', customerId);
      if (salesError) throw salesError;
      let allSaleIds = salesData ? salesData.map(s => s.id) : [];
      if (allSaleIds.length > 0) {
        // Delete sales_items
  const allSaleIdsNumeric2 = allSaleIds.map(v => typeof v === 'string' ? parseInt(v, 10) : v).filter(v => Number.isFinite(v));
  const { error: itemsDeleteError } = await fromPublic('sales_items').delete().in('sale_id', allSaleIdsNumeric2);
        if (itemsDeleteError) throw itemsDeleteError;
        // Delete sales_payments
  const { error: paymentsDeleteError } = await fromPublic('sales_payments').delete().in('sale_id', allSaleIdsNumeric2);
        if (paymentsDeleteError) throw paymentsDeleteError;
        // Delete sales
  const { error: salesDeleteError } = await fromPublic('sales').delete().in('id', allSaleIds);
        if (salesDeleteError) throw salesDeleteError;
      }
      // 4. Delete customer
  await fromPublic('customers').delete().eq('id', customerId);
      setCustomers(customers.filter(c => c.id !== customerId));
      setSelectedCustomer("");
      setCheckoutSuccess("Customer, laybys, and sales deleted, inventory restored.");
    } catch (err) {
      setCheckoutError(err.message || "Failed to delete customer.");
    }
  };



  // All actions always accessible
  const canAdd = canAddCustomProduct;
  const canEdit = true;
  const canDelete = true;

  // Filter products and sets by search
  const searchValue = search.trim().toLowerCase();
  const customerSearchValue = customerSearch.trim().toLowerCase();
  const uuidCustomers = filterUuidCustomers(customers);
  const filteredCustomersForSelect = customerSearchValue
    ? uuidCustomers.filter(c => (
        (c.name && c.name.toLowerCase().includes(customerSearchValue)) ||
        (c.phone && String(c.phone).toLowerCase().includes(customerSearchValue))
      ))
    : uuidCustomers;
  const MAX_SEARCH_RESULTS = 8;
  const searchTokens = searchValue
    ? searchValue.split(/\s+/).map(token => token.trim()).filter(Boolean)
    : [];

  const matchAndRank = (items, fieldSelector) => {
    if (searchTokens.length === 0) return [];
    const results = [];
    items.forEach(item => {
      const fields = fieldSelector(item)
        .filter(Boolean)
        .map(text => String(text).toLowerCase());
      if (!fields.length) return;
      const matchesAllTokens = searchTokens.every(token =>
        fields.some(field => field.includes(token))
      );
      if (!matchesAllTokens) return;
      const bestScore = fields.reduce((score, field) => {
        const idx = field.indexOf(searchTokens[0]);
        if (idx === -1) return score;
        return Math.min(score, idx);
      }, Number.POSITIVE_INFINITY);
      results.push({ item, score: Number.isFinite(bestScore) ? bestScore : Number.MAX_SAFE_INTEGER });
    });
    return results
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        const aLabel = String(fieldSelector(a.item)[0] || '').toLowerCase();
        const bLabel = String(fieldSelector(b.item)[0] || '').toLowerCase();
        return aLabel.localeCompare(bLabel);
      })
      .slice(0, MAX_SEARCH_RESULTS)
      .map(entry => entry.item);
  };

  const filteredProducts = matchAndRank(products, (product) => [product.name, product.sku]);
  const filteredSets = matchAndRank(sets, (set) => [set.combo_name || set.name, set.sku]);
  const customerSelectPlaceholder = 'Select customer';

  const handlePreviewPdf = async () => {
    if (pdfPreviewBusy) return;
    setPdfPreviewBusy(true);
    try {
      const opened = await previewPosSalePdfSample();
      if (!opened) {
        setCheckoutError('Could not open PDF preview. Allow pop-ups for this site and try again.');
      }
    } catch (e) {
      console.warn('PDF preview failed:', e?.message || e);
      setCheckoutError('PDF preview failed. Please try again.');
    } finally {
      setPdfPreviewBusy(false);
    }
  };

  return (
    <div className="pos-container" ref={posContainerRef}>
      <div className="page-header-row" style={{ marginBottom: 10 }}>
        <BackToDashboard />
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}><FaCashRegister style={{ marginRight: 6, fontSize: '1.1rem' }} /> Point of Sale</h2>
        <div className="layby-mgmt-header-actions">
          <button
            type="button"
            className="layby-mgmt-download-btn"
            title={pdfPreviewBusy ? 'Opening preview...' : 'Preview sales receipt PDF (sample data)'}
            aria-label="Preview sales receipt PDF sample"
            onClick={handlePreviewPdf}
            disabled={pdfPreviewBusy}
          >
            <FaFilePdf aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="pos-control-panel">
        <div className="pos-control-row pos-control-row-top">
          <select
            className="pos-control pos-select pos-compact pos-tight pos-loc"
            value={selectedLocation}
            onChange={e => {
              const next = e.target.value;
              setSelectedLocation(isUuid(next) ? next : '');
            }}
            required
          >
            <option value="">Select Location</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <div className="pos-receipt-field">
            <div className={`pos-control-icon pos-receipt${receiptDuplicateError ? ' is-error' : ''}`}>
              <span>#</span>
              <input
                type="text"
                placeholder="Receipt Number"
                value={receiptNumber}
                onChange={e => {
                  setReceiptNumber(e.target.value);
                  if (checkoutError === RECEIPT_DUPLICATE_ERROR) setCheckoutError("");
                }}
                className="pos-control pos-medium pos-full"
                aria-invalid={receiptDuplicateError ? 'true' : 'false'}
                aria-describedby={receiptDuplicateError ? 'pos-receipt-error' : undefined}
              />
            </div>
            {receiptDuplicateError && (
              <div id="pos-receipt-error" className="pos-receipt-error" role="alert">
                {receiptDuplicateError}
              </div>
            )}
          </div>
          <div className="pos-date-field">
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/m/yyyy"
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              onBlur={() => setDateInput(formatDateDisplay(parseDateDisplay(dateInput) || date))}
              className="pos-control pos-date pos-compact"
            />
            <button
              type="button"
              className="pos-date-picker-btn"
              aria-label="Select date"
              onClick={() => {
                const picker = datePickerRef.current;
                if (!picker) return;
                if (typeof picker.showPicker === 'function') picker.showPicker();
                else picker.click();
              }}
            >
              <FaCalendarAlt />
            </button>
            <input
              ref={datePickerRef}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDateInput(formatDateDisplay(e.target.value));
              }}
              className="pos-native-date-picker"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
          <div className="pos-currency-switch quotes-currency-switch" role="group" aria-label="Currency">
            <button
              type="button"
              className={normalizeCurrencyCode(currency) === 'K' ? 'is-on' : ''}
              onClick={() => setCurrency('K')}
              aria-pressed={normalizeCurrencyCode(currency) === 'K'}
            >
              <span className="pos-currency-symbol">K</span>
            </button>
            <button
              type="button"
              className={normalizeCurrencyCode(currency) === 'USD' ? 'is-on' : ''}
              onClick={() => setCurrency('USD')}
              aria-pressed={normalizeCurrencyCode(currency) === 'USD'}
            >
              <span className="pos-currency-symbol">$</span>
            </button>
          </div>
          <div className="pos-field-group pos-field-group-customer">
            <button
              type="button"
              onClick={() => setShowCustomerModal(true)}
              className="pos-toolbar-btn pos-add-customer"
            >
              + Customer
            </button>
            <input
              type="text"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Search customer"
              className="pos-control pos-search-customer"
            />
            <select
              className="pos-control pos-select pos-select-customer"
              value={selectedCustomer}
              onChange={e => setSelectedCustomer(e.target.value)}
            >
              <option value="">{customerSelectPlaceholder}</option>
              {filteredCustomersForSelect.map(c => (
                <option key={c.id} value={c.id} title={`${c.name || ''}${c.phone ? ` (${c.phone})` : ''}`} style={{ whiteSpace: 'normal' }}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pos-control-row pos-control-row-product">
          <div className="pos-field-group pos-field-group-product">
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowCustomProductModal(true)}
                className="pos-toolbar-btn pos-add-custom"
              >
                + Product
              </button>
            )}
            <input
              type="text"
              placeholder="Search product"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pos-control pos-search-product"
            />
          </div>
        </div>
      </div>

      {selectedCustomer && remainingDue > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0 0' }}>
          <span style={{
            background: '#2e7d32',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 8,
            fontSize: '0.92rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset'
          }}>
            Due balance: {Number(remainingDue).toLocaleString()}
          </span>
          <button
            type="button"
            style={{ width: 90, minWidth: 90, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => {
              const cust = customers.find(c => String(c.id) === String(selectedCustomer));
              if (cust) openEditCustomerModal(cust);
            }}
          >
            Edit
          </button>
        </div>
      )}
      {/* Product/set cards above the table */}
      <div className="pos-products" style={{ gap: 0 }}>
        {/* Always show all matching products/sets, no limit applied */}
        {[
          ...filteredProducts.map(product => {
            const displayStock = product.stock ?? 0;
            const isUnavailable = Number(displayStock || 0) <= 0;
            const badgeLabel = product.stockState === 'reserved' ? 'Reserved by sets' : 'Out of stock';
            const badgeColor = product.stockState === 'reserved' ? '#ffa726' : '#ff6b6b';
            return (
            <button
              key={product.id}
              className={`pos-product-btn${needsCatalogPrice(product) ? ' pos-product-btn--needs-price' : ''}`}
              onClick={() => handleProductClick(product)}
              disabled={isUnavailable}
              style={isUnavailable ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
            >
              {product.name} ({product.sku})<br />Stock: {Math.max(0, displayStock)} {product.stockState === 'reserved' && '(reserved)'}<br />
              {needsCatalogPrice(product) ? (
                renderCatalogPriceEditor(product, false)
              ) : (
                <>
                  <b>Price: {getBestPrice(product).toFixed(2)} {getCurrencyLabel(product.currency || currency)}</b>
                  <div className="pos-product-meta">std: {String(product.price)} | promo: {String(product.promotional_price)}</div>
                </>
              )}
              {isUnavailable && (
                <div style={{ marginTop: 6, fontSize: '0.8em', color: '#fff', background: badgeColor, display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                  {badgeLabel}
                </div>
              )}
            </button>
            );
          }),
          ...filteredSets.map(set => (
            <button
              key={"set-" + set.id}
              className={`pos-product-btn${needsCatalogPrice(set) ? ' pos-product-btn--needs-price' : ''}`}
              onClick={() => handleSetClick(set)}
            >
              {set.combo_name} (Set) ({set.sku})<br />
              <span className="pos-product-stock">Stock: {set.stock}</span><br />
              {needsCatalogPrice(set) ? (
                renderCatalogPriceEditor(set, true)
              ) : (
                <b>Price: {getBestPrice(set).toFixed(2)} {getCurrencyLabel(set.currency || currency)}</b>
              )}
            </button>
          ))
        ]}
      </div>
      <table className="pos-table" style={{ fontSize: '0.95rem', marginTop: 0, borderCollapse: 'collapse', tableLayout: 'auto', minWidth: '100%', width: '100%' }}>
        <thead>
          <tr>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>SKU</th>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>Name</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Qty</th>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>Color</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Amount</th>
            <th className="action-col" style={{ fontSize: '0.95rem', padding: 4 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
          <React.Fragment key={idx}>
            <tr>
              <td className="text-col" style={{ padding: 4 }}>{item.sku || (item.isCustom ? '-' : '')}</td>
              <td className="text-col" style={{ padding: 4 }}>
                {item.name}{item.isCustom && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 4 }}>(Custom)</span>}
                {item.isSet && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 8 }}>(Stock: {item.stock})</span>}
              </td>
              <td className="num-col" style={{ padding: 4 }}><input type="number" min="1" max={item.stock || 9999} value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} style={{ width: 48, fontSize: '0.95rem', height: 24, textAlign: 'center' }} /></td>
              <td className="text-col" style={{ padding: 4 }}>
                <input
                  type="text"
                  placeholder="e.g. Red"
                  value={item.color || ''}
                  onChange={e => updateCartItem(idx, { color: e.target.value })}
                  style={{ width: 100, fontSize: '0.95rem', height: 24 }}
                />
              </td>
              <td className="num-col" style={{ padding: 4 }}>{Number(item.price).toFixed(2)}</td>
              <td className="action-col" style={{ padding: 4, minWidth: '220px', width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(50mm, 1fr))', gap: 8, alignItems: 'center', width: '100%' }}>
                  <button
                    onClick={() => removeCartItem(idx)}
                    style={{ fontSize: '0.95rem', padding: '6px 10px', height: 32, borderRadius: 6, fontWeight: 600, width: '50mm', maxWidth: '100%' }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => openCustomPriceModal(idx, item.price)}
                    style={{ fontSize: '0.95rem', padding: '6px 10px', height: 32, borderRadius: 6, fontWeight: 600, background: '#00b4d8', color: '#fff', border: 'none', width: '50mm', maxWidth: '100%' }}
                  >
                    Set Custom Price
                  </button>
                  {item.isSet && (
                    <button
                      onClick={() => updateCartItem(idx, { showComponents: !item.showComponents })}
                      style={{ fontSize: '0.95rem', padding: '6px 10px', height: 32, borderRadius: 6, fontWeight: 600 }}
                    >
                      {item.showComponents ? 'Hide' : 'Components'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {item.isSet && item.showComponents && (
              <tr>
                <td colSpan={6} style={{ background: '#0a0a0a', color: '#cfe8ff', padding: '6px 8px', borderTop: '1px solid #0d2230' }}>
                  <div style={{ fontSize: '0.9em', marginBottom: 4 }}>Component breakdown (deducted from inventory):</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(comboItemsByCombo?.[item.id] || []).map((ci, i) => {
                      const perSet = Number(ci.quantity || 0);
                      const total = perSet * Number(item.qty || 0);
                      const label = ci.name ? `${ci.name}${ci.sku ? ` (${ci.sku})` : ''}` : `Product ${ci.product_id}`;
                      return (
                        <li key={i} style={{ lineHeight: 1.4 }}>
                          {label}: {perSet} per set × {Number(item.qty)} = <b>{total}</b>
                        </li>
                      );
                    })}
                    {(!comboItemsByCombo?.[item.id] || comboItemsByCombo[item.id].length === 0) && (
                      <li style={{ color: '#aaa' }}>No component items found for this set.</li>
                    )}
                  </ul>
                </td>
              </tr>
            )}
          </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* Removed: Add Credit modal */}
      {/* Custom Price Modal */}
      {showCustomPriceModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Set Custom Price</h3>
            <input
              type="number"
              min="0"
              step="any"
              value={customPriceValue}
              onChange={e => { setCustomPriceValue(e.target.value); setCustomPriceError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveCustomPrice(); } }}
              autoFocus
              className="pos-modal-input-narrow"
            />
            {customPriceError && <div className="pos-modal-error">{customPriceError}</div>}
            <div className="pos-modal-actions">
              <button type="button" className="pos-modal-btn-primary" onClick={handleSaveCustomPrice}>Save</button>
              <button type="button" className="pos-modal-btn-secondary" onClick={closeCustomPriceModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

  {/* Custom Product/Service Modal */}
      {showCustomProductModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Add Custom Product/Service</h3>
            <input
              type="text"
              placeholder="Name (e.g. Handmade Service)"
              value={customProductForm.name}
              onChange={e => setCustomProductForm(f => ({ ...f, name: e.target.value }))}
              style={{ width: 220, marginBottom: 8 }}
              required
            />
            <input
              type="number"
              placeholder="Price"
              value={customProductForm.price}
              onChange={e => setCustomProductForm(f => ({ ...f, price: e.target.value }))}
              style={{ width: 120, marginBottom: 8 }}
              required
            />
            <input
              type="number"
              placeholder="Quantity"
              value={customProductForm.qty}
              min={1}
              onChange={e => setCustomProductForm(f => ({ ...f, qty: e.target.value }))}
              style={{ width: 80, marginBottom: 8 }}
              required
            />
            {customProductError && <div style={{ color: '#ff5252', marginBottom: 8 }}>{customProductError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addCustomProductToCart} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>Add</button>
              <button onClick={() => { setShowCustomProductModal(false); setCustomProductError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
  {/* Decision Modal: Outstanding after downpayment */}
      {showDecisionModal && pendingCheckout && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3 style={{ marginTop: 0 }}>Outstanding</h3>
            <div style={{ marginBottom: 10, lineHeight: 1.6 }}>
              <div>Total: <b>{Number(pendingCheckout.snapshot.total).toFixed(2)} {getCurrencyLabel(pendingCheckout.snapshot.currency)}</b></div>
              <div>Payment now (downpayment): <b>{Number(pendingCheckout.remainingPay).toFixed(2)} {getCurrencyLabel(pendingCheckout.snapshot.currency)}</b></div>
              <div>Outstanding after downpayment: <b style={{ color: '#ffcc00' }}>{Number(pendingCheckout.outstandingNow).toFixed(2)} {getCurrencyLabel(pendingCheckout.snapshot.currency)}</b></div>
            </div>
            <p style={{ marginTop: 0 }}>Choose how to handle the outstanding amount:</p>
            <ul style={{ marginTop: 4 }}>
              <li><b>Create Layby</b> — Convert this sale to a layby for the outstanding. It will appear on the layby pages.</li>
            </ul>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={confirmCreateLayby} style={{ background: '#2e7d32', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>Create Layby</button>
              <button onClick={() => { setShowDecisionModal(false); setPendingCheckout(null); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="pos-summary" style={{ fontSize: '1rem', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
        <div>Subtotal: {subtotal.toFixed(2)}</div>
        <div>VAT @16%: Inclusive</div>
        <div>
          Discount: <input
            type="number"
            min="0"
            max={subtotal}
            value={discountAll}
            onChange={e => setDiscountAll(e.target.value)}
            style={{ width: 60, marginLeft: 4, marginRight: 4, fontSize: '0.95rem', height: 24 }}
          />
        </div>
        <div><b>Total: {total.toFixed(2)} {currencyLabel}</b></div>
        {selectedCustomer && (
          <div><b>Amount Due Now: {Math.max(0, total - (paymentLines || []).reduce((s, p) => s + parseAmountInput(p.amount), 0)).toFixed(2)} {currencyLabel}</b></div>
        )}
      </div>
      <div className="pos-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        <div className="payments-section">
          {(paymentLines || []).map((p, idx) => (
            <div key={idx} className="payment-row">
              <input
                type="text"
                inputMode="decimal"
                value={p.amount}
                onChange={e => {
                  const v = e.target.value; // keep as string so empty stays empty
                  setPaymentLines(lines => lines.map((L, i) => i === idx ? { ...L, amount: v, manual: v.trim() !== '' } : L));
                }}
                placeholder=""
                className="pos-control pos-compact"
              />
              <select
                value={p.method}
                onChange={e => setPaymentLines(lines => lines.map((L, i) => i === idx ? { ...L, method: e.target.value } : L))}
                className="pos-control pos-select pos-compact"
              >
                <option value="Cash">Cash</option>
                <option value="Visa Card">Visa Card</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Goods">Goods</option>
              </select>
              <input
                type="text"
                placeholder="Reference (optional)"
                value={p.ref}
                onChange={e => setPaymentLines(lines => lines.map((L, i) => i === idx ? { ...L, ref: e.target.value } : L))}
                className="pos-control pos-long"
              />
              <button
                type="button"
                className="remove-btn"
                onClick={() => setPaymentLines(lines => lines.filter((_, i) => i !== idx))}
                disabled={(paymentLines || []).length <= 1}
              >Remove</button>
            </div>
          ))}
          <div className="payments-actions-row">
            <button
              type="button"
              className="add-payment-btn"
              onClick={() => setPaymentLines(lines => [...(lines || []), { method: 'Cash', amount: '', ref: '' }])}
              >{isMobile ? 'Add Payment' : 'Add Another Payment'}</button>
            <div className="paid-summary">
              Total Paid: <b>{((paymentLines || []).reduce((s, p) => s + parseAmountInput(p.amount), 0)).toFixed(2)} {currencyLabel}</b>
            </div>
            <button
              className="checkout-btn"
              onClick={handleCheckout}
              disabled={checkoutLoading || total <= 0 || Boolean(receiptDuplicateError)}
            >
              {checkoutLoading
                ? "Processing..."
                : (((paymentLines || []).reduce((s, p) => s + parseAmountInput(p.amount), 0) < total)
                    ? "Partial/Layby"
                    : "Checkout")}
            </button>
          </div>
        </div>
        {/** Moved 'Manage All Sales' button next to receipt field; removed duplicate here */}
      </div>
      {/* Layby / Partial Payment History section removed per request */}
  {/* Credit Ledger removed */}
      {checkoutError && <div style={{ color: "#ff5252", marginBottom: 10 }}>{checkoutError}</div>}
      {checkoutSuccess && <div style={{ color: "#4caf50", marginBottom: 10 }}>{checkoutSuccess}</div>}
      {inventoryDeductedMsg && <div style={{ color: "#2196f3", marginBottom: 10 }}>{inventoryDeductedMsg}</div>}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3 style={{ marginTop: 0 }}>New Customer</h3>
            {customerError && (
              <div style={{ color: '#ff5252', marginBottom: 8 }}>{customerError}</div>
            )}
            <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                placeholder="Name or Business Name"
                value={customerForm.name}
                onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={customerForm.phonePrefix}
                  onChange={(e) => {
                    const prefix = e.target.value;
                    setCustomerForm((f) => ({ ...f, phonePrefix: prefix }));
                  }}
                  title="Phone country code"
                  style={{ width: 80, minWidth: 80, textAlign: 'center' }}
                >
                  <option value="+260">+260</option>
                  <option value="+243">+243</option>
                  <option value="+44">+44</option>
                </select>
                <input
                  type="text"
                  placeholder="Phone (optional)"
                  value={customerForm.phone}
                  onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </div>
              <input
                type="text"
                placeholder="TPIN (optional)"
                value={customerForm.tpin}
                onChange={e => setCustomerForm(f => ({ ...f, tpin: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Address (optional)"
                value={customerForm.address}
                onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))}
              />
              <input
                type="text"
                placeholder="City (optional)"
                value={customerForm.city}
                onChange={e => setCustomerForm(f => ({ ...f, city: e.target.value }))}
              />
              {/* Currency selection removed – POS currency will be used for new customers */}
              {/* Opening Balance field removed (handled on dedicated page) */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="submit" disabled={customerLoading} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>
                  {customerLoading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => { setShowCustomerModal(false); setCustomerError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditCustomerModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3 style={{ marginTop: 0 }}>Edit Customer</h3>
            {editCustomerError && (
              <div style={{ color: '#ff5252', marginBottom: 8 }}>{editCustomerError}</div>
            )}
            <form onSubmit={handleEditCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                placeholder="Name or Business Name"
                value={editCustomerForm.name}
                onChange={e => setEditCustomerForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <input
                type="text"
                placeholder="Phone (optional)"
                value={editCustomerForm.phone}
                onChange={e => setEditCustomerForm(f => ({ ...f, phone: e.target.value }))}
              />
              <input
                type="text"
                placeholder="TPIN (optional)"
                value={editCustomerForm.tpin}
                onChange={e => setEditCustomerForm(f => ({ ...f, tpin: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Address (optional)"
                value={editCustomerForm.address}
                onChange={e => setEditCustomerForm(f => ({ ...f, address: e.target.value }))}
              />
              <input
                type="text"
                placeholder="City (optional)"
                value={editCustomerForm.city}
                onChange={e => setEditCustomerForm(f => ({ ...f, city: e.target.value }))}
              />
              {/* Currency selection removed from Edit Customer for consistency */}
              {/* Opening Balance field removed (handled on dedicated page) */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="submit" disabled={editCustomerLoading} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>
                  {editCustomerLoading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => { setShowEditCustomerModal(false); setEditCustomerError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}
