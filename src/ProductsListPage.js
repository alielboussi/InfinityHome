/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { FaFileExcel } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { deleteComboLocations, removeComboLocations, replaceComboLocations, upsertComboLocations } from './services/comboLocations';
import { getFactoryStorageSummary, getFactoryStorageItems, createFactoryStorageItem, releaseFactoryStorageItem, updateFactoryStorageItem } from './services/factoryStorage';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import { removeProductLocations, syncProductLocations } from './services/productLocations';
import { applyInventoryBulk } from './utils/inventoryApi';
import { canDeleteProducts, canManageProductInventory, getCurrentUser } from './accessControl';
import { cacheClear, cacheGet, cacheSet } from './utils/staleCache';
import { exportProductsListExcel } from './utils/productsListExport';
import { getDuplicateProductNameInfo, normalizeProductNameKey } from './utils/productDuplicateNames';
import { resolveProductImageUrl } from './utils/productImageUrl';
import { logUserActivity } from './utils/userActivityLog';
import {
  applyComboLocationPricing,
  applyProductLocationPricing,
  buildComboLocationPriceMap,
  buildComboLocationPriceUpsert,
  buildProductLocationPriceMap,
  buildProductLocationPriceUpsert,
} from './utils/locationPricing';
import {
  fetchComboLocationPrices,
  fetchProductLocationPrices,
  saveComboLocationPrice,
  saveProductLocationPrice,
  upsertComboLocationPrices,
  upsertProductLocationPrices,
} from './services/locationPricing';

const toolbarWrapperStyle = Object.freeze({
  width: '100%',
  height: '34px',
  border: '1.5px solid #00b4d8',
  borderRadius: '8px',
  background: '#23272f',
  display: 'flex',
  alignItems: 'center',
  padding: '0 10px',
  boxSizing: 'border-box',
  color: '#e0e6ed',
  flex: '0 0 auto',
  minWidth: 0,
  boxShadow: 'var(--br-glow)'
});

const toolbarInputStyle = Object.freeze({
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'transparent',
  color: '#e0e6ed',
  fontSize: '0.95rem',
  lineHeight: '32px',
  outline: 'none'
});

const toolbarSelectWrapperStyle = Object.freeze({
  ...toolbarWrapperStyle,
  padding: 0,
  position: 'relative'
});

const toolbarSelectStyle = Object.freeze({
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'transparent',
  color: '#e0e6ed',
  fontSize: '0.95rem',
  lineHeight: '32px',
  outline: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  padding: '0 36px 0 12px'
});

const toolbarSelectWrapperNarrowStyle = Object.freeze({
  ...toolbarSelectWrapperStyle,
  width: '100%'
});

const toolbarSelectWrapperCompactStyle = Object.freeze({
  ...toolbarSelectWrapperStyle,
  width: '100%'
});


const factoryModalInputStyle = Object.freeze({
  width: '100%',
  background: '#0f1729',
  border: '1px solid #00b4d8',
  color: '#e0e6ed',
  borderRadius: '6px',
  padding: '6px 10px',
  minHeight: '38px'
});

const mapCatalogProducts = (products, unitsData) => {
  const unitsMap = Object.fromEntries((unitsData || []).map((unit) => [String(unit.id), unit]));
  return (products || []).map((product) => {
    const related = Array.isArray(product.product_images) && product.product_images.length > 0 ? product.product_images[0].image_url : '';
    const finalUrl = resolveProductImageUrl(
      (product.image_url && product.image_url.trim() !== '') ? product.image_url : (related || ''),
    );
    const unitFromMap = unitsMap[String(product.unit_of_measure_id)];
    const unitFromJoin = product.unit || null;
    const unitLabel = unitFromJoin
      ? (unitFromJoin.abbreviation || unitFromJoin.name)
      : (unitFromMap ? (unitFromMap.abbreviation || unitFromMap.name) : undefined);
    return { ...product, image_url: finalUrl, unitLabel };
  });
};

const getListItemImageUrl = (item) => {
  if (item?.__isCombo) {
    return resolveProductImageUrl(item.picture_url || '');
  }
  return item?.image_url || '';
};

const PRODUCT_IMAGE_BUCKET = 'productimages';
const PRODUCTS_LIST_CATALOG_CACHE_KEY = 'products:list:catalog:v4';
const PRODUCTS_LIST_INVENTORY_CACHE_KEY = 'products:list:inventory:v3';
const PRODUCTS_LIST_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const PRODUCTS_LIST_INVENTORY_CACHE_TTL_MS = 2 * 60 * 1000;

const clearProductsListCaches = () => {
  try { cacheClear(PRODUCTS_LIST_CATALOG_CACHE_KEY); } catch {}
  try { cacheClear(PRODUCTS_LIST_INVENTORY_CACHE_KEY); } catch {}
};

const deleteProductsViaApi = async (productIds) => {
  const ids = Array.from(new Set((productIds || []).map(id => String(id)).filter(Boolean)));
  if (ids.length === 0) return [];

  const { data: sessionData } = await db.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('Authentication required — please sign in again.');
  }

  const response = await fetch('/api/products-bulk-delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ productIds: ids }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Product delete failed');
  }

  clearProductsListCaches();
  return (payload.deletedIds || ids).map(id => String(id));
};

const getImageFolderPath = (itemId, isCombo) => `${isCombo ? 'sets' : 'products'}/${itemId}`;

const buildImageFilePath = (itemId, isCombo, fileName, fileNonce = Date.now()) => {
  const fallbackExt = 'jpg';
  const rawExt = (fileName || '').split('.').pop();
  const sanitizedExt = (rawExt || fallbackExt).replace(/[^0-9a-z]/gi, '').toLowerCase() || fallbackExt;
  return `${getImageFolderPath(itemId, isCombo)}/main-${fileNonce}.${sanitizedExt}`;
};

const purgeExistingStorageImages = async (itemId, isCombo) => {
  const folderPath = getImageFolderPath(itemId, isCombo);
  try {
    const bucket = db.storage.from(PRODUCT_IMAGE_BUCKET);
    const { data: entries, error } = await bucket.list(folderPath, { limit: 100 });
    if (error || !Array.isArray(entries) || entries.length === 0) return;
    const targets = entries.map(entry => `${folderPath}/${entry.name}`);
    await bucket.remove(targets);
  } catch (err) {
    console.warn('Failed to purge existing product images', err);
  }
};

async function applyImageFileToItem({ itemId, isCombo, file, fileNonce }) {
  await purgeExistingStorageImages(itemId, isCombo);
  const filePath = buildImageFilePath(itemId, isCombo, file.name, fileNonce);
  const bucket = db.storage.from(PRODUCT_IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: publicUrlData } = bucket.getPublicUrl(filePath);
  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl) throw new Error('Failed to get public URL for image.');
  if (isCombo) {
    await db.from('combos').update({ picture_url: publicUrl }).eq('id', itemId);
  } else {
    await db.from('product_images').delete().eq('product_id', itemId);
    await db.from('product_images').insert([{ product_id: itemId, image_url: publicUrl }]);
    await db.from('products').update({ image_url: publicUrl }).eq('id', itemId);
  }
  return publicUrl;
}

const FACTORY_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';
const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const PRIMARY_LOCATION_META = Object.freeze([
  { id: FACTORY_LOCATION_ID, fallback: 'Factory' },
  { id: KITWE_LOCATION_ID, fallback: 'Kitwe' },
  { id: LUSAKA_LOCATION_ID, fallback: 'Lusaka' },
]);
const PERIOD_STATUS_OPEN = 'open';
const PERIOD_STATUS_LOCKED = 'open_locked';

const FACTORY_STORAGE_FORM_TEMPLATE = Object.freeze({
  quantity: '',
  saleId: '',
  saleItemId: '',
  expectedReleaseDate: '',
  customerName: '',
  customerPhone: '',
  notes: ''
});

const FACTORY_STORAGE_RELEASE_TEMPLATE = Object.freeze({
  storageId: null,
  qty: '',
  reference: '',
  note: ''
});

const createFactoryStorageFormDefaults = () => ({ ...FACTORY_STORAGE_FORM_TEMPLATE });
const createFactoryStorageReleaseDefaults = () => ({ ...FACTORY_STORAGE_RELEASE_TEMPLATE });

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  } catch {
    return value;
  }
};

const formatDateOnly = (value) => {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  } catch {
    return value;
  }
};

const toDateInputValue = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  } catch {
    return String(value).slice(0, 10);
  }
};

function ProductsListPage() {
  const navigate = useNavigate();
  const [imageEditModalOpen, setImageEditModalOpen] = useState(false);
  const [imageEditProduct, setImageEditProduct] = useState(null);
  const [imageEditBulkProducts, setImageEditBulkProducts] = useState(null);
  const [imageEditFile, setImageEditFile] = useState(null);
  const [imageEditLoading, setImageEditLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyModalProduct, setQtyModalProduct] = useState(null);
  const [qtyModalRows, setQtyModalRows] = useState([]);
  const [qtyModalLoading, setQtyModalLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [transferMode, setTransferMode] = useState('adjust');
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [manualTransferDate, setManualTransferDate] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState([]);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [adjustSetMode, setAdjustSetMode] = useState('receive');
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [inlinePriceEdit, setInlinePriceEdit] = useState(null);
  const inlinePriceInputRef = useRef(null);
  const inlinePriceDraftRef = useRef('');
  const inlinePriceSaveLockRef = useRef(false);
  const factoryStorageActorRef = useRef(null);
  const factoryStorageLaunchRef = useRef(false);
  const catalogLoadSeqRef = useRef(0);
  const [factoryStorageSummary, setFactoryStorageSummary] = useState([]);
  const [factoryStorageModalOpen, setFactoryStorageModalOpen] = useState(false);
  const [factoryStorageModalProduct, setFactoryStorageModalProduct] = useState(null);
  const [factoryStorageModalRows, setFactoryStorageModalRows] = useState([]);
  const [factoryStorageRowsLoading, setFactoryStorageRowsLoading] = useState(false);
  const [factoryStorageModalError, setFactoryStorageModalError] = useState('');
  const [factoryStorageForm, setFactoryStorageForm] = useState(createFactoryStorageFormDefaults);
  const [factoryStorageSubmitting, setFactoryStorageSubmitting] = useState(false);
  const [factoryStorageReleaseDraft, setFactoryStorageReleaseDraft] = useState(createFactoryStorageReleaseDefaults);
  const [factoryStorageReleaseBusy, setFactoryStorageReleaseBusy] = useState(false);
  const [factoryStorageEditDraft, setFactoryStorageEditDraft] = useState(null);
  const [factoryStorageEditBusy, setFactoryStorageEditBusy] = useState(false);
  const [combos, setCombos] = useState([]);
  const [comboLocations, setComboLocations] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [productLocationPrices, setProductLocationPrices] = useState([]);
  const [comboLocationPrices, setComboLocationPrices] = useState([]);
  const [pendingFactoryStorageProductId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('factoryStorage');
    } catch {
      return null;
    }
  });
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);

  const currentUser = useMemo(() => getCurrentUser(), []);
  const currentUserName = currentUser?.full_name || currentUser?.name || currentUser?.email || null;
  const stockLockedUserId = '99a0cdc5-1e67-40ff-93d4-a961cb9cff39';
  const isStockLockedUser = String(currentUser?.id || '').toLowerCase() === stockLockedUserId;
  const canAdjustInventory = !isStockLockedUser && canManageProductInventory(currentUser);
  const canDelete = isStockLockedUser ? true : canDeleteProducts(currentUser);
  const canEditFactoryHolds = !isStockLockedUser && canManageProductInventory(currentUser);

  const isUuid = useCallback((value) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(String(value || '').trim());
  }, []);

  const resolveLocationUuid = useCallback((val) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const s = String(val || '').trim();
    if (UUID_RE.test(s)) return s;
    const loc = (locations || []).find(l => String(l.id) === s || String(l.name).toLowerCase() === s.toLowerCase());
    const name = (loc?.name || '').toLowerCase();
    const byName = new Map([
      ['factory warehouse', FACTORY_LOCATION_ID],
      ['kitwe branch', KITWE_LOCATION_ID],
      ['lusaka branch', LUSAKA_LOCATION_ID],
    ]);
    if (name && byName.has(name)) return byName.get(name);
    const locId = String(loc?.id || '');
    if (UUID_RE.test(locId)) return locId;
    return s;
  }, [locations]);

  const normalizeLocationId = useCallback((val) => {
    if (val === null || val === undefined || val === '') return '';
    const resolved = resolveLocationUuid(val);
    if (!resolved) return String(val);
    return String(resolved);
  }, [resolveLocationUuid]);

  const isSameLocation = useCallback((a, b) => normalizeLocationId(a) === normalizeLocationId(b), [normalizeLocationId]);

  const isLocationSelected = useCallback((locId) => {
    if (!Array.isArray(selectedLocationIds) || selectedLocationIds.length === 0) return false;
    return selectedLocationIds.some(sel => isSameLocation(sel, locId));
  }, [selectedLocationIds, isSameLocation]);

  useEffect(() => {
    if (selectedLocationIds.length === 1) {
      setSelectedLocation(selectedLocationIds[0]);
    } else if (selectedLocationIds.length === 0) {
      setSelectedLocation('');
    }
  }, [selectedLocationIds]);


  const getActiveStockPeriod = useCallback(async (locId) => {
    if (!locId) return null;
    // Only the current OPEN period accepts opening-stock edits.
    // Periods are created by Stocktake Flow submit — never auto-create here.
    const { data: existing, error } = await db
      .from('stock_periods')
      .select('id, status, begin_period_date, opened_at')
      .eq('location_id', locId)
      .eq('status', PERIOD_STATUS_OPEN)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return existing || null;
  }, []);

  const factoryStorageTotalsByProduct = useMemo(() => {
    const map = new Map();
    (factoryStorageSummary || []).forEach((row) => {
      const key = String(row.product_id);
      const qty = Number(row.qty_on_hold || 0);
      map.set(key, (map.get(key) || 0) + qty);
    });
    return map;
  }, [factoryStorageSummary]);

  const modalFactoryHoldQty = factoryStorageModalProduct
    ? (factoryStorageTotalsByProduct.get(String(factoryStorageModalProduct.id)) || 0)
    : 0;

  const factoryStorageModalIsCombo = Boolean(factoryStorageModalProduct?.__isCombo);

  const factoryStorageModalLabel = factoryStorageModalProduct
    ? (factoryStorageModalIsCombo ? factoryStorageModalProduct.combo_name : factoryStorageModalProduct.name)
    : '';

  const factoryStorageComboComponents = useMemo(() => {
    if (!factoryStorageModalIsCombo || !factoryStorageModalProduct) return [];
    return (comboItems || [])
      .filter((ci) => String(ci.combo_id) === String(factoryStorageModalProduct.id))
      .map((ci) => {
        const componentProduct = (products || []).find((p) => String(p.id) === String(ci.product_id));
        const perSetQty = Number(ci.quantity) || 0;
        return {
          ...ci,
          perSetQty,
          product: componentProduct || null,
          productName: componentProduct?.name || componentProduct?.sku || `Product ${ci.product_id}`,
          sku: componentProduct?.sku,
        };
      });
  }, [comboItems, factoryStorageModalIsCombo, factoryStorageModalProduct, products]);

  const factoryStorageComboComponentMap = useMemo(() => {
    const map = new Map();
    (factoryStorageComboComponents || []).forEach((component) => {
      map.set(String(component.product_id), component);
    });
    return map;
  }, [factoryStorageComboComponents]);

  const factoryStorageComboHoldSets = useMemo(() => {
    if (!factoryStorageModalIsCombo || !factoryStorageComboComponents.length) return 0;
    let minSets = Infinity;
    factoryStorageComboComponents.forEach((component) => {
      const perSet = Number(component.perSetQty) || 0;
      if (perSet <= 0) {
        minSets = 0;
        return;
      }
      const heldQty = factoryStorageTotalsByProduct.get(String(component.product_id)) || 0;
      const setsPossible = Math.floor(heldQty / perSet);
      if (setsPossible < minSets) minSets = setsPossible;
    });
    return Number.isFinite(minSets) ? minSets : 0;
  }, [factoryStorageComboComponents, factoryStorageModalIsCombo, factoryStorageTotalsByProduct]);

  const factoryStorageComboPreview = useMemo(() => {
    if (!factoryStorageModalIsCombo || !factoryStorageComboComponents.length) return [];
    const setCount = Number(factoryStorageForm.quantity) || 0;
    return factoryStorageComboComponents.map((component) => ({
      ...component,
      holdQty: (Number(component.perSetQty) || 0) * setCount,
    }));
  }, [factoryStorageComboComponents, factoryStorageForm.quantity, factoryStorageModalIsCombo]);

  const factoryStorageModalItemHeader = factoryStorageModalIsCombo ? 'Component' : 'Item';

  const toggleActionMenu = useCallback((event, id) => {
    event?.stopPropagation?.();
    setOpenActionMenuId(prev => prev === id ? null : id);
  }, []);

  useEffect(() => {
    const closeMenus = () => {
      setOpenActionMenuId(null);
    };
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  // Realtime tick for catalog and inventory-related tables
  const rtLocationFilter = selectedLocationIds.length === 1 ? selectedLocationIds[0] : '';
  const rtTickCatalog = useRealtimeRefresh(
    ['products','product_images','product_locations','product_location_prices','combo_location_prices','categories','unit_of_measure','inventory','combos','combo_items','combo_locations','locations'],
    250,
    rtLocationFilter ? {
      inventory: { column: 'location', value: rtLocationFilter },
      product_locations: { column: 'location_id', value: rtLocationFilter },
      combo_locations: { column: 'location_id', value: rtLocationFilter },
    } : undefined
  );

  const handleOpenAdjustModal = (product) => {
    if (!canAdjustInventory) {
      alert('Inventory changes are disabled for your account.');
      return;
    }
    const defaultLocationId = selectedLocationIds.length === 1
      ? normalizeLocationId(selectedLocationIds[0])
      : normalizeLocationId(locations[0]?.id || '');
    setAdjustProduct(product);
    // Default mode for sets is 'receive'; for products it's normal adjust
    if (product.__isCombo) {
      setAdjustSetMode('receive');
      setAdjustQty(1);
    } else if (defaultLocationId) {
      const inv = inventory.find(inv => inv.product_id === product.id && isSameLocation(inv.location, defaultLocationId));
      const qty = inv ? Number(inv.quantity) : 0;
      setAdjustQty(qty);
    } else {
      setAdjustQty("");
    }
    setSelectedLocation(defaultLocationId || '');
    // reset transfer state
    setTransferMode('adjust');
    setTransferFrom(defaultLocationId || '');
    setTransferTo('');
    setTransferQty('');
  // init transfer date (date only)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const dd = String(now.getDate()).padStart(2,'0');
    setManualTransferDate(`${yyyy}-${mm}-${dd}`);
    setAdjustModalOpen(true);
  };

  const openQtyModal = useCallback((product) => {
    if (!product) return;
    setQtyModalProduct(product);
    setQtyModalOpen(true);
  }, []);

  const closeQtyModal = useCallback(() => {
    setQtyModalOpen(false);
    setQtyModalProduct(null);
    setQtyModalRows([]);
    setQtyModalLoading(false);
  }, []);

  const refreshFactoryStorageSummary = useCallback(async () => {
    try {
      const rows = await getFactoryStorageSummary({ locationId: FACTORY_LOCATION_ID });
      setFactoryStorageSummary(rows);
    } catch (err) {
      console.warn('[factoryStorage] summary fetch failed', err);
    }
  }, []);

  useEffect(() => {
    refreshFactoryStorageSummary();
  }, [refreshFactoryStorageSummary, rtTickCatalog]);

  const loadFactoryStorageRows = useCallback(async (productRecord) => {
    if (!productRecord) return;
    setFactoryStorageRowsLoading(true);
    setFactoryStorageModalError('');
    const isComboItem = Boolean(productRecord.__isCombo);
    try {
      if (isComboItem) {
        const componentIds = (comboItems || [])
          .filter((ci) => String(ci.combo_id) === String(productRecord.id))
          .map((ci) => ci.product_id)
          .filter(Boolean);
        if (!componentIds.length) {
          setFactoryStorageModalRows([]);
        } else {
          const rows = await getFactoryStorageItems({ productIds: componentIds, locationId: FACTORY_LOCATION_ID });
          setFactoryStorageModalRows(rows);
        }
      } else {
        const rows = await getFactoryStorageItems({ productId: productRecord.id, locationId: FACTORY_LOCATION_ID });
        setFactoryStorageModalRows(rows);
      }
    } catch (err) {
      setFactoryStorageModalError(err.message || 'Failed to load storage rows');
    } finally {
      setFactoryStorageRowsLoading(false);
    }
  }, [comboItems]);

  useEffect(() => {
    if (!factoryStorageEditDraft) return;
    const stillExists = (factoryStorageModalRows || []).some(row => row.id === factoryStorageEditDraft.storageId);
    if (!stillExists) {
      setFactoryStorageEditDraft(null);
    }
  }, [factoryStorageModalRows, factoryStorageEditDraft]);

  const resolveFactoryStorageActor = useCallback(async () => {
    if (factoryStorageActorRef.current) return factoryStorageActorRef.current;
    let userUuid = null;
    let email = null;
    try {
      const raw = localStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : null;
      userUuid = parsed?.id || null;
      email = parsed?.email || null;
    } catch {}
    let legacyUserId = null;
    if (email) {
      try {
        const { data: legacyUser } = await db
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (legacyUser && legacyUser.id != null) legacyUserId = legacyUser.id;
      } catch (err) {
        console.warn('[factoryStorage] legacy user lookup failed', err);
      }
    }
    const actor = { userUuid, userLegacyId: legacyUserId };
    factoryStorageActorRef.current = actor;
    return actor;
  }, []);

  const openFactoryStorageModal = useCallback((product) => {
    if (!product) return;
    setFactoryStorageModalProduct(product);
    setFactoryStorageModalRows([]);
    setFactoryStorageModalError('');
    setFactoryStorageForm(createFactoryStorageFormDefaults());
    setFactoryStorageReleaseDraft(createFactoryStorageReleaseDefaults());
    setFactoryStorageModalOpen(true);
    loadFactoryStorageRows(product);
  }, [loadFactoryStorageRows]);

  useEffect(() => {
    if (!pendingFactoryStorageProductId || factoryStorageLaunchRef.current) return;
    const match = (products || []).find((p) => String(p.id) === String(pendingFactoryStorageProductId));
    if (!match) return;
    factoryStorageLaunchRef.current = true;
    openFactoryStorageModal(match);
    try {
      const current = new URL(window.location.href);
      current.searchParams.delete('factoryStorage');
      const query = current.searchParams.toString();
      const next = `${current.pathname}${query ? `?${query}` : ''}${current.hash}`;
      window.history.replaceState({}, '', next);
    } catch {}
  }, [pendingFactoryStorageProductId, products, openFactoryStorageModal]);

  const closeFactoryStorageModal = useCallback(() => {
    setFactoryStorageModalOpen(false);
    setFactoryStorageModalProduct(null);
    setFactoryStorageModalRows([]);
    setFactoryStorageReleaseDraft(createFactoryStorageReleaseDefaults());
    setFactoryStorageForm(createFactoryStorageFormDefaults());
    setFactoryStorageEditDraft(null);
    setFactoryStorageEditBusy(false);
  }, []);

  const handleFactoryStorageFormChange = useCallback((field, value) => {
    if (!canEditFactoryHolds) return;
    setFactoryStorageForm(prev => ({ ...prev, [field]: value }));
  }, [canEditFactoryHolds]);

  const handleCreateFactoryStorageEntry = useCallback(async () => {
    if (!canEditFactoryHolds) return;
    if (!factoryStorageModalProduct) return;
    const qty = Number(factoryStorageForm.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert(factoryStorageModalIsCombo ? 'Enter the number of sets to hold (must be greater than zero).' : 'Enter a quantity greater than zero.');
      return;
    }
    if (factoryStorageModalIsCombo && !factoryStorageComboComponents.length) {
      alert('This set has no components defined. Add products to the set before recording factory storage.');
      return;
    }
    setFactoryStorageSubmitting(true);
    try {
      const actor = await resolveFactoryStorageActor();
      if (factoryStorageModalIsCombo) {
        const setQty = qty;
        let createdCount = 0;
        for (const component of factoryStorageComboComponents) {
          const perSet = Number(component.perSetQty) || 0;
          if (perSet <= 0) continue;
          const componentQty = perSet * setQty;
          if (componentQty <= 0) continue;
          await createFactoryStorageItem({
            productId: component.product_id,
            locationId: FACTORY_LOCATION_ID,
            quantity: componentQty,
            expectedReleaseDate: factoryStorageForm.expectedReleaseDate || null,
            customerName: factoryStorageForm.customerName || null,
            customerPhone: factoryStorageForm.customerPhone || null,
            saleId: factoryStorageForm.saleId || null,
            saleItemId: factoryStorageForm.saleItemId || null,
            notes: factoryStorageForm.notes || null,
            metadata: {
              source: 'products-list',
              comboId: factoryStorageModalProduct.id,
              comboName: factoryStorageModalProduct.combo_name,
              comboSku: factoryStorageModalProduct.sku,
              comboSetQty: setQty,
              comboComponentQty: perSet,
            }
          }, actor);
          createdCount += 1;
        }
        if (!createdCount) {
          throw new Error('None of the set components have a positive quantity to hold.');
        }
      } else {
        await createFactoryStorageItem({
          productId: factoryStorageModalProduct.id,
          locationId: FACTORY_LOCATION_ID,
          quantity: qty,
          expectedReleaseDate: factoryStorageForm.expectedReleaseDate || null,
          customerName: factoryStorageForm.customerName || null,
          customerPhone: factoryStorageForm.customerPhone || null,
          saleId: factoryStorageForm.saleId || null,
          saleItemId: factoryStorageForm.saleItemId || null,
          notes: factoryStorageForm.notes || null,
        }, actor);
      }
      setFactoryStorageForm(createFactoryStorageFormDefaults());
      await loadFactoryStorageRows(factoryStorageModalProduct);
      await refreshFactoryStorageSummary();
    } catch (err) {
      alert('Failed to record storage entry: ' + (err.message || err));
    } finally {
      setFactoryStorageSubmitting(false);
    }
  }, [canEditFactoryHolds, factoryStorageComboComponents, factoryStorageForm, factoryStorageModalIsCombo, factoryStorageModalProduct, loadFactoryStorageRows, refreshFactoryStorageSummary, resolveFactoryStorageActor]);

  const startFactoryStorageRelease = useCallback((row) => {
    if (!canEditFactoryHolds) return;
    if (!row) return;
    const remaining = Math.max(0, Number(row.quantity || 0) - Number(row.quantity_released || 0));
    setFactoryStorageReleaseDraft({
      storageId: row.id,
      qty: remaining > 0 ? remaining : '',
      reference: row.release_reference || '',
      note: ''
    });
    setFactoryStorageEditDraft(null);
  }, [canEditFactoryHolds]);

  const cancelFactoryStorageRelease = useCallback(() => {
    setFactoryStorageReleaseDraft(createFactoryStorageReleaseDefaults());
  }, []);

  const submitFactoryStorageRelease = useCallback(async () => {
    if (!canEditFactoryHolds) return;
    if (!factoryStorageReleaseDraft.storageId || !factoryStorageModalProduct) return;
    const row = factoryStorageModalRows.find(r => r.id === factoryStorageReleaseDraft.storageId);
    if (!row) {
      alert('Storage entry not found.');
      return;
    }
    const remaining = Math.max(0, Number(row.quantity || 0) - Number(row.quantity_released || 0));
    if (remaining <= 0) {
      alert('This entry has no quantity left to release.');
      setFactoryStorageReleaseDraft(createFactoryStorageReleaseDefaults());
      return;
    }
    const requested = Number(factoryStorageReleaseDraft.qty);
    if (!Number.isFinite(requested) || requested <= 0) {
      alert('Enter a release quantity greater than zero.');
      return;
    }
    const releaseQty = Math.min(remaining, requested);
    setFactoryStorageReleaseBusy(true);
    try {
      const actor = await resolveFactoryStorageActor();
      await releaseFactoryStorageItem(row.id, releaseQty, {
        releaseReference: factoryStorageReleaseDraft.reference || null,
        notes: factoryStorageReleaseDraft.note || null,
      }, actor);
      setFactoryStorageReleaseDraft(createFactoryStorageReleaseDefaults());
      await loadFactoryStorageRows(factoryStorageModalProduct);
      await refreshFactoryStorageSummary();
    } catch (err) {
      alert('Failed to release storage: ' + (err.message || err));
    } finally {
      setFactoryStorageReleaseBusy(false);
    }
  }, [canEditFactoryHolds, factoryStorageReleaseDraft, factoryStorageModalProduct, factoryStorageModalRows, loadFactoryStorageRows, refreshFactoryStorageSummary, resolveFactoryStorageActor]);

  const startFactoryStorageEdit = useCallback((row) => {
    if (!canEditFactoryHolds) return;
    if (!row) return;
    setFactoryStorageReleaseDraft(createFactoryStorageReleaseDefaults());
    setFactoryStorageEditDraft({
      storageId: row.id,
      saleId: row.sale_id || '',
      saleItemId: row.sale_item_id || '',
      expectedReleaseDate: toDateInputValue(row.expected_release_date),
      customerName: row.customer_name || '',
      customerPhone: row.customer_phone || '',
      notes: row.notes || ''
    });
  }, [canEditFactoryHolds]);

  const handleFactoryStorageEditChange = useCallback((field, value) => {
    setFactoryStorageEditDraft(prev => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const cancelFactoryStorageEdit = useCallback(() => {
    setFactoryStorageEditDraft(null);
    setFactoryStorageEditBusy(false);
  }, []);

  const submitFactoryStorageEdit = useCallback(async () => {
    if (!canEditFactoryHolds) return;
    if (!factoryStorageEditDraft?.storageId || !factoryStorageModalProduct) return;
    setFactoryStorageEditBusy(true);
    try {
      const actor = await resolveFactoryStorageActor();
      await updateFactoryStorageItem(factoryStorageEditDraft.storageId, {
        saleId: factoryStorageEditDraft.saleId,
        saleItemId: factoryStorageEditDraft.saleItemId,
        expectedReleaseDate: factoryStorageEditDraft.expectedReleaseDate || null,
        customerName: factoryStorageEditDraft.customerName,
        customerPhone: factoryStorageEditDraft.customerPhone,
        notes: factoryStorageEditDraft.notes,
      }, actor);
      setFactoryStorageEditDraft(null);
      await loadFactoryStorageRows(factoryStorageModalProduct);
      await refreshFactoryStorageSummary();
    } catch (err) {
      alert('Failed to update hold: ' + (err?.message || err));
    } finally {
      setFactoryStorageEditBusy(false);
    }
  }, [canEditFactoryHolds, factoryStorageEditDraft, factoryStorageModalProduct, loadFactoryStorageRows, refreshFactoryStorageSummary, resolveFactoryStorageActor]);

  const handleAdjustInventory = async () => {
    if (!adjustProduct) return;
    setAdjustLoading(true);
    try {
      const rawLocationId = selectedLocation || locations[0]?.id;
      if (!rawLocationId) {
        alert("Select a location first.");
        setAdjustLoading(false);
        return;
      }
      const locationId = resolveLocationUuid(rawLocationId);
      if (!locationId || !isUuid(locationId)) {
        alert('Unable to resolve location for this adjustment.');
        setAdjustLoading(false);
        return;
      }
      let activePeriod = null;
      if (String(locationId) !== String(FACTORY_LOCATION_ID)) {
        activePeriod = await getActiveStockPeriod(locationId);
      }
      const activePeriodId = activePeriod?.id || null;
      const nowIso = new Date().toISOString();
      const localInventoryChanges = [];
      // Handle set receive/assembly: update component inventory according to combo_items
      if (adjustProduct.__isCombo) {
        const items = (comboItems || []).filter(ci => String(ci.combo_id) === String(adjustProduct.id));
        let setCount = Number(adjustQty);
        if (!Number.isFinite(setCount) || setCount <= 0) {
          alert('Enter a positive number of sets.');
          setAdjustLoading(false);
          return;
        }
        const touchedProducts = new Set();
        if (adjustSetMode === 'assemble') {
          const buildable = computeComboMaxQty(adjustProduct.id, locationId);
          if (setCount > buildable) setCount = buildable;
          if (setCount <= 0) {
            alert('Insufficient component stock to assemble sets at this location.');
            setAdjustLoading(false);
            return;
          }
          for (const it of items) {
            const need = (Number(it.quantity) || 0) * setCount;
            if (need <= 0) continue;
            const { data: invRow } = await db
              .from('inventory')
              .select('id, quantity')
              .eq('product_id', it.product_id)
              .eq('location', locationId)
              .maybeSingle();
            if (invRow) {
              const newQty = Math.max(0, Number(invRow.quantity || 0) - need);
              await applyInventoryBulk({
                updates: [{ id: invRow.id, quantity: newQty, updated_at: nowIso }],
              }, db);
              localInventoryChanges.push({ productId: it.product_id, locationId, quantity: newQty });
              if (activePeriodId) {
                try {
                  await db
                    .from('opening_stock_entries')
                    .upsert(
                      { session_id: activePeriodId, product_id: it.product_id, qty: newQty },
                      { onConflict: 'session_id,product_id' }
                    );
                } catch (e) {
                  console.warn('[inventory] opening stock update failed', e);
                }
              }
            } else {
              await applyInventoryBulk({
                inserts: [{ product_id: it.product_id, location: locationId, quantity: 0, updated_at: nowIso }],
              }, db);
              localInventoryChanges.push({ productId: it.product_id, locationId, quantity: 0 });
              if (activePeriodId) {
                try {
                  await db
                    .from('opening_stock_entries')
                    .upsert(
                      { session_id: activePeriodId, product_id: it.product_id, qty: 0 },
                      { onConflict: 'session_id,product_id' }
                    );
                } catch (e) {
                  console.warn('[inventory] opening stock update failed', e);
                }
              }
            }
            if (!touchedProducts.has(it.product_id)) {
              touchedProducts.add(it.product_id);
              try {
                await syncProductLocations({ rows: [{ product_id: it.product_id, location_id: locationId }] }, db);
              } catch (e) {
                console.warn('[inventory] product_locations sync failed', e);
              }
            }
            try {
              await db.from('inventory_adjustments').insert({
                product_id: it.product_id,
                location_id: locationId,
                quantity: -need,
                adjustment_type: activePeriodId ? 'Opening Period Set Assembly' : 'Set Assembly',
                adjusted_at: new Date().toISOString(),
                metadata: {
                  user_id: currentUser?.id || null,
                  user_name: currentUserName,
                  source: 'products-list',
                }
              });
            } catch (e) {
              console.warn('[inventory] adjustment log failed', e);
            }
          }
        } else {
          // receive mode: increase components so these sets can be built later
          for (const it of items) {
            const add = (Number(it.quantity) || 0) * setCount;
            if (add <= 0) continue;
            const { data: invRow } = await db
              .from('inventory')
              .select('id, quantity')
              .eq('product_id', it.product_id)
              .eq('location', locationId)
              .maybeSingle();
            if (invRow) {
              const newQty = Number(invRow.quantity || 0) + add;
              await applyInventoryBulk({
                updates: [{ id: invRow.id, quantity: newQty, updated_at: nowIso }],
              }, db);
              localInventoryChanges.push({ productId: it.product_id, locationId, quantity: newQty });
              if (activePeriodId) {
                try {
                  await db
                    .from('opening_stock_entries')
                    .upsert(
                      { session_id: activePeriodId, product_id: it.product_id, qty: newQty },
                      { onConflict: 'session_id,product_id' }
                    );
                } catch (e) {
                  console.warn('[inventory] opening stock update failed', e);
                }
              }
            } else {
              await applyInventoryBulk({
                inserts: [{ product_id: it.product_id, location: locationId, quantity: add, updated_at: nowIso }],
              }, db);
              localInventoryChanges.push({ productId: it.product_id, locationId, quantity: add });
              if (activePeriodId) {
                try {
                  await db
                    .from('opening_stock_entries')
                    .upsert(
                      { session_id: activePeriodId, product_id: it.product_id, qty: add },
                      { onConflict: 'session_id,product_id' }
                    );
                } catch (e) {
                  console.warn('[inventory] opening stock update failed', e);
                }
              }
            }
            if (!touchedProducts.has(it.product_id)) {
              touchedProducts.add(it.product_id);
              try {
                await syncProductLocations({ rows: [{ product_id: it.product_id, location_id: locationId }] }, db);
              } catch (e) {
                console.warn('[inventory] product_locations sync failed', e);
              }
            }
            try {
              await db.from('inventory_adjustments').insert({
                product_id: it.product_id,
                location_id: locationId,
                quantity: add,
                adjustment_type: activePeriodId ? 'Opening Period Set Receive' : 'Set Receive',
                adjusted_at: new Date().toISOString(),
                metadata: {
                  user_id: currentUser?.id || null,
                  user_name: currentUserName,
                  source: 'products-list',
                }
              });
            } catch (e) {
              console.warn('[inventory] adjustment log failed', e);
            }
          }
        }
        setAdjustModalOpen(false);
        applyLocalInventoryChanges(localInventoryChanges);
        try { cacheClear(PRODUCTS_LIST_INVENTORY_CACHE_KEY); } catch {}
        await refreshInventoryForLocations([locationId]);
        logUserActivity({
          actionType: 'inventory_adjustment',
          actionLabel: 'Set Inventory Adjusted',
          details: `${adjustProduct.combo_name || adjustProduct.name} • ${setCount} set${setCount === 1 ? '' : 's'} • ${adjustSetMode === 'assemble' ? 'Assembly' : 'Receive'}`,
          reference: String(adjustProduct.id),
          entityType: 'combo',
          entityId: String(adjustProduct.id),
          metadata: { location_id: locationId, set_count: setCount, mode: adjustSetMode },
        });
        return;
      }
      const targetQty = Number(adjustQty);
      const adjustmentType = activePeriodId
        ? (activePeriod?.status === PERIOD_STATUS_LOCKED ? 'Opening Period Stock Adjustment' : 'Opening Period Stock')
        : 'Manual Adjustment';
      let locationSyncError = null;
      try {
        await syncProductLocations({ rows: [{ product_id: adjustProduct.id, location_id: locationId }] }, db);
      } catch (e) {
        locationSyncError = e;
        console.warn('[inventory] product_locations sync failed', e);
      }
      // Upsert inventory (single call, avoids pre-select)
      try {
        await applyInventoryBulk({
          inserts: [{ product_id: adjustProduct.id, location: locationId, quantity: targetQty, updated_at: nowIso }],
        }, db);
      } catch (e) {
        if (locationSyncError) {
          const combined = new Error(`${e?.message || e}. Location link failed: ${locationSyncError?.message || locationSyncError}`);
          throw combined;
        }
        throw e;
      }
      localInventoryChanges.push({ productId: adjustProduct.id, locationId, quantity: targetQty });
      const tasks = [
        db.from('inventory_adjustments').insert({
          product_id: adjustProduct.id,
          location_id: locationId,
          quantity: targetQty,
          adjustment_type: adjustmentType,
          adjusted_at: new Date().toISOString(),
          metadata: {
            user_id: currentUser?.id || null,
            user_name: currentUserName,
            source: 'products-list',
          }
        })
      ];
      if (activePeriodId) {
        tasks.push(
          db
            .from('opening_stock_entries')
            .upsert(
              { session_id: activePeriodId, product_id: adjustProduct.id, qty: targetQty },
              { onConflict: 'session_id,product_id' }
            )
        );
      }
      const results = await Promise.allSettled(tasks);
      const rejected = results.filter(r => r.status === 'rejected');
      if (rejected.length) {
        console.warn('[inventory] auxiliary writes failed', rejected.map(r => r.reason));
      }
      setAdjustModalOpen(false);
      applyLocalInventoryChanges(localInventoryChanges);
      try { cacheClear(PRODUCTS_LIST_INVENTORY_CACHE_KEY); } catch {}
      await refreshInventoryForLocations([locationId]);
      logUserActivity({
        actionType: 'inventory_adjustment',
        actionLabel: adjustProduct.__isCombo ? 'Set Inventory Adjusted' : 'Inventory Adjusted',
        details: `${adjustProduct.__isCombo ? adjustProduct.combo_name : adjustProduct.name} • Qty ${targetQty} • ${adjustmentType}`,
        reference: String(adjustProduct.id),
        entityType: adjustProduct.__isCombo ? 'combo' : 'product',
        entityId: String(adjustProduct.id),
        metadata: { location_id: locationId, quantity: targetQty, adjustment_type: adjustmentType },
      });
    } catch (err) {
      alert('Failed to adjust inventory: ' + err.message);
    } finally {
      setAdjustLoading(false);
    }
  };
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [resettingNegatives, setResettingNegatives] = useState(false);
  const [bulkAction, setBulkAction] = useState('add_location');
  const [bulkField, setBulkField] = useState('currency');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkLocationIds, setBulkLocationIds] = useState([]);
  const [bulkLocationMenuOpen, setBulkLocationMenuOpen] = useState(false);
  const bulkLocationMenuRef = useRef(null);
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false);
  const [bulkApplyMessage, setBulkApplyMessage] = useState('');
  const [bulkSelectionMap, setBulkSelectionMap] = useState({});
  const [bulkImportFile, setBulkImportFile] = useState(null);
  const [bulkImportBusy, setBulkImportBusy] = useState(false);
  const [bulkImportMessage, setBulkImportMessage] = useState('');
  /** 'name_asc' | 'no_locations_first' */
  const [listSortMode, setListSortMode] = useState('name_asc');
  const [showDuplicateNamesOnly, setShowDuplicateNamesOnly] = useState(false);

  const currencyOptions = useMemo(() => ([
    { code: 'K', name: 'K' },
    { code: 'USD', name: '$' },
  ]), []);

  // (Planner removed per request) Keep only simple per-combo max display.


  useEffect(() => {
    fetchAll();
    fetchInventory();
  }, [rtTickCatalog]);

  const [categoryFilter, setCategoryFilter] = useState('');

  const fetchAll = async () => {
    const loadSeq = ++catalogLoadSeqRef.current;
    try {
      const snap = cacheGet(PRODUCTS_LIST_CATALOG_CACHE_KEY);
      if (snap && typeof snap === 'object') {
        setProducts(snap.products || []);
        setCategories(snap.categories || []);
        setLocations(snap.locations || []);
        setUnits(snap.units || []);
        setCombos(snap.combos || []);
        setComboLocations(snap.comboLocations || []);
        setComboItems(snap.comboItems || []);
        setProductLocationPrices(snap.productLocationPrices || []);
        setComboLocationPrices(snap.comboLocationPrices || []);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const catalogPromise = Promise.all([
        db
          .from("products")
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, image_url, product_images(image_url), product_locations(location_id), unit:unit_of_measure(id, name, abbreviation)`)
          .order("created_at", { ascending: false }),
        db.from("categories").select("id, name").order("name", { ascending: true }),
        db.from("locations").select("id, name").order("name", { ascending: true }),
        db.from("unit_of_measure").select("id, name, abbreviation"),
        db.from("combos").select("id, combo_name, sku, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency, category_id"),
        db.from("combo_locations").select("combo_id, location_id"),
        db.from("combo_items").select("combo_id, product_id, quantity"),
      ]);

      const [
        { data: products },
        { data: categories },
        { data: locations },
        { data: unitsData },
        { data: combos },
        { data: comboLocations },
        { data: comboItems },
      ] = await catalogPromise;

      let productLocationPriceRows = [];
      let comboLocationPriceRows = [];
      try {
        [productLocationPriceRows, comboLocationPriceRows] = await Promise.all([
          fetchProductLocationPrices(db),
          fetchComboLocationPrices(db),
        ]);
      } catch (locationPriceErr) {
        console.warn('[products-list] location pricing unavailable', locationPriceErr?.message || locationPriceErr);
      }

      if (loadSeq !== catalogLoadSeqRef.current) return;

      const mappedProducts = mapCatalogProducts(products || [], unitsData || []);
      setProducts(mappedProducts);
      const sortedCategories = (categories || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
      const sortedLocations = (locations || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
      setCategories(sortedCategories);
      setLocations(sortedLocations);
      setUnits(unitsData || []);
      setCombos(combos || []);
      setComboLocations(comboLocations || []);
      setComboItems(comboItems || []);
      setProductLocationPrices(productLocationPriceRows || []);
      setComboLocationPrices(comboLocationPriceRows || []);
      setLoading(false);
      try {
        cacheSet(PRODUCTS_LIST_CATALOG_CACHE_KEY, {
          products: mappedProducts,
          categories: sortedCategories,
          locations: sortedLocations,
          units: unitsData || [],
          combos: combos || [],
          comboLocations: comboLocations || [],
          comboItems: comboItems || [],
          productLocationPrices: productLocationPriceRows || [],
          comboLocationPrices: comboLocationPriceRows || [],
        }, PRODUCTS_LIST_CATALOG_CACHE_TTL_MS);
      } catch {}
    } catch (err) {
      // handle error
    } finally {
      if (loadSeq === catalogLoadSeqRef.current) setLoading(false);
    }
  };

  const fetchInventory = async (options = {}) => {
    const { skipCache = false } = options || {};
    const snapshot = await fetchInventorySnapshot();
    if (!snapshot.error) {
      const nextInventory = snapshot.data || [];
      setInventory(nextInventory);
    }
  };

  const refreshInventoryForLocations = async (locationIds = []) => {
    const normalized = Array.from(new Set((locationIds || [])
      .map((locId) => normalizeLocationId(locId))
      .filter(Boolean)));
    if (normalized.length === 0) {
      await fetchInventory({ skipCache: true });
      return;
    }
    const snapshot = await fetchInventorySnapshot(normalized);
    if (snapshot?.error) {
      await fetchInventory({ skipCache: true });
      return;
    }
    const snapshotRows = Array.isArray(snapshot.data) ? snapshot.data : [];
    setInventory((prev) => {
      const prevRows = Array.isArray(prev) ? prev : [];
      const filtered = prevRows.filter((row) => !normalized.includes(normalizeLocationId(row.location)));
      const merged = [...filtered, ...snapshotRows];
      return merged;
    });
  };

  const applyDeletedProductIds = useCallback((deletedIds) => {
    const ids = Array.from(new Set((deletedIds || []).map(id => String(id)).filter(Boolean)));
    if (!ids.length) return;
    const idSet = new Set(ids);

    setProducts(prev => prev.filter(product => !idSet.has(String(product.id))));
    setComboItems(prev => prev.filter(item => !idSet.has(String(item.product_id))));
    setInventory(prev => prev.filter(row => !idSet.has(String(row.product_id))));
    setFactoryStorageSummary(prev => prev.filter(row => !idSet.has(String(row.product_id))));
    setBulkSelectionMap(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        delete next[`prod:${id}`];
        delete next[`combo:${id}`];
      });
      return next;
    });
  }, []);

  const handleDeleteProducts = useCallback(async (productIds) => {
    const ids = Array.from(new Set((productIds || []).map(id => String(id)).filter(Boolean)));
    if (!ids.length) return [];
    const deletedIds = await deleteProductsViaApi(ids);
    applyDeletedProductIds(deletedIds);
    await Promise.allSettled(deletedIds.map((id) => purgeExistingStorageImages(id, false)));
    await fetchAll();
    await fetchInventory({ skipCache: true });
    return deletedIds;
  }, [applyDeletedProductIds]);

  const handleDeleteProduct = useCallback(async (productId) => {
    return handleDeleteProducts([productId]);
  }, [handleDeleteProducts]);

  const applyLocalInventoryChanges = useCallback((changes) => {
    if (!Array.isArray(changes) || changes.length === 0) return;
    setInventory((prev) => {
      let next = Array.isArray(prev) ? [...prev] : [];
      changes.forEach((change) => {
        const productKey = String(change.productId || '');
        const locationKey = normalizeLocationId(change.locationId);
        if (!productKey || !locationKey) return;
        const matches = next.filter((row) => String(row.product_id) === productKey && normalizeLocationId(row.location) === locationKey);
        const baseId = matches[0]?.id || `local-${productKey}-${locationKey}`;
        next = next.filter((row) => !(String(row.product_id) === productKey && normalizeLocationId(row.location) === locationKey));
        next.push({
          id: baseId,
          product_id: change.productId,
          location: change.locationId,
          quantity: Number(change.quantity || 0),
        });
      });
      return next;
    });
  }, [normalizeLocationId]);


  // Helpers for sets (memoized for stable identities in hooks)
  const getStockForProduct = useCallback((productId, locId) => {
    const lid = normalizeLocationId(locId);
    const rows = (inventory || []).filter(inv => {
      if (String(inv.product_id) !== String(productId)) return false;
      if (!lid) return true;
      return normalizeLocationId(inv.location) === lid;
    });
    return rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [inventory, normalizeLocationId]);

  const getStockForProductAcrossSelected = useCallback((productId) => {
    if (selectedLocationIds.length === 0) return getStockForProduct(productId, '');
    return selectedLocationIds.reduce(
      (sum, locId) => sum + getStockForProduct(productId, locId),
      0
    );
  }, [getStockForProduct, selectedLocationIds]);

  const computeComboMaxQty = useCallback((comboId, locId) => {
    const items = (comboItems || []).filter(ci => String(ci.combo_id) === String(comboId));
    if (!items.length) return 0;
    let minSets = Infinity;
    for (const it of items) {
      const stock = locId ? getStockForProduct(it.product_id, locId) : getStockForProduct(it.product_id, '');
      const perSet = Number(it.quantity) || 0;
      if (perSet <= 0) return 0;
      const possible = Math.floor(stock / perSet);
      if (possible < minSets) minSets = possible;
    }
    return Number.isFinite(minSets) ? minSets : 0;
  }, [comboItems, getStockForProduct]);

  useEffect(() => {
    if (!qtyModalOpen || !qtyModalProduct) {
      setQtyModalRows([]);
      setQtyModalLoading(false);
      return;
    }
    let cancelled = false;
    setQtyModalLoading(true);
    const rows = (locations || []).map((loc) => {
      const qty = qtyModalProduct.__isCombo
        ? computeComboMaxQty(qtyModalProduct.id, loc.id)
        : getStockForProduct(qtyModalProduct.id, loc.id);
      return {
        id: loc.id,
        name: loc.name,
        qty: Number(qty || 0)
      };
    });
    if (!cancelled) {
      setQtyModalRows(rows);
      setQtyModalLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [qtyModalOpen, qtyModalProduct, locations, computeComboMaxQty, getStockForProduct]);

  const getComboRemainders = useCallback((comboId, locId) => {
    const items = (comboItems || []).filter(ci => String(ci.combo_id) === String(comboId));
    if (!items.length) return [];
    const maxSets = computeComboMaxQty(comboId, locId);
    return items.map(it => {
      const perSet = Number(it.quantity)||0;
      const stock = locId ? getStockForProduct(it.product_id, locId) : getStockForProduct(it.product_id, '');
      const used = perSet * maxSets;
      const rem = stock - used;
      const prod = (products||[]).find(p => String(p.id) === String(it.product_id));
      const label = prod ? (prod.name || prod.sku || it.product_id) : it.product_id;
      return { label, remainder: rem };
    });
  }, [comboItems, computeComboMaxQty, getStockForProduct, products]);

  const getComboFactoryHoldSets = useCallback((comboId) => {
    const items = (comboItems || []).filter(ci => String(ci.combo_id) === String(comboId));
    if (!items.length) return 0;
    let minSets = Infinity;
    for (const it of items) {
      const perSet = Number(it.quantity) || 0;
      if (perSet <= 0) return 0;
      const heldQty = factoryStorageTotalsByProduct.get(String(it.product_id)) || 0;
      const possible = Math.floor(heldQty / perSet);
      if (possible < minSets) minSets = possible;
    }
    return Number.isFinite(minSets) ? minSets : 0;
  }, [comboItems, factoryStorageTotalsByProduct]);

  // Equal-share grouping: for combos that share EXACT identical component product set (ignoring quantities),
  // compute a fair share value = min over components floor(stock_total / (sum(quantity per combo in group))).
  // Removed planner-related hooks/effects.

  // Helper to resolve a product's unit label
  const getUnitLabel = useCallback((product) => {
    const pid = product?.unit_of_measure_id;
    if (pid === null || pid === undefined || pid === '') return '-';
    const u = units.find((x) => String(x.id) === String(pid));
    if (!u) return '-';
    return u.abbreviation || u.name || '-';
  }, [units]);


  // Merge products and combos into one list (memoized to avoid churn while filtering)
  const allItems = useMemo(() => ([
    ...(combos || []).map(c => ({ ...c, __isCombo: true })),
    ...(products || []).map(p => ({ ...p, __isCombo: false }))
  ]), [combos, products]);

  const filteredProducts = useMemo(() => allItems.filter(item => {
    const isCombo = !!item.__isCombo;
    if (!isCombo) {
      // Exclude legacy 'set' unit products
      let unitName = undefined;
      if (item.unit && item.unit.name) {
        unitName = item.unit.name;
      } else {
        const unit = units.find(u => String(u.id) === String(item.unit_of_measure_id));
        unitName = unit?.name;
      }
      if (unitName && unitName.toLowerCase() === 'set') return false;
    }
    if (categoryFilter) {
      if (isCombo) return false;
      if (String(item.category_id || '') !== String(categoryFilter)) return false;
    }
    // Location filter (multi-select)
    if (selectedLocationIds.length > 0) {
      if (isCombo) {
        const linked = (comboLocations || []).some(cl => String(cl.combo_id) === String(item.id) && isLocationSelected(cl.location_id));
        if (!linked) return false;
      } else {
        const hasInventoryAtSelected = (inventory || []).some(inv => String(inv.product_id) === String(item.id) && isLocationSelected(inv.location));
        if (item.product_locations && item.product_locations.length > 0) {
          const linked = item.product_locations.some(pl => isLocationSelected(pl.location_id));
          if (!linked && !hasInventoryAtSelected) return false;
        } else {
          if (!hasInventoryAtSelected) return false;
        }
      }
    }
    // Search filter
    if (search.trim() !== "") {
      const searchLower = search.toLowerCase();
      if (isCombo) {
        if (!(
          (item.combo_name && item.combo_name.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower))
        )) return false;
      } else {
        if (!(
          (item.name && item.name.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (categories.find((c) => c.id === item.category_id)?.name?.toLowerCase().includes(searchLower))
        )) return false;
      }
    }
    if (negativeOnly) {
      if (isCombo) return false;
      if (!Array.isArray(inventory) || inventory.length === 0) return false;
      if (selectedLocationIds.length > 0) {
        const hasNegative = (inventory || []).some(inv =>
          String(inv.product_id) === String(item.id)
          && Number(inv.quantity) < 0
          && isLocationSelected(inv.location)
        );
        if (!hasNegative) return false;
      } else {
        const hasNegative = (inventory || []).some(inv => String(inv.product_id) === String(item.id) && Number(inv.quantity) < 0);
        if (!hasNegative) return false;
      }
    }
    return true;
  }), [
    allItems,
    categories,
    comboLocations,
    inventory,
    negativeOnly,
    search,
    units,
    selectedLocationIds,
    isLocationSelected,
    categoryFilter,
  ]);

  const getItemDisplayName = useCallback((item) => (
    String(item?.__isCombo ? (item.combo_name || '') : (item.name || '')).trim()
  ), []);

  const duplicateCatalogProducts = useMemo(() => (
    (products || []).filter((product) => {
      const unit = units.find((row) => String(row.id) === String(product.unit_of_measure_id));
      const unitName = unit?.name || '';
      return unitName.toLowerCase() !== 'set';
    })
  ), [products, units]);

  const duplicateNameInfo = useMemo(
    () => getDuplicateProductNameInfo(duplicateCatalogProducts, (product) => product?.name),
    [duplicateCatalogProducts],
  );

  const duplicateNameKeyByProductId = useMemo(() => {
    const map = new Map();
    duplicateCatalogProducts.forEach((product) => {
      map.set(String(product.id), normalizeProductNameKey(product?.name));
    });
    return map;
  }, [duplicateCatalogProducts]);

  const getAssignedLocationIdsForItem = useCallback((item) => {
    if (!item) return [];
    if (item.__isCombo) {
      return (comboLocations || [])
        .filter((cl) => String(cl.combo_id) === String(item.id))
        .map((cl) => cl.location_id);
    }
    return (item.product_locations || []).map((pl) => pl.location_id);
  }, [comboLocations]);

  const productLocationPriceMap = useMemo(
    () => buildProductLocationPriceMap(productLocationPrices),
    [productLocationPrices],
  );
  const comboLocationPriceMap = useMemo(
    () => buildComboLocationPriceMap(comboLocationPrices),
    [comboLocationPrices],
  );
  const pricingDisplayLocationId = useMemo(() => {
    if (selectedLocationIds.length > 0) {
      return normalizeLocationId(selectedLocationIds[0]);
    }
    return '';
  }, [normalizeLocationId, selectedLocationIds]);
  const pricingEditLocationId = useMemo(() => (
    selectedLocationIds.length === 1 ? normalizeLocationId(selectedLocationIds[0]) : ''
  ), [normalizeLocationId, selectedLocationIds]);
  const pricingLocationLabel = useMemo(() => {
    const locId = pricingDisplayLocationId || pricingEditLocationId;
    if (!locId) return '';
    const match = (locations || []).find((row) => isSameLocation(row.id, locId));
    return match?.name || 'selected location';
  }, [isSameLocation, locations, pricingDisplayLocationId, pricingEditLocationId]);

  const displayedProducts = useMemo(() => {
    let items = filteredProducts.slice();
    if (showDuplicateNamesOnly) {
      items = items.filter((item) => !item.__isCombo && duplicateNameInfo.ids.has(String(item.id)));
    }
    const byName = (a, b) => getItemDisplayName(a).localeCompare(getItemDisplayName(b), undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (showDuplicateNamesOnly) {
      items.sort((a, b) => {
        const keyA = duplicateNameKeyByProductId.get(String(a.id)) || '';
        const keyB = duplicateNameKeyByProductId.get(String(b.id)) || '';
        const keyCmp = keyA.localeCompare(keyB, undefined, { sensitivity: 'base', numeric: true });
        if (keyCmp !== 0) return keyCmp;
        return byName(a, b);
      });
    } else if (listSortMode === 'no_locations_first') {
      items.sort((a, b) => {
        const aEmpty = getAssignedLocationIdsForItem(a).length === 0 ? 0 : 1;
        const bEmpty = getAssignedLocationIdsForItem(b).length === 0 ? 0 : 1;
        if (aEmpty !== bEmpty) return aEmpty - bEmpty;
        return byName(a, b);
      });
    } else {
      items.sort(byName);
    }
    if (!pricingDisplayLocationId) return items;
    return items.map((item) => (
      item.__isCombo
        ? applyComboLocationPricing(item, pricingDisplayLocationId, comboLocationPriceMap)
        : applyProductLocationPricing(item, pricingDisplayLocationId, productLocationPriceMap)
    ));
  }, [
    filteredProducts,
    getAssignedLocationIdsForItem,
    getItemDisplayName,
    listSortMode,
    showDuplicateNamesOnly,
    duplicateNameInfo.ids,
    duplicateNameKeyByProductId,
    pricingDisplayLocationId,
    productLocationPriceMap,
    comboLocationPriceMap,
  ]);

  const bulkSelectableItems = useMemo(() => (
    displayedProducts.map(item => ({
      key: `${item.__isCombo ? 'combo' : 'prod'}:${item.id}`,
      id: String(item.id),
      isCombo: !!item.__isCombo
    }))
  ), [displayedProducts]);

  // Keep selections across search/filter changes so users can tick items one-by-one while searching.
  const selectedBulkItems = useMemo(() => (
    Object.entries(bulkSelectionMap)
      .filter(([, checked]) => checked)
      .map(([key]) => {
        const sep = key.indexOf(':');
        const kind = sep >= 0 ? key.slice(0, sep) : 'prod';
        const id = sep >= 0 ? key.slice(sep + 1) : key;
        return { key, id, isCombo: kind === 'combo' };
      })
  ), [bulkSelectionMap]);

  const selectedProductIds = useMemo(() => (
    Array.from(new Set(selectedBulkItems.filter(item => !item.isCombo).map(item => item.id)))
  ), [selectedBulkItems]);

  const selectedComboIds = useMemo(() => (
    Array.from(new Set(selectedBulkItems.filter(item => item.isCombo).map(item => item.id)))
  ), [selectedBulkItems]);

  const selectedBulkProductRows = useMemo(() => (
    selectedBulkItems
      .filter((item) => !item.isCombo)
      .map((item) => {
        const product = (products || []).find((row) => String(row.id) === String(item.id));
        return {
          id: String(item.id),
          name: product?.name || product?.sku || item.id,
          sku: product?.sku || '',
          image_url: product?.image_url || '',
        };
      })
  ), [selectedBulkItems, products]);

  const allBulkKeys = useMemo(() => (
    bulkSelectableItems.map(item => item.key)
  ), [bulkSelectableItems]);

  const bulkAllSelected = useMemo(() => (
    allBulkKeys.length > 0 && allBulkKeys.every(key => bulkSelectionMap[key])
  ), [allBulkKeys, bulkSelectionMap]);

  const needsBulkLocation = bulkAction === 'add_location' || bulkAction === 'remove_location';

  useEffect(() => {
    if (!bulkLocationMenuOpen) return undefined;
    const onPointerDown = (event) => {
      const root = bulkLocationMenuRef.current;
      if (root && !root.contains(event.target)) {
        setBulkLocationMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setBulkLocationMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [bulkLocationMenuOpen]);

  useEffect(() => {
    if (!needsBulkLocation) setBulkLocationMenuOpen(false);
  }, [needsBulkLocation]);

  const toggleBulkLocationId = useCallback((locId) => {
    const id = String(locId || '');
    if (!id) return;
    setBulkLocationIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  }, []);

  const bulkLocationTriggerLabel = useMemo(() => {
    if (!bulkLocationIds.length) return 'Select locations…';
    if (bulkLocationIds.length === 1) {
      const match = (locations || []).find((loc) => String(loc.id) === String(bulkLocationIds[0]));
      return match?.name || '1 location';
    }
    return `${bulkLocationIds.length} locations`;
  }, [bulkLocationIds, locations]);

  const negativeResetTargets = useMemo(() => {
    if (!negativeOnly) return [];
    if (!Array.isArray(inventory) || inventory.length === 0) return [];
    const targets = [];
    filteredProducts.forEach(item => {
      if (item.__isCombo) return;
      (inventory || []).forEach(inv => {
        if (String(inv.product_id) !== String(item.id)) return;
        if (Number(inv.quantity) >= 0) return;
        if (selectedLocationIds.length > 0 && !isLocationSelected(inv.location)) return;
        targets.push(inv);
      });
    });
    return targets;
  }, [filteredProducts, inventory, isLocationSelected, negativeOnly, selectedLocationIds]);

  useEffect(() => {
    if (bulkField === 'currency') {
      setBulkValue('K');
    } else {
      setBulkValue('');
    }
  }, [bulkField]);


  const bulkFieldOptions = useMemo(() => ([
    { value: 'currency', label: 'Currency', type: 'select', options: currencyOptions.map(opt => ({ value: opt.code, label: opt.name })) },
    { value: 'category_id', label: 'Category', type: 'select', options: [{ value: '', label: 'None' }, ...categories.map(cat => ({ value: String(cat.id), label: cat.name }))] },
    { value: 'unit_of_measure_id', label: 'Unit', type: 'select', options: [{ value: '', label: 'None' }, ...units.map(unit => ({ value: String(unit.id), label: unit.abbreviation ? `${unit.name} (${unit.abbreviation})` : unit.name }))] },
    { value: 'price', label: 'Standard Price', type: 'number' },
    { value: 'cost_price', label: 'Cost Price', type: 'number' },
    { value: 'promotional_price', label: 'Promotional Price', type: 'number' },
  ]), [categories, currencyOptions, units]);

  const bulkFieldMeta = useMemo(() => (
    bulkFieldOptions.find(opt => opt.value === bulkField) || bulkFieldOptions[0]
  ), [bulkField, bulkFieldOptions]);

  const chunkArray = (list, size) => {
    const chunks = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  };

  const handleApplyBulkUpdate = async () => {
    const productIds = selectedProductIds;
    const comboIds = selectedComboIds;
    if (productIds.length === 0 && comboIds.length === 0) {
      alert('No products available to update.');
      return;
    }
    setBulkApplyLoading(true);
    setBulkApplyMessage('');
    try {
      if (bulkAction === 'add_location') {
        if (bulkLocationIds.length === 0) {
          alert('Select at least one location.');
          setBulkApplyLoading(false);
          return;
        }
        const productRows = productIds.flatMap((productId) => (
          bulkLocationIds.map((locId) => ({ product_id: productId, location_id: locId }))
        ));
        for (const chunk of chunkArray(productRows, 500)) {
          await syncProductLocations({ rows: chunk }, db);
        }
        const comboRows = comboIds.flatMap((comboId) => (
          bulkLocationIds.map((locId) => ({ combo_id: comboId, location_id: locId }))
        ));
        for (const chunk of chunkArray(comboRows, 500)) {
          await upsertComboLocations(chunk);
        }
        await fetchAll();
        const total = productIds.length + comboIds.length;
        setBulkApplyMessage(`Locations applied to ${total} item${total === 1 ? '' : 's'}.`);
        return;
      }

      if (bulkAction === 'remove_location') {
        if (bulkLocationIds.length === 0) {
          alert('Select at least one location.');
          setBulkApplyLoading(false);
          return;
        }
        const productRows = productIds.flatMap((productId) => (
          bulkLocationIds.map((locId) => ({ product_id: productId, location_id: locId }))
        ));
        for (const chunk of chunkArray(productRows, 500)) {
          await removeProductLocations(chunk, db);
        }
        const comboRows = comboIds.flatMap((comboId) => (
          bulkLocationIds.map((locId) => ({ combo_id: comboId, location_id: locId }))
        ));
        for (const chunk of chunkArray(comboRows, 500)) {
          await removeComboLocations(chunk);
        }
        await fetchAll();
        const total = productIds.length + comboIds.length;
        setBulkApplyMessage(`Locations removed from ${total} item${total === 1 ? '' : 's'}.`);
        return;
      }

      if (bulkAction === 'set_field') {
        if (!bulkFieldMeta) {
          alert('Select a field to update.');
          setBulkApplyLoading(false);
          return;
        }
        let value = bulkValue;
        if (bulkFieldMeta.value === 'currency' && !bulkValue) {
          alert('Select a currency value.');
          setBulkApplyLoading(false);
          return;
        }
        if (bulkFieldMeta.type === 'number') {
          const parsed = Number(bulkValue);
          if (!Number.isFinite(parsed)) {
            alert('Enter a valid number.');
            setBulkApplyLoading(false);
            return;
          }
          value = parsed;
        }
        if (bulkFieldMeta.value === 'category_id' || bulkFieldMeta.value === 'unit_of_measure_id') {
          value = bulkValue ? parseInt(bulkValue, 10) : null;
        }
        if (bulkFieldMeta.value === 'promotional_price' && bulkValue === '') {
          value = null;
        }

        const locationPriceFields = new Set(['price', 'promotional_price']);
        const targetLocationIds = (selectedLocationIds.length > 0
          ? selectedLocationIds
          : (locations || []).map((row) => row.id))
          .map((locId) => normalizeLocationId(locId))
          .filter(Boolean);

        if (locationPriceFields.has(bulkFieldMeta.value)) {
          if (!targetLocationIds.length) {
            alert('No locations available for price update.');
            setBulkApplyLoading(false);
            return;
          }
          const productRows = productIds.flatMap((productId) => {
            const product = (products || []).find((row) => String(row.id) === String(productId));
            return targetLocationIds.map((locationId) => {
              const existing = productLocationPriceMap.get(`${productId}:${locationId}`);
              return buildProductLocationPriceUpsert({
                productId,
                locationId,
                price: bulkFieldMeta.value === 'price'
                  ? value
                  : (existing?.price ?? product?.price ?? null),
                promotionalPrice: bulkFieldMeta.value === 'promotional_price'
                  ? value
                  : (existing?.promotional_price ?? product?.promotional_price ?? null),
                promoStartDate: existing?.promo_start_date ?? product?.promo_start_date ?? null,
                promoEndDate: existing?.promo_end_date ?? product?.promo_end_date ?? null,
              });
            });
          });
          if (productRows.length) {
            await upsertProductLocationPrices(db, productRows);
          }

          const comboRows = comboIds.flatMap((comboId) => {
            const combo = (combos || []).find((row) => String(row.id) === String(comboId));
            const standard = combo?.combo_price ?? combo?.standard_price ?? null;
            return targetLocationIds.map((locationId) => {
              const existing = comboLocationPriceMap.get(`${comboId}:${locationId}`);
              return buildComboLocationPriceUpsert({
                comboId,
                locationId,
                comboPrice: bulkFieldMeta.value === 'price'
                  ? value
                  : (existing?.combo_price ?? standard),
                promotionalPrice: bulkFieldMeta.value === 'promotional_price'
                  ? value
                  : (existing?.promotional_price ?? combo?.promotional_price ?? null),
                promoStartDate: existing?.promo_start_date ?? combo?.promo_start_date ?? null,
                promoEndDate: existing?.promo_end_date ?? combo?.promo_end_date ?? null,
              });
            });
          });
          if (comboRows.length) {
            await upsertComboLocationPrices(db, comboRows);
          }
        } else if (productIds.length > 0) {
          const chunks = chunkArray(productIds, 500);
          for (const chunk of chunks) {
            const { error } = await db
              .from('products')
              .update({ [bulkFieldMeta.value]: value })
              .in('id', chunk);
            if (error) throw error;
          }
        }

        const comboFieldMap = {
          category_id: 'category_id',
          unit_of_measure_id: 'unit_of_measure_id',
          currency: 'currency',
          promotional_price: 'promotional_price',
          promo_start_date: 'promo_start_date',
          promo_end_date: 'promo_end_date',
          price: 'standard_price',
        };
        const comboField = comboFieldMap[bulkFieldMeta.value];
        let updatedCombos = 0;
        if (!locationPriceFields.has(bulkFieldMeta.value) && comboIds.length > 0 && comboField) {
          const chunks = chunkArray(comboIds, 500);
          for (const chunk of chunks) {
            const { error } = await db
              .from('combos')
              .update({ [comboField]: value })
              .in('id', chunk);
            if (error) throw error;
          }
          updatedCombos = comboIds.length;
        }
        await fetchAll();
        const skippedCombos = comboIds.length > 0 && !comboField && !locationPriceFields.has(bulkFieldMeta.value) ? ' (sets skipped)' : '';
        const comboSuffix = updatedCombos > 0 ? `, ${updatedCombos} set${updatedCombos === 1 ? '' : 's'}` : '';
        const locationSuffix = locationPriceFields.has(bulkFieldMeta.value)
          ? ` across ${targetLocationIds.length} location${targetLocationIds.length === 1 ? '' : 's'}`
          : '';
        setBulkApplyMessage(`Updated ${bulkFieldMeta.label} for ${productIds.length} product${productIds.length === 1 ? '' : 's'}${comboSuffix}${locationSuffix}${skippedCombos}.`);
        const priceFields = new Set(['price', 'promotional_price', 'cost_price']);
        logUserActivity({
          actionType: priceFields.has(bulkFieldMeta.value) ? 'product_price_change' : 'product_edit',
          actionLabel: priceFields.has(bulkFieldMeta.value) ? 'Bulk Price Change' : 'Bulk Product Update',
          details: `${bulkFieldMeta.label} set to ${value} for ${productIds.length} product${productIds.length === 1 ? '' : 's'}${comboSuffix}${locationSuffix}`,
          reference: bulkFieldMeta.value,
          entityType: 'product_bulk',
          entityId: String(productIds.length),
        });
      }
    } catch (err) {
      alert('Bulk update failed: ' + (err.message || err));
    } finally {
      setBulkApplyLoading(false);
    }
  };

  const handleResetNegativeStock = async () => {
    if (!canAdjustInventory) return;
    if (!negativeResetTargets.length) {
      alert('No negative stock rows to reset.');
      return;
    }
    const scopeLabel = selectedLocationIds.length > 0 ? 'selected locations' : 'all locations shown';
    const confirmed = window.confirm(`Reset ${negativeResetTargets.length} negative stock entr${negativeResetTargets.length === 1 ? 'y' : 'ies'} for ${scopeLabel} back to 0?`);
    if (!confirmed) return;
    setResettingNegatives(true);
    try {
      const nowIso = new Date().toISOString();
      for (const row of negativeResetTargets) {
        const currentQty = Number(row.quantity || 0);
        const delta = -currentQty; // currentQty is negative, so delta is positive increase to reach zero
        const { error: invErr } = await db
          .from('inventory')
          .update({ quantity: 0 })
          .eq('id', row.id);
        if (invErr) throw invErr;
        await db.from('inventory_adjustments').insert({
          product_id: row.product_id,
          location_id: row.location,
          quantity: delta,
          adjustment_type: 'Negative Reset to Zero',
          adjusted_at: nowIso,
          metadata: {
            prior_quantity: currentQty,
            reason: 'Bulk reset from ProductsListPage',
            user_id: currentUser?.id || null,
            user_name: currentUserName,
            source: 'products-list'
          }
        });
      }
      await fetchInventory();
      logUserActivity({
        actionType: 'inventory_adjustment',
        actionLabel: 'Negative Stock Reset',
        details: `${negativeResetTargets.length} entr${negativeResetTargets.length === 1 ? 'y' : 'ies'} reset to 0 • ${scopeLabel}`,
        reference: 'negative-reset',
        entityType: 'inventory_bulk',
        entityId: String(negativeResetTargets.length),
      });
      alert('Negative stock reset to 0.');
    } catch (err) {
      alert('Failed to reset negative stock: ' + (err.message || err));
    } finally {
      setResettingNegatives(false);
    }
  };

  // Format price with currency symbol: K -> 'K xxx,xxx', USD/$ -> '$ xxx,xxx'
  const handleExportProductsExcel = () => {
    if (!displayedProducts.length) {
      alert('No products to export.');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    exportProductsListExcel({
      items: displayedProducts,
      locations,
      getStockForProduct,
      computeComboMaxQty,
      filename: `products-list_${stamp}.xlsx`,
    });
  };

  function formatWithCurrency(value, currency) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '-';
    const sym = (() => {
      const c = String(currency || '').toUpperCase();
      if (c === 'USD' || c === '$') return '$';
      if (c === 'ZMW' || c === 'K') return 'K';
      return c || '';
    })();
    const formatted = Math.round(num).toLocaleString('en-US');
    return sym ? `${sym} ${formatted}` : formatted;
  }

  const getEditablePriceRaw = (item, field, isCombo) => {
    if (field === 'price') {
      if (isCombo) return item.combo_price ?? item.standard_price ?? '';
      return item.price ?? '';
    }
    return item.promotional_price ?? '';
  };

  const parseInlinePriceDraft = (draft, allowEmpty) => {
    // Strip currency symbols/labels users may type (K, $, ZMW, etc.)
    const trimmed = String(draft || '')
      .trim()
      .replace(/,/g, '')
      .replace(/^(kwacha|zmw|zmk|usd|us\$)\s*/i, '')
      .replace(/^[k$£€]\s*/i, '')
      .trim();
    if (!trimmed) return allowEmpty ? null : NaN;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const saveInlinePrice = async (item, isCombo, field, draft) => {
    // Prevent Enter+blur (or double-blur) from saving twice. The second save
    // often had an empty draft and cleared promotional_price back to null.
    if (inlinePriceSaveLockRef.current) return false;
    inlinePriceSaveLockRef.current = true;

    if (!pricingEditLocationId) {
      alert('Choose a location in the Location filter (next to Categories), not the bulk “Add to location” picker.');
      inlinePriceSaveLockRef.current = false;
      return false;
    }

    const allowEmpty = field === 'promotional_price';
    const parsed = parseInlinePriceDraft(draft, allowEmpty);
    if (!allowEmpty && (!Number.isFinite(parsed) || parsed < 0)) {
      alert('Enter a valid price.');
      inlinePriceSaveLockRef.current = false;
      return false;
    }
    if (allowEmpty && String(draft || '').trim() !== '' && !Number.isFinite(parsed)) {
      alert('Enter a valid promotional price or leave blank to clear.');
      inlinePriceSaveLockRef.current = false;
      return false;
    }

    const itemId = item.id;
    const itemName = isCombo ? item.combo_name : item.name;
    const oldValue = getEditablePriceRaw(item, field, isCombo);
    const oldParsed = parseInlinePriceDraft(oldValue, allowEmpty);
    // No-op if unchanged (also blocks the empty blur that follows Enter).
    if (Object.is(oldParsed, parsed) || (oldParsed == null && parsed == null)) {
      inlinePriceDraftRef.current = '';
      setInlinePriceEdit(null);
      inlinePriceSaveLockRef.current = false;
      return true;
    }

    // Drop any in-flight catalog fetch so it cannot overwrite this save.
    catalogLoadSeqRef.current += 1;
    setInlinePriceEdit((prev) => (prev ? { ...prev, saving: true } : prev));
    try {
      const baseProduct = (products || []).find((row) => String(row.id) === String(itemId));
      const baseCombo = (combos || []).find((row) => String(row.id) === String(itemId));
      if (isCombo) {
        await saveComboLocationPrice(db, {
          comboId: itemId,
          locationId: pricingEditLocationId,
          field,
          value: parsed,
          baseCombo: baseCombo || item,
        });
      } else {
        await saveProductLocationPrice(db, {
          productId: itemId,
          locationId: pricingEditLocationId,
          field,
          value: parsed,
          baseProduct: baseProduct || item,
        });
      }

      clearProductsListCaches();
      const patchLocationPriceState = (prev, rowMatcher, patcher) => (
        (prev || []).some(rowMatcher)
          ? (prev || []).map((row) => (rowMatcher(row) ? patcher(row) : row))
          : [...(prev || []), patcher({})]
      );
      if (isCombo) {
        setComboLocationPrices((prev) => patchLocationPriceState(
          prev,
          (row) => String(row.combo_id) === String(itemId) && isSameLocation(row.location_id, pricingEditLocationId),
          (row) => ({
            combo_id: itemId,
            location_id: pricingEditLocationId,
            combo_price: field === 'price' ? parsed : (row.combo_price ?? baseCombo?.combo_price ?? baseCombo?.standard_price ?? null),
            promotional_price: field === 'promotional_price'
              ? parsed
              : (row.promotional_price ?? baseCombo?.promotional_price ?? null),
          }),
        ));
      } else {
        setProductLocationPrices((prev) => patchLocationPriceState(
          prev,
          (row) => String(row.product_id) === String(itemId) && isSameLocation(row.location_id, pricingEditLocationId),
          (row) => ({
            product_id: itemId,
            location_id: pricingEditLocationId,
            price: field === 'price' ? parsed : (row.price ?? baseProduct?.price ?? null),
            promotional_price: field === 'promotional_price'
              ? parsed
              : (row.promotional_price ?? baseProduct?.promotional_price ?? null),
          }),
        ));
      }

      logUserActivity({
        actionType: 'product_price_change',
        actionLabel: field === 'price' ? 'Inline Price Change' : 'Inline Promo Price Change',
        details: `${itemName} @ ${pricingLocationLabel} • ${field === 'price' ? 'Price' : 'Promo'} ${oldValue || '-'} → ${parsed ?? 'cleared'}`,
        reference: field,
        entityType: isCombo ? 'combo' : 'product',
        entityId: String(itemId),
      });
      inlinePriceDraftRef.current = '';
      setInlinePriceEdit(null);
      return true;
    } catch (err) {
      alert(`Failed to save price: ${err.message || err}`);
      setInlinePriceEdit((prev) => (prev ? { ...prev, saving: false } : prev));
      return false;
    } finally {
      inlinePriceSaveLockRef.current = false;
    }
  };

  const renderEditablePriceCell = (item, field, isCombo, rowKey, className) => {
    const isEditing = inlinePriceEdit?.rowKey === rowKey && inlinePriceEdit?.field === field;
    const displayValue = field === 'price'
      ? (isCombo
        ? formatWithCurrency(item.combo_price || item.standard_price, item.currency)
        : formatWithCurrency(item.price, item.currency))
      : formatWithCurrency(item.promotional_price, item.currency);

    if (isEditing) {
      return (
        <td className={className}>
          <input
            ref={inlinePriceInputRef}
            type="text"
            inputMode="decimal"
            value={inlinePriceEdit.draft}
            disabled={inlinePriceEdit.saving}
            onChange={(e) => {
              inlinePriceDraftRef.current = e.target.value;
              setInlinePriceEdit((prev) => (prev ? { ...prev, draft: e.target.value } : prev));
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                inlinePriceDraftRef.current = '';
                setInlinePriceEdit(null);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                await saveInlinePrice(item, isCombo, field, inlinePriceDraftRef.current);
              }
            }}
            onBlur={async () => {
              if (inlinePriceSaveLockRef.current) return;
              if (
                !inlinePriceEdit
                || inlinePriceEdit.rowKey !== rowKey
                || inlinePriceEdit.field !== field
                || inlinePriceEdit.saving
              ) return;
              await saveInlinePrice(item, isCombo, field, inlinePriceDraftRef.current);
            }}
            className="products-list-inline-price-input"
            aria-label={field === 'price' ? 'Edit price' : 'Edit promotional price'}
          />
        </td>
      );
    }

    return (
      <td
        className={`${className}${pricingEditLocationId ? ' products-list-cell-editable' : ''}`}
        title={pricingEditLocationId ? 'Double-click to edit location price' : 'Select one location to edit prices'}
        onDoubleClick={() => {
          if (!pricingEditLocationId) {
            alert('Choose a location in the Location filter (next to Categories), not the bulk “Add to location” picker.');
            return;
          }
          const draft = String(getEditablePriceRaw(item, field, isCombo) ?? '');
          inlinePriceDraftRef.current = draft;
          setInlinePriceEdit({
            rowKey,
            field,
            draft,
          });
        }}
      >
        {displayValue}
      </td>
    );
  };

  useEffect(() => {
    if (!inlinePriceEdit || !inlinePriceInputRef.current) return;
    // Only focus/select when starting an edit — not on every keystroke.
    // Selecting on each draft change was replacing typed digits (225 → 25).
    inlinePriceInputRef.current.focus();
    inlinePriceInputRef.current.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlinePriceEdit?.rowKey, inlinePriceEdit?.field]);

  const escapeCsv = (value) => {
    const raw = value == null ? '' : String(value);
    if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
  };

  const handleExportProductsCsv = () => {
    const header = ['id', 'name', 'sku', 'price', 'promotional_price', 'currency', 'category_id', 'unit_of_measure_id'];
    const lines = (displayedProducts || []).map(p => [
      p.id,
      p.name,
      p.sku,
      p.price,
      p.promotional_price,
      p.currency,
      p.category_id,
      p.unit_of_measure_id,
    ].map(escapeCsv).join(','));
    const csv = [header.map(escapeCsv).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Products_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const parseCsvLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  };

  const handleImportInventoryCsv = async () => {
    if (!bulkImportFile || bulkImportBusy) return;
    setBulkImportBusy(true);
    setBulkImportMessage('');
    try {
      const text = await bulkImportFile.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV has no data rows.');
      const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
      const idx = {
        product_id: header.indexOf('product_id'),
        location: header.indexOf('location'),
        quantity: header.indexOf('quantity'),
      };
      if (idx.product_id < 0 || idx.location < 0 || idx.quantity < 0) {
        throw new Error('CSV must include product_id, location, quantity headers.');
      }
      const inserts = [];
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i]);
        const product_id = (cols[idx.product_id] || '').trim();
        const location = (cols[idx.location] || '').trim();
        const quantity = Number(cols[idx.quantity] || 0);
        if (!product_id || !location) continue;
        if (!Number.isFinite(quantity)) continue;
        inserts.push({ product_id, location, quantity });
      }
      if (!inserts.length) throw new Error('No valid rows found in CSV.');
      await applyInventoryBulk({ inserts }, db);
      setBulkImportMessage(`Imported ${inserts.length} inventory rows.`);
      setBulkImportFile(null);
      await fetchInventory();
    } catch (err) {
      setBulkImportMessage(err?.message || 'Import failed.');
    } finally {
      setBulkImportBusy(false);
    }
  };

  return (
    <div className="products-list-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>All Products</h1>
      </div>
      <div className="products-list-toolbar">
        <div className="products-list-toolbar-row">
          <div className="products-toolbar-control-wrap">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="products-toolbar-select pos-control"
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="products-toolbar-control-wrap">
            <select
              value={selectedLocationIds.length === 1 ? normalizeLocationId(selectedLocationIds[0]) : ''}
              onChange={(e) => {
                const value = String(e.target.value || '').trim();
                setSelectedLocationIds(value ? [normalizeLocationId(value)] : []);
              }}
              className="products-toolbar-select pos-control"
              aria-label="Filter by location and set price location"
            >
              <option value="">All locations</option>
              {(locations || []).map((loc) => (
                <option key={loc.id} value={normalizeLocationId(loc.id)}>{loc.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="products-toolbar-btn"
          >
            Add Prod
          </button>
          <div className="products-toolbar-control-wrap products-toolbar-bulk-wrap">
            <select
              value={bulkAction === 'set_field' ? 'set_field' : (bulkAction === 'remove_location' ? 'remove_location' : 'add_location')}
              onChange={(e) => {
                const value = String(e.target.value || 'add_location');
                if (value === 'set_field') {
                  setBulkAction('set_field');
                  setBulkLocationIds([]);
                  return;
                }
                setBulkAction(value === 'remove_location' ? 'remove_location' : 'add_location');
              }}
              className="products-toolbar-select products-toolbar-bulk-select pos-control"
              aria-label="Bulk location action"
            >
              <option value="add_location">Add to location…</option>
              <option value="remove_location">Remove from location…</option>
              <option value="set_field">Set field…</option>
            </select>
          </div>
          {needsBulkLocation && (
            <div
              className="products-toolbar-control-wrap products-toolbar-bulk-locations-wrap"
              ref={bulkLocationMenuRef}
            >
              <button
                type="button"
                className="products-toolbar-bulk-locations-trigger"
                onClick={() => setBulkLocationMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={bulkLocationMenuOpen}
                aria-label={bulkAction === 'remove_location' ? 'Locations to remove' : 'Locations to add'}
              >
                <span>{bulkLocationTriggerLabel}</span>
                <span className="products-toolbar-bulk-locations-caret" aria-hidden="true" />
              </button>
              {bulkLocationMenuOpen && (
                <div className="products-toolbar-bulk-locations-menu" role="listbox" aria-multiselectable="true">
                  {(locations || []).map((loc) => {
                    const id = String(loc.id);
                    const checked = bulkLocationIds.includes(id);
                    return (
                      <label key={id} className="products-toolbar-bulk-locations-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulkLocationId(id)}
                        />
                        <span>{loc.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleApplyBulkUpdate}
            disabled={bulkApplyLoading || selectedBulkItems.length === 0 || (needsBulkLocation && bulkLocationIds.length === 0)}
            className="products-toolbar-btn products-toolbar-btn--apply"
            title={bulkApplyLoading ? 'Applying…' : `Apply bulk action (${selectedBulkItems.length} selected)`}
          >
            {bulkApplyLoading
              ? 'Applying...'
              : bulkAction === 'add_location'
                ? `Add Location (${selectedBulkItems.length})`
                : bulkAction === 'remove_location'
                  ? `Remove Location (${selectedBulkItems.length})`
                  : `Apply Bulk (${selectedBulkItems.length})`}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                const targets = selectedBulkItems.map(item => ({ id: String(item.id), isCombo: !!item.isCombo }));
                if (targets.length === 0) {
                  alert('Select at least one row using the Bulk checkboxes.');
                  return;
                }
                setDeleteTargets(targets);
                setDeleteConfirmText('');
                setDeleteConfirmOpen(true);
              }}
              disabled={selectedBulkItems.length === 0}
              className="products-toolbar-btn products-toolbar-btn--delete"
            >
              {`Delete (${selectedBulkItems.length})`}
            </button>
          )}
          {selectedBulkProductRows.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setImageEditProduct(null);
                setImageEditBulkProducts(selectedBulkProductRows);
                setImageEditFile(null);
                setImageEditModalOpen(true);
              }}
              disabled={imageEditLoading}
              className="products-toolbar-btn products-toolbar-btn--apply"
              title="Upload one image and apply it to all selected products"
            >
              {`Same Image (${selectedBulkProductRows.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDuplicateNamesOnly((active) => !active)}
            className={`products-toolbar-btn products-toolbar-btn--duplicates${showDuplicateNamesOnly ? ' is-active' : ''}`}
            title={showDuplicateNamesOnly
              ? 'Showing products with similar names (case, spacing, or word order). Click to show all products.'
              : 'Show products that share the same name when spacing, case, or word order is ignored'}
            aria-pressed={showDuplicateNamesOnly}
          >
            {showDuplicateNamesOnly
              ? `Duplicates (${duplicateNameInfo.productCount})`
              : `Find Duplicates${duplicateNameInfo.groupCount > 0 ? ` (${duplicateNameInfo.groupCount})` : ''}`}
          </button>
          <button
            type="button"
            onClick={handleExportProductsExcel}
            className="products-toolbar-icon-btn"
            title="Download product list (Excel)"
            aria-label="Download product list Excel"
          >
            <FaFileExcel aria-hidden="true" />
          </button>
        </div>
        <div className="products-list-toolbar-row products-list-toolbar-row--search">
          <div className="products-toolbar-control-wrap products-toolbar-control-wrap--search">
            <input
              type="text"
              placeholder="Search products by name, SKU, or category..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="products-toolbar-input products-toolbar-search-input"
              aria-label="Search products"
            />
          </div>
          {bulkAction === 'set_field' && bulkFieldMeta && (
            <div className="products-toolbar-control-wrap">
              <select
                value={bulkField}
                onChange={(e) => setBulkField(e.target.value)}
                className="products-toolbar-select pos-control"
                aria-label="Bulk field"
              >
                {bulkFieldOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
          {bulkAction === 'set_field' && bulkFieldMeta && (
            bulkFieldMeta.type === 'select' ? (
              <div className="products-toolbar-control-wrap">
                <select
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="products-toolbar-select pos-control"
                  aria-label="Bulk value"
                >
                  {bulkFieldMeta.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="products-toolbar-control-wrap">
                <input
                  type="number"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="Value"
                  className="products-toolbar-input pos-control"
                  aria-label="Bulk value"
                />
              </div>
            )
          )}
        </div>
        {showDuplicateNamesOnly && (
          <div className="products-toolbar-message products-toolbar-message--duplicates">
            Showing {duplicateNameInfo.productCount} product{duplicateNameInfo.productCount === 1 ? '' : 's'} across {duplicateNameInfo.groupCount} duplicate name group{duplicateNameInfo.groupCount === 1 ? '' : 's'}.
            Names match when extra spaces, letter case, or word order differ.
          </div>
        )}
        {bulkApplyMessage && (
          <div className="products-toolbar-message">{bulkApplyMessage}</div>
        )}
        {selectedLocationIds.length !== 1 && (
          <div className="products-toolbar-message">
            Select a location in the Location filter (next to Categories) to view and edit location-specific prices. The bulk “Add to location” picker is only for assigning products to locations.
          </div>
        )}
        {pricingDisplayLocationId && (
          <div className="products-toolbar-message">
            Prices for {pricingLocationLabel}
            {selectedLocationIds.length > 1 ? ' (first selected location)' : ''}.
          </div>
        )}
      </div>
    <div className="products-list">
        {(loading && products.length === 0 && combos.length === 0) ? (
          <div>Loading...</div>
        ) : displayedProducts.length === 0 ? (
          <div>{showDuplicateNamesOnly ? 'No duplicate product names match the current filters.' : 'No products found.'}</div>
        ) : (
      <div className="products-list-table-wrap">
            <table className="products-list-table">
              <thead>
                <tr style={{background: '#23272f'}}>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '4%'}}>
                    <div className="products-list-bulk-header">
                      <span>Bulk</span>
                      <input
                        type="checkbox"
                        className="products-bulk-checkbox"
                        checked={bulkAllSelected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBulkSelectionMap((prev) => {
                            const next = { ...prev };
                            allBulkKeys.forEach((key) => {
                              if (checked) next[key] = true;
                              else delete next[key];
                            });
                            return next;
                          });
                        }}
                        aria-label="Select all visible products"
                      />
                    </div>
                  </th>
                  <th className="products-list-cell-image-header" style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '3cm'}}>Image</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '14%'}}>Name</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '7%'}}>SKU</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '9%'}}>Category</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '14%'}}>
                    <div className="products-list-location-header">
                      <span>Location</span>
                      <button
                        type="button"
                        className={`products-list-sort-btn${listSortMode === 'no_locations_first' ? ' is-active' : ''}`}
                        onClick={() => setListSortMode((mode) => (
                          mode === 'no_locations_first' ? 'name_asc' : 'no_locations_first'
                        ))}
                        title={listSortMode === 'no_locations_first'
                          ? 'Sorted: No locations first (click for A–Z)'
                          : 'Sort: No locations first'}
                        aria-label={listSortMode === 'no_locations_first'
                          ? 'Sorted by no locations first. Click to sort A to Z by name'
                          : 'Sort by no locations first'}
                        aria-pressed={listSortMode === 'no_locations_first'}
                      >
                        {listSortMode === 'no_locations_first' ? '▲' : '↕'}
                      </button>
                    </div>
                  </th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '7%'}}>Price</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '7%'}}>Promo</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '7%'}}>Edit</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '9%'}}>Inventory</th>
                </tr>
              </thead>
              <tbody>
                {displayedProducts.map((item) => {
                  const isCombo = !!item.__isCombo;
                  const aggregateQty = (!isCombo)
                    ? getStockForProductAcrossSelected(item.id)
                    : null;
                  let hasNegativeEntry = false;
                  if (!isCombo) {
                    if (selectedLocationIds.length > 0) {
                      hasNegativeEntry = (inventory || []).some(inv =>
                        String(inv.product_id) === String(item.id)
                        && Number(inv.quantity) < 0
                        && isLocationSelected(inv.location)
                      );
                    } else {
                      hasNegativeEntry = (inventory || []).some(inv => String(inv.product_id) === String(item.id) && Number(inv.quantity) < 0);
                    }
                  }
                  const highlightRow = !isCombo && (
                    showDuplicateNamesOnly
                    || (selectedLocationIds.length > 0
                      ? Number(aggregateQty) < 0
                      : hasNegativeEntry)
                  );
                  const rowKey = `${isCombo ? 'combo' : 'prod'}-${item.id}`;
                  const bulkKey = `${isCombo ? 'combo' : 'prod'}:${item.id}`;
                  const actionMenuOpen = openActionMenuId === rowKey;
                  const primaryInventoryLabel = isCombo ? 'Set Inventory' : 'Inventory';
                  const categoryName = categories.find((c) => String(c.id) === String(item.category_id))?.name;
                  const hasCategoryId = item.category_id !== null && item.category_id !== undefined && String(item.category_id) !== '';
                  const categoryMissing = hasCategoryId && !categoryName;
                  // Show only locations assigned to this item (product_locations / combo_locations),
                  // not every location in the system — so bulk add/remove is visible in this column.
                  const HIDDEN_LOCATION_ID = '20abb7a3-9df9-45bd-885e-6440503ea728';
                  const assignedIdSet = new Set(
                    getAssignedLocationIdsForItem(item)
                      .map((id) => normalizeLocationId(id))
                      .filter(Boolean)
                  );
                  const locationQtyRows = (locations || [])
                    .filter((loc) => String(loc.id) !== HIDDEN_LOCATION_ID)
                    .filter((loc) => assignedIdSet.has(normalizeLocationId(loc.id)))
                    .map((loc) => {
                      const qty = isCombo
                        ? computeComboMaxQty(item.id, loc.id)
                        : getStockForProduct(item.id, loc.id);
                      return {
                        id: loc.id,
                        name: loc.name,
                        qty: Number(qty || 0),
                      };
                    });
                  return (
                    <tr
                      key={isCombo ? `combo-${item.id}` : item.id}
                      className={highlightRow ? (showDuplicateNamesOnly ? 'products-list-row--duplicate' : 'products-list-row--negative') : undefined}
                      style={!showDuplicateNamesOnly && highlightRow ? { background: '#4d1f1f' } : undefined}
                    >
                      <td className="products-list-cell-bulk">
                        <input
                          type="checkbox"
                          className="products-bulk-checkbox"
                          checked={Object.prototype.hasOwnProperty.call(bulkSelectionMap, bulkKey) ? bulkSelectionMap[bulkKey] : false}
                          onChange={e => {
                            const checked = e.target.checked;
                            setBulkSelectionMap(prev => {
                              const next = { ...prev };
                              if (checked) next[bulkKey] = true;
                              else delete next[bulkKey];
                              return next;
                            });
                          }}
                          aria-label={`Select ${isCombo ? item.combo_name : item.name}`}
                        />
                      </td>
                      <td className="products-list-cell-image">
                        {(() => {
                          const imageUrl = getListItemImageUrl(item);
                          const imageAlt = isCombo ? item.combo_name : item.name;
                          if (!imageUrl) {
                            return <span className="products-list-thumb-empty" aria-hidden="true">—</span>;
                          }
                          return (
                            <div
                              className="products-list-thumb-wrap"
                              role="button"
                              tabIndex={0}
                              onClick={() => setExpandedImage(imageUrl)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setExpandedImage(imageUrl);
                                }
                              }}
                              aria-label={`View larger image for ${imageAlt}`}
                            >
                              <img
                                src={imageUrl}
                                alt={imageAlt}
                                className="products-list-thumb"
                                loading="lazy"
                              />
                              <div className="products-list-thumb-zoom" aria-hidden="true">
                                <img src={imageUrl} alt="" className="products-list-thumb-zoom__img" />
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="products-list-cell-name">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => openQtyModal(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openQtyModal(item);
                            }
                          }}
                          className="products-list-name-link"
                        >
                          {isCombo ? item.combo_name : item.name}
                        </span>
                      </td>
                      <td className="products-list-cell-sku">{isCombo ? item.sku : (item.sku || '(auto)')}</td>
                      <td className="products-list-cell-category">
                        <span>{categoryName || (isCombo ? 'Set' : '-')}</span>
                        {categoryMissing && (
                          <span
                            style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: '#3a1f1f',
                              color: '#ffb3b3',
                              border: '1px solid #ff6b6b',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.4px'
                            }}
                          >
                            Missing category
                          </span>
                        )}
                      </td>
                      <td className="products-list-cell-locations">
                        {locationQtyRows.length === 0 ? (
                          <span className="products-list-location-empty">No locations</span>
                        ) : (
                          <ul className="products-list-location-qty-list" aria-label={`Stock by location for ${isCombo ? item.combo_name : item.name}`}>
                            {locationQtyRows.map((row) => (
                              <li key={row.id}>
                                {row.name}: {row.qty.toLocaleString()}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {renderEditablePriceCell(item, 'price', isCombo, rowKey, 'products-list-cell-price')}
                      {renderEditablePriceCell(item, 'promotional_price', isCombo, rowKey, 'products-list-cell-promo')}
                      <td style={{textAlign: 'center', padding: '0.15rem'}}>
                        <div style={{display: 'flex', justifyContent: 'center'}}>
                          <div style={{position:'relative'}} onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              className="products-list-action-btn products-list-action-btn--edit"
                              onClick={(e) => toggleActionMenu(e, rowKey)}
                            >Edit</button>
                            {actionMenuOpen && (
                              <div
                                style={{
                                  position:'absolute',
                                  top:'calc(100% + 8px)',
                                  left:'50%',
                                  transform:'translateX(-50%)',
                                  background:'#0f1729',
                                  border:'1px solid #1f3b4d',
                                  borderRadius:8,
                                  boxShadow:'0 8px 18px rgba(0,0,0,0.45)',
                                  minWidth:220,
                                  maxWidth:260,
                                  width:'max-content',
                                  zIndex:2600,
                                  display:'flex',
                                  flexDirection:'column',
                                  overflow:'hidden'
                                }}
                              >
                                <button
                                  style={{background:'transparent',color:'#e0e6ed',border:'none',padding:'10px 14px',textAlign:'left',cursor:'pointer'}}
                                  onClick={() => {
                                    if (isCombo) {
                                      window.location.href = `/edit-set/${item.id}`;
                                    } else {
                                      window.location.href = `/products?edit=${item.id}`;
                                    }
                                    setOpenActionMenuId(null);
                                  }}
                                >{isCombo ? 'Edit Set' : 'Edit Product'}</button>
                                <button
                                  style={{background:'transparent',color:'#e0e6ed',border:'none',padding:'10px 14px',textAlign:'left',cursor:'pointer'}}
                                  onClick={() => {
                                    setImageEditProduct(item);
                                    setImageEditBulkProducts(null);
                                    setImageEditFile(null);
                                    setImageEditModalOpen(true);
                                    setOpenActionMenuId(null);
                                  }}
                                >Edit Image</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="products-list-cell-action">
                        <button
                          type="button"
                          className="products-list-action-btn products-list-action-btn--inventory"
                          onClick={() => handleOpenAdjustModal(item)}
                          disabled={!canAdjustInventory}
                        >{primaryInventoryLabel}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && canDelete && (
        (() => {
          const isDeleteConfirm = deleteConfirmText.trim().toLowerCase() === 'yes';
          const targetCount = (deleteTargets || []).length;
          return (
        <div className="products-delete-modal-overlay">
          <div className="products-delete-modal" role="dialog" aria-modal="true" aria-labelledby="products-delete-modal-title">
            <h3 id="products-delete-modal-title" className="products-delete-modal__title">Confirm Product Deletion</h3>
            <p className="products-delete-modal__message">
              Type <strong>yes</strong> to confirm deletion of {targetCount} selected item{targetCount === 1 ? '' : 's'}.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              className="products-delete-modal__input"
              autoFocus
            />
            <div className="products-delete-modal__actions">
              <button
                type="button"
                className="products-delete-modal__btn products-delete-modal__btn--confirm"
                disabled={!isDeleteConfirm}
                onClick={async () => {
                  const targets = Array.isArray(deleteTargets) ? deleteTargets : [];
                  try {
                    if (targets.length === 0) {
                      alert('No selected items to delete.');
                    } else {
                      const comboIds = targets.filter(t => t.isCombo).map(t => String(t.id));
                      const productIds = targets.filter(t => !t.isCombo).map(t => String(t.id));

                      for (const comboId of comboIds) {
                        const { error: comboItemsErr } = await db.from('combo_items').delete().eq('combo_id', comboId);
                        if (comboItemsErr) throw comboItemsErr;
                        await deleteComboLocations(comboId);
                        const { error: comboErr } = await db.from('combos').delete().eq('id', comboId);
                        if (comboErr) throw comboErr;
                        setCombos(prev => prev.filter(c => String(c.id) !== String(comboId)));
                        try { await purgeExistingStorageImages(comboId, true); } catch {}
                      }

                      if (productIds.length > 0) {
                        await handleDeleteProducts(productIds);
                      }

                      if (comboIds.length > 0) {
                        clearProductsListCaches();
                        await fetchAll();
                        await fetchInventory({ skipCache: true });
                      }

                      setBulkApplyMessage(`Deleted ${targets.length} selected item${targets.length === 1 ? '' : 's'}.`);
                    }
                  } catch (err) {
                    alert('Failed to delete item: ' + (err.message || err));
                  } finally {
                    // Always close the dialog after confirm action.
                    setDeleteConfirmOpen(false);
                    setDeleteTargets([]);
                    setDeleteConfirmText("");
                  }
                }}
              >Confirm</button>
              <button
                type="button"
                className="products-delete-modal__btn products-delete-modal__btn--secondary"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteTargets([]);
                  setDeleteConfirmText("");
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
          );
        })()
      )}

      {/* ======== FIX: Modals rendered once, outside the map, positioned fixed ======== */}

      {/* Image Expansion Modal */}
      {expandedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.7)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setExpandedImage(null);
          }}
        >
          <img src={expandedImage} alt="Expanded" style={{maxWidth:'80vw',maxHeight:'80vh',borderRadius:'12px',boxShadow:'0 2px 24px #000'}} />
        </div>
      )}

      {qtyModalOpen && qtyModalProduct && (
        <div
          style={{
            position:'fixed',
            top:0,
            left:0,
            width:'100vw',
            height:'100vh',
            background:'rgba(0,0,0,0.6)',
            zIndex:2200,
            display:'flex',
            alignItems:'center',
            justifyContent:'center'
          }}
          onClick={closeQtyModal}
        >
          <div
            style={{background:'#23272f',padding:24,borderRadius:12,minWidth:320,maxWidth:520,border:'1px solid #00b4d8'}}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12}}>
              <h3 style={{margin:0}}>Location Stock</h3>
              <button
                onClick={closeQtyModal}
                style={{background:'#1f3b4d',color:'#e0e6ed',border:'none',borderRadius:'6px',padding:'6px 12px',cursor:'pointer'}}
              >Close</button>
            </div>
            <div style={{marginBottom:12,color:'#9aa4b2'}}>
              {qtyModalProduct.__isCombo ? (
                <>Set: <b style={{color:'#e0e6ed'}}>{qtyModalProduct.combo_name}</b> (SKU: {qtyModalProduct.sku || '-'})</>
              ) : (
                <>Product: <b style={{color:'#e0e6ed'}}>{qtyModalProduct.name}</b> (SKU: {qtyModalProduct.sku || '-'})</>
              )}
            </div>
            {qtyModalLoading ? (
              <div style={{color:'#9aa4b2'}}>Loading stock…</div>
            ) : locations.length === 0 ? (
              <div style={{color:'#9aa4b2'}}>No locations found.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left',padding:'6px 4px',borderBottom:'1px solid #1f3b4d'}}>Location</th>
                    <th style={{textAlign:'right',padding:'6px 4px',borderBottom:'1px solid #1f3b4d'}}>
                      {qtyModalProduct.__isCombo ? 'Buildable Sets' : 'Qty'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {qtyModalRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{padding:'6px 4px',borderBottom:'1px solid #1f3b4d'}}>{row.name}</td>
                      <td style={{padding:'6px 4px',textAlign:'right',borderBottom:'1px solid #1f3b4d'}}>
                        {Number(row.qty || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {factoryStorageModalOpen && factoryStorageModalProduct && (
        <div className="factory-storage-overlay">
          <div className="factory-storage-modal">
            <div className="factory-storage-modal__header">
              <div>
                <h3 style={{margin:'0 0 4px'}}>Sold Products — {factoryStorageModalLabel}</h3>
                {factoryStorageModalIsCombo ? (
                  <div className="factory-storage-modal__subtitle">
                    Approx. holds: <b style={{color:'#e0e6ed'}}>{Number(factoryStorageComboHoldSets || 0).toLocaleString()}</b> set(s) (components tracked individually)
                  </div>
                ) : (
                  <div className="factory-storage-modal__subtitle">
                    Holds at warehouse: <b style={{color:'#e0e6ed'}}>{Number(modalFactoryHoldQty || 0).toLocaleString()}</b> units
                  </div>
                )}
              </div>
              <button onClick={closeFactoryStorageModal} className="factory-storage-close">Close</button>
            </div>
            {factoryStorageModalError && (
              <div className="factory-storage-modal__error">
                {factoryStorageModalError}
              </div>
            )}
            <div className="factory-storage-card">
              <h4 className="factory-storage-card__title">Record New Hold</h4>
              {!canEditFactoryHolds && (
                <div className="factory-storage-modal__subtitle" style={{ color: '#f4d35e', marginBottom: 8 }}>
                  Factory holds are view-only for your account.
                </div>
              )}
              <div className="factory-storage-form-grid">
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">{factoryStorageModalIsCombo ? 'Sets to Hold' : 'Quantity'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={factoryStorageForm.quantity}
                    onChange={e => handleFactoryStorageFormChange('quantity', e.target.value)}
                    style={factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Expected Release</label>
                  <input
                    type="date"
                    value={factoryStorageForm.expectedReleaseDate}
                    onChange={e => handleFactoryStorageFormChange('expectedReleaseDate', e.target.value)}
                    style={factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Sale ID (optional)</label>
                  <input
                    value={factoryStorageForm.saleId}
                    onChange={e => handleFactoryStorageFormChange('saleId', e.target.value)}
                    style={factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Sale Item ID</label>
                  <input
                    value={factoryStorageForm.saleItemId}
                    onChange={e => handleFactoryStorageFormChange('saleItemId', e.target.value)}
                    style={factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Customer Name</label>
                  <input
                    value={factoryStorageForm.customerName}
                    onChange={e => handleFactoryStorageFormChange('customerName', e.target.value)}
                    style={factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!canEditFactoryHolds}
                  />
                </div>
                <div className="factory-storage-field">
                  <label className="factory-storage-field__label">Customer Phone</label>
                  <input
                    value={factoryStorageForm.customerPhone}
                    onChange={e => handleFactoryStorageFormChange('customerPhone', e.target.value)}
                    style={factoryModalInputStyle}
                    className="factory-storage-input"
                    disabled={!canEditFactoryHolds}
                  />
                </div>
              </div>
              {factoryStorageModalIsCombo && (
                <div className="factory-storage-combo-preview">
                  <div style={{color:'#9aa4b2',fontSize:'0.9rem',marginBottom:8}}>Each set adds holds for every component:</div>
                  {!factoryStorageComboComponents.length ? (
                    <div style={{color:'#f4a261'}}>No components are linked to this set yet.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th style={{textAlign:'center'}}>Qty / Set</th>
                          <th style={{textAlign:'center'}}>Hold Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {factoryStorageComboPreview.map(component => (
                          <tr key={component.product_id}>
                            <td>
                              <div style={{fontWeight:600}}>{component.productName}</div>
                              {component.sku && <div style={{color:'#9aa4b2',fontSize:'0.8rem'}}>SKU: {component.sku}</div>}
                            </td>
                            <td style={{textAlign:'center'}}>{Number(component.perSetQty || 0).toLocaleString()}</td>
                            <td style={{textAlign:'center'}}>{Number(component.holdQty || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <div className="factory-storage-field" style={{marginTop:12}}>
                <label className="factory-storage-field__label">Notes</label>
                <textarea
                  value={factoryStorageForm.notes}
                  onChange={e => handleFactoryStorageFormChange('notes', e.target.value)}
                  style={{...factoryModalInputStyle, minHeight:'70px'}}
                  className="factory-storage-input factory-storage-note"
                  placeholder="Optional remarks (e.g., who dropped the item off)"
                  disabled={!canEditFactoryHolds}
                />
              </div>
              <div className="factory-storage-actions">
                <button
                  onClick={handleCreateFactoryStorageEntry}
                  disabled={!canEditFactoryHolds || factoryStorageSubmitting}
                  style={{
                    background:'#2a9d8f',
                    color:'#fff',
                    border:'none',
                    borderRadius:'6px',
                    padding:'10px 18px',
                    fontWeight:'bold',
                    cursor: (!canEditFactoryHolds || factoryStorageSubmitting) ? 'not-allowed' : 'pointer',
                    opacity: canEditFactoryHolds ? 1 : 0.6
                  }}
                >{factoryStorageSubmitting ? 'Saving…' : 'Save Hold'}</button>
              </div>
            </div>
            <div className="factory-storage-active">
              <h4 style={{margin:'0 0 12px'}}>Active Holds</h4>
              {factoryStorageRowsLoading ? (
                <div>Loading storage rows…</div>
              ) : factoryStorageModalRows.length === 0 ? (
                <div style={{color:'#9aa4b2'}}>No active holds recorded for this item.</div>
              ) : (
                <div className="factory-storage-active__table-wrapper">
                  <table className="factory-storage-active__table">
                    <thead>
                      <tr style={{background:'#223040'}}>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Status</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>{factoryStorageModalItemHeader}</th>
                        <th style={{padding:8,borderBottom:'1px solid #2b3a4f'}}>Stored</th>
                        <th style={{padding:8,borderBottom:'1px solid #2b3a4f'}}>Released</th>
                        <th style={{padding:8,borderBottom:'1px solid #2b3a4f'}}>Remaining</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Stored At</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Expected Release</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Customer</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Reference</th>
                        <th style={{padding:8,textAlign:'left',borderBottom:'1px solid #2b3a4f'}}>Notes</th>
                        <th style={{padding:8,textAlign:'center',borderBottom:'1px solid #2b3a4f'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factoryStorageModalRows.map((row) => {
                        const storedQty = Number(row.quantity || 0);
                        const releasedQty = Number(row.quantity_released || 0);
                        const remainingQty = Math.max(0, storedQty - releasedQty);
                        const itemLabel = factoryStorageModalIsCombo
                          ? (factoryStorageComboComponentMap.get(String(row.product_id))?.productName || `Product ${row.product_id}`)
                          : 'Base product';
                        const componentMeta = factoryStorageModalIsCombo
                          ? factoryStorageComboComponentMap.get(String(row.product_id))
                          : null;
                        const isDraft = factoryStorageReleaseDraft.storageId === row.id;
                        const isEditingRow = factoryStorageEditDraft?.storageId === row.id;
                        return (
                          <tr key={row.id} style={{background:'#121a27'}}>
                            <td style={{padding:8,textTransform:'capitalize'}}>{row.status}</td>
                            <td style={{padding:8}}>
                              {itemLabel}
                              {componentMeta?.sku && (
                                <div style={{color:'#9aa4b2',fontSize:'0.8rem'}}>SKU: {componentMeta.sku}</div>
                              )}
                            </td>
                            <td style={{padding:8,textAlign:'center'}}>{storedQty.toLocaleString()}</td>
                            <td style={{padding:8,textAlign:'center'}}>{releasedQty.toLocaleString()}</td>
                            <td style={{padding:8,textAlign:'center',color: remainingQty > 0 ? '#f4d35e' : '#9aa4b2'}}>{remainingQty.toLocaleString()}</td>
                            <td style={{padding:8}}>{formatDateTime(row.stored_at)}</td>
                            <td style={{padding:8}}>{formatDateOnly(row.expected_release_date)}</td>
                            <td style={{padding:8}}>{row.customer_name || '-'}</td>
                            <td style={{padding:8}}>{row.release_reference || '-'}</td>
                            <td style={{padding:8}}>{row.notes || '-'}</td>
                            <td style={{padding:8,width:'190px'}}>
                              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                <button
                                  style={{background:'#ffb703',color:'#1b1b1b',border:'none',borderRadius:'6px',padding:'6px 10px',fontWeight:'bold',cursor: remainingQty > 0 && !factoryStorageReleaseBusy ? 'pointer' : 'not-allowed'}}
                                  disabled={!canEditFactoryHolds || remainingQty <= 0 || factoryStorageReleaseBusy}
                                  onClick={() => startFactoryStorageRelease(row)}
                                >Release</button>
                                <button
                                  style={{background:'#457b9d',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 10px',fontWeight:'bold',cursor: factoryStorageEditBusy && isEditingRow ? 'wait' : 'pointer'}}
                                  disabled={!canEditFactoryHolds || (factoryStorageEditBusy && isEditingRow)}
                                  onClick={() => startFactoryStorageEdit(row)}
                                >Edit</button>
                                {isDraft && (
                                  <div className="factory-storage-release-draft">
                                    <div style={{fontSize:'0.85rem',color:'#9aa4b2'}}>Available: {remainingQty.toLocaleString()}</div>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={factoryStorageReleaseDraft.qty}
                                      onChange={e => setFactoryStorageReleaseDraft(prev => ({ ...prev, qty: e.target.value }))}
                                      style={{...factoryModalInputStyle}}
                                      className="factory-storage-input"
                                      disabled={!canEditFactoryHolds}
                                    />
                                    <input
                                      value={factoryStorageReleaseDraft.reference}
                                      onChange={e => setFactoryStorageReleaseDraft(prev => ({ ...prev, reference: e.target.value }))}
                                      placeholder="Release reference"
                                      style={{...factoryModalInputStyle}}
                                      className="factory-storage-input"
                                      disabled={!canEditFactoryHolds}
                                    />
                                    <textarea
                                      value={factoryStorageReleaseDraft.note}
                                      onChange={e => setFactoryStorageReleaseDraft(prev => ({ ...prev, note: e.target.value }))}
                                      placeholder="Notes"
                                      style={{...factoryModalInputStyle, minHeight:'60px'}}
                                      className="factory-storage-input"
                                      disabled={!canEditFactoryHolds}
                                    />
                                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                                      <button
                                        onClick={submitFactoryStorageRelease}
                                        disabled={!canEditFactoryHolds || factoryStorageReleaseBusy}
                                        style={{
                                          background:'#2a9d8f',
                                          color:'#fff',
                                          border:'none',
                                          borderRadius:'6px',
                                          padding:'6px 12px',
                                          fontWeight:'bold',
                                          cursor: (!canEditFactoryHolds || factoryStorageReleaseBusy) ? 'not-allowed' : 'pointer',
                                          opacity: canEditFactoryHolds ? 1 : 0.6
                                        }}
                                      >{factoryStorageReleaseBusy ? 'Saving…' : 'Confirm'}</button>
                                      <button
                                        onClick={cancelFactoryStorageRelease}
                                        style={{background:'#e63946',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 12px',fontWeight:'bold',cursor:'pointer'}}
                                      >Cancel</button>
                                    </div>
                                  </div>
                                )}
                                {isEditingRow && (
                                  <div className="factory-storage-edit-draft">
                                    <div className="factory-storage-edit-grid">
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Expected Release</label>
                                        <input
                                          type="date"
                                          value={factoryStorageEditDraft.expectedReleaseDate}
                                          onChange={e => handleFactoryStorageEditChange('expectedReleaseDate', e.target.value)}
                                          style={factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Sale ID</label>
                                        <input
                                          value={factoryStorageEditDraft.saleId}
                                          onChange={e => handleFactoryStorageEditChange('saleId', e.target.value)}
                                          style={factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Sale Item ID</label>
                                        <input
                                          value={factoryStorageEditDraft.saleItemId}
                                          onChange={e => handleFactoryStorageEditChange('saleItemId', e.target.value)}
                                          style={factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Customer Name</label>
                                        <input
                                          value={factoryStorageEditDraft.customerName}
                                          onChange={e => handleFactoryStorageEditChange('customerName', e.target.value)}
                                          style={factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!canEditFactoryHolds}
                                        />
                                      </div>
                                      <div className="factory-storage-field">
                                        <label className="factory-storage-field__label">Customer Phone</label>
                                        <input
                                          value={factoryStorageEditDraft.customerPhone}
                                          onChange={e => handleFactoryStorageEditChange('customerPhone', e.target.value)}
                                          style={factoryModalInputStyle}
                                          className="factory-storage-input"
                                          disabled={!canEditFactoryHolds}
                                        />
                                      </div>
                                    </div>
                                    <div className="factory-storage-field">
                                      <label className="factory-storage-field__label">Notes</label>
                                      <textarea
                                        value={factoryStorageEditDraft.notes}
                                        onChange={e => handleFactoryStorageEditChange('notes', e.target.value)}
                                        style={{...factoryModalInputStyle, minHeight:'60px'}}
                                        className="factory-storage-input"
                                        disabled={!canEditFactoryHolds}
                                      />
                                    </div>
                                    <div className="factory-storage-edit-actions">
                                      <button
                                        onClick={submitFactoryStorageEdit}
                                        disabled={!canEditFactoryHolds || factoryStorageEditBusy}
                                        style={{
                                          background:'#2a9d8f',
                                          color:'#fff',
                                          border:'none',
                                          borderRadius:'6px',
                                          padding:'6px 12px',
                                          fontWeight:'bold',
                                          cursor: (!canEditFactoryHolds || factoryStorageEditBusy) ? 'not-allowed' : 'pointer',
                                          opacity: canEditFactoryHolds ? 1 : 0.6
                                        }}
                                      >{factoryStorageEditBusy ? 'Saving…' : 'Save Changes'}</button>
                                      <button
                                        onClick={cancelFactoryStorageEdit}
                                        style={{background:'#e63946',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 12px',fontWeight:'bold',cursor:'pointer'}}
                                      >Cancel</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Edit Modal (Product, Set, or bulk products) */}
      {imageEditModalOpen && (imageEditProduct || (imageEditBulkProducts && imageEditBulkProducts.length > 0)) && (
        <div className="products-image-modal-overlay">
          <div className="products-image-modal">
            <h3 className="products-image-modal__title">
              {imageEditBulkProducts?.length > 1
                ? `Apply Image to ${imageEditBulkProducts.length} Products`
                : (imageEditProduct?.__isCombo ? 'Edit Set Image' : 'Edit Product Image')}
            </h3>
            <div className="products-image-modal__meta">
              {imageEditBulkProducts?.length > 1 ? (
                <>
                  <div>Selected products:</div>
                  <ul className="products-image-modal__bulk-list">
                    {imageEditBulkProducts.map((row) => (
                      <li key={row.id}>
                        <b>{row.name}</b>
                        {row.sku ? ` (${row.sku})` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              ) : imageEditProduct?.__isCombo ? (
                <>Set: <b>{imageEditProduct.combo_name}</b></>
              ) : (
                <>Product: <b>{imageEditProduct?.name || imageEditBulkProducts?.[0]?.name}</b></>
              )}
            </div>
            <input type="file" accept="image/*" onChange={e => setImageEditFile(e.target.files[0])} className="products-image-modal__file" />
            {!imageEditBulkProducts?.length && (imageEditProduct?.__isCombo ? imageEditProduct.picture_url : imageEditProduct?.image_url) && (
              <div className="products-image-modal__preview-row">
                <img src={imageEditProduct.__isCombo ? imageEditProduct.picture_url : imageEditProduct.image_url} alt="Current" className="products-image-modal__preview" />
                <button
                  onClick={async () => {
                    setImageEditLoading(true);
                    try {
                      if (imageEditProduct.__isCombo) {
                        await db.from('combos').update({ picture_url: '' }).eq('id', imageEditProduct.id);
                      } else {
                        await db.from('product_images').delete().eq('product_id', imageEditProduct.id);
                        await db.from('products').update({ image_url: '' }).eq('id', imageEditProduct.id);
                      }
                      await purgeExistingStorageImages(imageEditProduct.id, Boolean(imageEditProduct.__isCombo));
                      setImageEditModalOpen(false);
                      setImageEditProduct(null);
                      setImageEditBulkProducts(null);
                      setImageEditFile(null);
                      await fetchAll();
                    } catch (err) {
                      alert('Failed to remove image: ' + (err.message || err));
                    } finally {
                      setImageEditLoading(false);
                    }
                  }}
                  className="products-image-modal__btn products-image-modal__btn--danger"
                  disabled={imageEditLoading}
                >Remove Image</button>
              </div>
            )}
            <div className="products-image-modal__actions">
              <button
                disabled={!imageEditFile || imageEditLoading}
                onClick={async () => {
                  if (!imageEditFile) return;
                  setImageEditLoading(true);
                  try {
                    const file = imageEditFile;
                    if (imageEditBulkProducts?.length > 1) {
                      for (let i = 0; i < imageEditBulkProducts.length; i += 1) {
                        const row = imageEditBulkProducts[i];
                        await applyImageFileToItem({
                          itemId: row.id,
                          isCombo: false,
                          file,
                          fileNonce: `${Date.now()}-${i}`,
                        });
                      }
                      const appliedIds = imageEditBulkProducts.map((row) => String(row.id));
                      setBulkSelectionMap((prev) => {
                        const next = { ...prev };
                        appliedIds.forEach((id) => {
                          delete next[`prod:${id}`];
                        });
                        return next;
                      });
                      setBulkApplyMessage(`Image applied to ${imageEditBulkProducts.length} products.`);
                    } else {
                      const target = imageEditProduct || {
                        id: imageEditBulkProducts[0].id,
                        __isCombo: false,
                      };
                      const isCombo = Boolean(target.__isCombo);
                      await applyImageFileToItem({
                        itemId: target.id,
                        isCombo,
                        file,
                      });
                    }
                    setImageEditModalOpen(false);
                    setImageEditProduct(null);
                    setImageEditBulkProducts(null);
                    setImageEditFile(null);
                    await fetchAll();
                  } catch (err) {
                    alert('Failed to upload image: ' + (err.message || err));
                  } finally {
                    setImageEditLoading(false);
                  }
                }}
                className="products-image-modal__btn products-image-modal__btn--primary"
              >{imageEditBulkProducts?.length > 1 ? 'Apply to All' : 'Save'}</button>
              <button
                onClick={() => {
                  setImageEditModalOpen(false);
                  setImageEditProduct(null);
                  setImageEditBulkProducts(null);
                  setImageEditFile(null);
                }}
                className="products-image-modal__btn products-image-modal__btn--secondary"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Planner UI removed */}

      {/* Manual Inventory Adjust / Set Assembly Modal */}
      {adjustModalOpen && adjustProduct && (
        <div className="products-adjust-modal-overlay">
          <div className="products-adjust-modal">
            <h3 className="products-adjust-modal__title">{adjustProduct.__isCombo ? (adjustSetMode === 'assemble' ? 'Assemble Set' : 'Receive Sets') : (transferMode==='transfer' ? 'Transfer Between Locations' : 'Adjust Inventory')}</h3>
            <div className="products-adjust-modal__meta">
              {adjustProduct.__isCombo ? (
                <>Set: <b>{adjustProduct.combo_name}</b> (SKU: {adjustProduct.sku})</>
              ) : (
                <>Product: <b>{adjustProduct.name}</b> (SKU: {adjustProduct.sku})</>
              )}
            </div>
            {!adjustProduct.__isCombo && (
              <div className="products-adjust-modal__row">
                <label className="products-adjust-modal__label">Mode:</label>
                <select value={transferMode} onChange={e=>setTransferMode(e.target.value)} className="products-adjust-modal__control">
                  <option value="adjust">Adjust</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
            )}
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label">Location:</label>
              <select
                value={selectedLocation}
                onChange={(e) => {
                  const lid = e.target.value;
                  setSelectedLocation(lid);
                  if (adjustProduct) {
                    if (adjustProduct.__isCombo) {
                      if (adjustSetMode === 'assemble') {
                        const b = computeComboMaxQty(adjustProduct.id, lid);
                        setAdjustQty(b > 0 ? 1 : 0);
                      } else {
                        setAdjustQty(1);
                      }
                    } else {
                      const inv = inventory.find(inv => inv.product_id === adjustProduct.id && isSameLocation(inv.location, lid));
                      const qty = inv ? Number(inv.quantity) : 0;
                      setAdjustQty(qty);
                    }
                  }
                }}
                className="products-adjust-modal__control"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            {/* Transfer sub-form when in transfer mode for single product */}
            {!adjustProduct.__isCombo && transferMode==='transfer' && (
              <div className="products-adjust-modal__transfer-block">
                <div className="products-adjust-modal__hint">Move stock between locations</div>
                <div className="products-adjust-modal__transfer-row">
                  <label className="products-adjust-modal__label">From:</label>
                  <select value={transferFrom} onChange={e=>setTransferFrom(e.target.value)} className="products-adjust-modal__control">
                    <option value="">-- From --</option>
                    {locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <span className="products-adjust-modal__hint">
                    {(() => {
                      if (!transferFrom) return 'Select from';
                      const fromUuid = resolveLocationUuid(transferFrom);
                      const inv = inventory.find(r => String(r.location)===String(fromUuid) && String(r.product_id)===String(adjustProduct.id));
                      const q = inv ? Number(inv.quantity)||0 : 0;
                      return `Qty: ${q}`;
                    })()}
                  </span>
                </div>
                <div className="products-adjust-modal__transfer-row">
                  <label className="products-adjust-modal__label">To:</label>
                  <select value={transferTo} onChange={e=>setTransferTo(e.target.value)} className="products-adjust-modal__control">
                    <option value="">-- To --</option>
                    {locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <span className="products-adjust-modal__hint">
                    {(() => {
                      if (!transferTo) return 'Select to';
                      const toUuid = resolveLocationUuid(transferTo);
                      const inv = inventory.find(r => String(r.location)===String(toUuid) && String(r.product_id)===String(adjustProduct.id));
                      const q = inv ? Number(inv.quantity)||0 : 0;
                      return `Qty: ${q}`;
                    })()}
                  </span>
                </div>
                {/* Date selection only (no time) */}
                <div className="products-adjust-modal__date-group">
                  <div className="products-adjust-modal__transfer-row products-adjust-modal__transfer-row--wrap">
                    <label className="products-adjust-modal__label">Transfer time:</label>
                    <div className="products-adjust-modal__transfer-row">
                      <label className="products-adjust-modal__label">Date:</label>
                      <input
                        type="date"
                        required
                        value={manualTransferDate}
                        onChange={e=>setManualTransferDate(e.target.value)}
                        className="products-adjust-modal__control products-adjust-modal__date-input"
                      />
                    </div>
                  </div>
                </div>
                <div className="products-adjust-modal__transfer-row">
                  <label className="products-adjust-modal__label">Amount:</label>
                  <input type="number" min={0} className="products-adjust-modal__control products-adjust-modal__qty-input" value={transferQty} onChange={e=>setTransferQty(e.target.value)} />
                  <button disabled={transferBusy || !transferFrom || !transferTo || !transferQty || Number(transferQty)<=0 || transferFrom===transferTo}
                    onClick={async ()=>{
                      if (!adjustProduct) return;
                      setTransferBusy(true);
                      try {
                        const qty = Number(transferQty);
                        if (!Number.isFinite(qty) || qty<=0) throw new Error('Enter a valid amount');
                        if (transferFrom===transferTo) throw new Error('Select different locations');
                        // Resolve UUIDs for session/product_locations tables
                        const fromUuid = resolveLocationUuid(transferFrom);
                        const toUuid = resolveLocationUuid(transferTo);
                        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        if (!UUID_RE.test(fromUuid) || !UUID_RE.test(toUuid)) {
                          throw new Error('Location IDs are not UUIDs. Please ensure locations use UUID IDs.');
                        }
                        // Create a minimal transfer session and entry for one product
                        // Read current app user from localStorage
                        let userId = null; // Firebase Auth UID
                        let legacyUserIntId = null; // optional legacy int id for compatibility
                        try {
                          const raw = localStorage.getItem('user');
                          const u = raw ? JSON.parse(raw) : null;
                          userId = u?.id ?? null;
                          const email = u?.email || '';
                          if (email) {
                            try {
                              const { data: legacyUser } = await db
                                .from('users')
                                .select('id')
                                .eq('email', email)
                                .maybeSingle();
                              if (legacyUser && legacyUser.id != null) legacyUserIntId = legacyUser.id;
                            } catch {}
                          }
                        } catch {}
                        // Determine transfer date (no time component)
                        let sessionCreatedAtIso = new Date().toISOString();
                        let sessionTransferDate = new Date().toISOString().slice(0,10);
                        if (manualTransferDate) {
                          const dtLocal = new Date(`${manualTransferDate}T00:00:00`);
                          if (!isNaN(dtLocal.getTime())) {
                            sessionCreatedAtIso = dtLocal.toISOString();
                            sessionTransferDate = manualTransferDate;
                          }
                        }
                        const payload = {
                          from_location: fromUuid,
                          to_location: toUuid,
                          // write UUID into new column; avoid integer user_id mismatch
                          user_uid: userId,
                          transfer_date: sessionTransferDate,
                          created_at: sessionCreatedAtIso,
                          transfer_datetime: sessionCreatedAtIso
                        };
                        // Add legacy user_id if required by the schema (best-effort)
                        if (legacyUserIntId != null) payload.user_id = legacyUserIntId;
                        const { data: session, error: sessErr } = await db
                          .from('stock_transfer_sessions')
                          .insert(payload)
                          .select()
                          .single();
                        if (sessErr) throw sessErr;
                        const sessionId = session.id;
                        const { error: entryErr } = await db.from('stock_transfer_entries').insert({
                          session_id: sessionId,
                          product_id: adjustProduct.id,
                          quantity: qty
                        });
                        if (entryErr) throw entryErr;
                        // Apply inventory changes
                        const nowIso = new Date().toISOString();
                        const { data: invFrom } = await db.from('inventory').select('id, quantity').eq('product_id', adjustProduct.id).eq('location', fromUuid).maybeSingle();
                        if (invFrom) {
                          await applyInventoryBulk({
                            updates: [{ id: invFrom.id, quantity: Math.max(0, Number(invFrom.quantity || 0) - qty), updated_at: nowIso }],
                          }, db);
                        }
                        const { data: invTo } = await db.from('inventory').select('id, quantity').eq('product_id', adjustProduct.id).eq('location', toUuid).maybeSingle();
                        if (invTo) {
                          await applyInventoryBulk({
                            updates: [{ id: invTo.id, quantity: Number(invTo.quantity || 0) + qty, updated_at: nowIso }],
                          }, db);
                        } else {
                          await applyInventoryBulk({
                            inserts: [{ product_id: adjustProduct.id, location: toUuid, quantity: qty, updated_at: nowIso }],
                          }, db);
                        }
                        // Ensure product_locations link exists for the destination
                        await syncProductLocations({ rows: [{ product_id: adjustProduct.id, location_id: toUuid }] }, db);
                        await refreshInventoryForLocations([fromUuid, toUuid]);
                        setAdjustModalOpen(false);
                      } catch (err) {
                        try {
                          const msg = (err && (err.message || err.error_description)) ? String(err.message || err.error_description) : 'Failed to transfer';
                          const details = (err && (err.details || err.hint)) ? `\n${err.details || err.hint}` : '';
                          const debug = (err && typeof err === 'object') ? `\n${JSON.stringify(err, null, 2)}` : '';
                          alert(`${msg}${details}${debug}`);
                        } catch {
                          alert('Failed to transfer');
                        }
                      } finally {
                        setTransferBusy(false);
                      }
                    }}
                    className="products-adjust-modal__btn products-adjust-modal__btn--primary"
                  >Transfer</button>
                </div>
              </div>
            )}
            {adjustProduct.__isCombo ? (
              <div className="products-adjust-modal__hint products-adjust-modal__hint--bottom">
                {selectedLocation ? (
                  (() => {
                    const b = computeComboMaxQty(adjustProduct.id, selectedLocation);
                    const locName = locations.find(l => String(l.id) === String(selectedLocation))?.name || '';
                    return <span>Buildable Sets at {locName}: <b style={{color:'#e0e6ed'}}>{b}</b></span>;
                  })()
                ) : (
                  <span>Select a location to view buildable sets</span>
                )}
              </div>
            ) : (
              <div className="products-adjust-modal__hint products-adjust-modal__hint--bottom">
                {selectedLocation
                  ? (
                    (() => {
                      const inv = inventory.find(inv => inv.product_id === adjustProduct.id && isSameLocation(inv.location, selectedLocation));
                      const qty = inv ? Number(inv.quantity) : 0;
                      const locName = locations.find(l => String(l.id) === String(selectedLocation))?.name || '';
                      return <span>Current Qty at {locName}: <b style={{color:'#e0e6ed'}}>{qty}</b></span>;
                    })()
                  )
                  : (<span>Select a location to view current quantity</span>)}
              </div>
            )}
            {adjustProduct.__isCombo && (
              <div className="products-adjust-modal__row">
                <label className="products-adjust-modal__label">Mode:</label>
                <select value={adjustSetMode} onChange={e => {
                  const mode = e.target.value;
                  setAdjustSetMode(mode);
                  if (mode === 'assemble') {
                    const b = computeComboMaxQty(adjustProduct.id, selectedLocation || '');
                    setAdjustQty(b > 0 ? 1 : 0);
                  } else {
                    setAdjustQty(1);
                  }
                }} className="products-adjust-modal__control">
                  <option value="receive">Receive (increase components)</option>
                  <option value="assemble">Assemble (consume components)</option>
                </select>
              </div>
            )}
            <div className="products-adjust-modal__row">
              {adjustProduct.__isCombo ? (
                <>
                  <label className="products-adjust-modal__label">{adjustSetMode === 'assemble' ? 'Assemble Sets:' : 'Receive Sets:'}</label>
                  <input type="number" min={1} value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="products-adjust-modal__control products-adjust-modal__qty-input" />
                </>
              ) : (
                <>
                  <label className="products-adjust-modal__label">Quantity:</label>
                  <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="products-adjust-modal__control products-adjust-modal__qty-input" />
                </>
              )}
            </div>
            <div className="products-adjust-modal__actions">
              {transferMode!=='transfer' && (
                <button onClick={handleAdjustInventory} disabled={adjustLoading || !adjustQty} className="products-adjust-modal__btn products-adjust-modal__btn--primary">
                  {adjustLoading ? 'Saving...' : 'Save'}
                </button>
              )}
              <button onClick={()=>setAdjustModalOpen(false)} className="products-adjust-modal__btn products-adjust-modal__btn--secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* ======== End fixed modals ======== */}
    </div>
  );
}

export default ProductsListPage;
