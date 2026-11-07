/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from "react";
import { useNavigate } from 'react-router-dom';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import useDebouncedValue from './hooks/useDebouncedValue';
import { deleteComboLocations, removeComboLocations, replaceComboLocations, upsertComboLocations } from './services/comboLocations';
import { getFactoryStorageSummary, getFactoryStorageItems, createFactoryStorageItem, releaseFactoryStorageItem, updateFactoryStorageItem } from './services/factoryStorage';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import { syncProductLocations } from './services/productLocations';
import { applyInventoryBulk, dedupeInventoryRows, upsertInventoryQuantity } from './utils/inventoryApi';
import { apiUrl, withApiHeaders } from './utils/apiUrl';
import { docIdFromOnConflict } from './db/docIds';
import { classifyInventoryAdjustmentDelta } from './utils/inventoryAdjustmentTypes';
import { canDeleteProducts, canManageCatalog, canManageProductInventory, getCurrentUser } from './accessControl';
import { cacheClear, cacheGet, cacheSet } from './utils/staleCache';
import { productsListStockMoveDisabledMessage } from './utils/productsListStockPolicy';
import { getDuplicateProductNameInfo, normalizeProductNameKey } from './utils/productDuplicateNames';
import { resolveProductImageUrl } from './utils/productImageUrl';
import {
  applyComboLocationPricing,
  applyProductLocationPricing,
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
} from './utils/locationPricing';
import {
  fetchComboLocationPrices,
  fetchProductLocationPrices,
  saveComboLocationPrice,
  saveProductLocationPrice,
} from './services/locationPricing';
import { logUserActivity } from './utils/userActivityLog';
import { firebaseEnsureSession } from './utils/firebaseAuthApi';
import { filterRowsByComboId } from './utils/comboId';
import {
  filterProductsListCatalogProducts,
} from './utils/productsListKitweExclusion';
import ProductsListTableRow from './components/productsList/ProductsListTableRow';
import ProductsListVirtualTbody from './components/productsList/ProductsListVirtualTbody';
import { buildProductsListRowMeta } from './components/productsList/productsListRowMeta';
import { PRODUCTS_LIST_VIRTUAL_THRESHOLD } from './components/productsList/productsListConstants';
import { getListItemImageUrl } from './components/productsList/productsListImage';

const ProductsListHeavyModals = lazy(() => import('./components/productsList/ProductsListHeavyModals'));

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

const PRODUCT_IMAGE_BUCKET = 'productimages';
const PRODUCTS_LIST_CATALOG_CACHE_KEY = 'products:list:catalog:v6';
const PRODUCTS_LIST_INVENTORY_CACHE_KEY = 'products:list:inventory:v5';
const PRODUCTS_LIST_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const PRODUCTS_LIST_INVENTORY_CACHE_TTL_MS = 2 * 60 * 1000;

const clearProductsListCaches = () => {
  try { cacheClear(PRODUCTS_LIST_CATALOG_CACHE_KEY); } catch {}
  try { cacheClear(PRODUCTS_LIST_INVENTORY_CACHE_KEY); } catch {}
};

const deleteProductsViaApi = async (productIds) => {
  const ids = Array.from(new Set((productIds || []).map(id => String(id)).filter(Boolean)));
  if (ids.length === 0) return [];

  const sessionResult = await firebaseEnsureSession();
  const token = sessionResult?.session?.access_token;
  if (!token) {
    throw new Error('Authentication required — please sign in again.');
  }

  const response = await fetch(apiUrl('/api/products-bulk-delete'), {
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
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [imageChoiceProduct, setImageChoiceProduct] = useState(null);
  const [nameEdit, setNameEdit] = useState(null);
  const [categoryEditItem, setCategoryEditItem] = useState(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [stockCorrection, setStockCorrection] = useState(null);
  const [stockCorrectionLoading, setStockCorrectionLoading] = useState(false);
  const nameInputRef = useRef(null);
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
  const [inlinePriceEdit, setInlinePriceEdit] = useState(null);
  const inlinePriceInputRef = useRef(null);
  const inlinePriceDraftRef = useRef('');
  const inlinePriceSaveLockRef = useRef(false);
  const inlineNameDraftRef = useRef('');
  const inlineNameSaveLockRef = useRef(false);
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
  const canManageCatalogPage = canManageCatalog(currentUser);

  const openItemEditor = useCallback((item, isCombo) => {
    if (isCombo) {
      const components = filterRowsByComboId(comboItems, item.id);
      const locationIds = filterRowsByComboId(comboLocations, item.id)
        .map((row) => String(row.location_id));
      navigate(`/edit-set/${item.id}`, {
        state: {
          prefilled: {
            combo: item,
            components,
            locationIds,
          },
        },
      });
      return;
    }
    if (!canManageCatalogPage) {
      alert('You do not have permission to edit products.');
      return;
    }
    navigate(`/products?edit=${encodeURIComponent(item.id)}&return=${encodeURIComponent('/products-list')}`);
  }, [canManageCatalogPage, comboItems, comboLocations, navigate]);

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
    // Sync opening_stock_entries for open and locked opening periods.
    const { data: existing, error } = await db
      .from('stock_periods')
      .select('id, status, begin_period_date, opened_at')
      .eq('location_id', locId)
      .in('status', [PERIOD_STATUS_OPEN, PERIOD_STATUS_LOCKED])
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

  const handleOpenAdjustModal = (product, presetLocationId = null) => {
    if (!canAdjustInventory) {
      alert('Inventory changes are disabled for your account.');
      return;
    }
    if (!product?.__isCombo) {
      alert(productsListStockMoveDisabledMessage());
      return;
    }
    const defaultLocationId = presetLocationId
      ? normalizeLocationId(presetLocationId)
      : (selectedLocationIds.length === 1
        ? normalizeLocationId(selectedLocationIds[0])
        : normalizeLocationId(locations[0]?.id || ''));
    setAdjustProduct(product);
    // Default mode for sets is 'receive'; for products it's normal adjust
    if (product.__isCombo) {
      setAdjustSetMode('receive');
      setAdjustQty(1);
    } else if (defaultLocationId) {
      setAdjustQty(getStockForProduct(product.id, defaultLocationId));
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

  const openImageEditor = useCallback((item) => {
    if (!canManageCatalogPage) {
      alert('You do not have permission to edit product images.');
      return;
    }
    setImageEditProduct(item);
    setImageEditBulkProducts(null);
    setImageEditFile(null);
    setImageEditModalOpen(true);
  }, [canManageCatalogPage]);

  const handleImageCellClick = useCallback((item) => {
    if (!canManageCatalogPage) {
      alert('You do not have permission to edit product images.');
      return;
    }
    const imageUrl = getListItemImageUrl(item);
    if (imageUrl) {
      setImageChoiceProduct(item);
      return;
    }
    openImageEditor(item);
  }, [canManageCatalogPage, openImageEditor]);

  const handleRemoveProductImage = useCallback(async (item) => {
    if (!item) return;
    setImageEditLoading(true);
    try {
      if (item.__isCombo) {
        await db.from('combos').update({ picture_url: '' }).eq('id', item.id);
      } else {
        await db.from('product_images').delete().eq('product_id', item.id);
        await db.from('products').update({ image_url: '' }).eq('id', item.id);
      }
      await purgeExistingStorageImages(item.id, Boolean(item.__isCombo));
      setImageChoiceProduct(null);
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
    if (!adjustProduct.__isCombo) {
      alert(productsListStockMoveDisabledMessage());
      return;
    }
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
              const assemblyDelta = -need;
              const { type: assemblyType, quantity: assemblyQty } = classifyInventoryAdjustmentDelta(assemblyDelta);
              await db.from('inventory_adjustments').insert({
                product_id: it.product_id,
                location_id: locationId,
                quantity: assemblyQty,
                adjustment_type: assemblyType,
                adjusted_at: new Date().toISOString(),
                metadata: {
                  user_id: currentUser?.id || null,
                  user_name: currentUserName,
                  source: 'products-list',
                  delta: assemblyDelta,
                  session_id: activePeriodId || null,
                  set_mode: 'assemble',
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
              const receiveDelta = add;
              const { type: receiveType, quantity: receiveQty } = classifyInventoryAdjustmentDelta(receiveDelta);
              await db.from('inventory_adjustments').insert({
                product_id: it.product_id,
                location_id: locationId,
                quantity: receiveQty,
                adjustment_type: receiveType,
                adjusted_at: new Date().toISOString(),
                metadata: {
                  user_id: currentUser?.id || null,
                  user_name: currentUserName,
                  source: 'products-list',
                  delta: receiveDelta,
                  session_id: activePeriodId || null,
                  set_mode: 'receive',
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
      const { data: invRowsBefore, error: invBeforeErr } = await db
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', adjustProduct.id)
        .eq('location', locationId);
      if (invBeforeErr) throw invBeforeErr;
      const previousQty = dedupeInventoryRows(Array.isArray(invRowsBefore) ? invRowsBefore : [])
        .reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
      const delta = targetQty - previousQty;
      const { type: adjustmentType, quantity: adjustmentQty } = classifyInventoryAdjustmentDelta(delta);
      let locationSyncError = null;
      try {
        await syncProductLocations({ rows: [{ product_id: adjustProduct.id, location_id: locationId }] }, db);
      } catch (e) {
        locationSyncError = e;
        console.warn('[inventory] product_locations sync failed', e);
      }
      try {
        await upsertInventoryQuantity({
          productId: adjustProduct.id,
          locationId,
          quantity: targetQty,
          updatedAt: nowIso,
        }, db);
      } catch (e) {
        if (locationSyncError) {
          const combined = new Error(`${e?.message || e}. Location link failed: ${locationSyncError?.message || locationSyncError}`);
          throw combined;
        }
        throw e;
      }

      const { data: verifyRows, error: verifyErr } = await db
        .from('inventory')
        .select('id, quantity, updated_at')
        .eq('product_id', adjustProduct.id)
        .eq('location', locationId);
      if (verifyErr) throw verifyErr;
      let verifiedQty = dedupeInventoryRows(Array.isArray(verifyRows) ? verifyRows : [])
        .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
      if (Number(verifiedQty) !== Number(targetQty)) {
        const canonicalId = docIdFromOnConflict(
          { product_id: adjustProduct.id, location: locationId },
          'product_id,location',
        );
        const { data: byIdRow } = await db
          .from('inventory')
          .select('quantity')
          .eq('id', canonicalId)
          .maybeSingle();
        if (byIdRow != null) {
          verifiedQty = Number(byIdRow.quantity || 0);
        }
      }
      if (Number(verifiedQty) !== Number(targetQty)) {
        throw new Error(`Inventory save did not stick (expected ${targetQty}, read back ${verifiedQty}). Please try again.`);
      }
      localInventoryChanges.push({ productId: adjustProduct.id, locationId, quantity: targetQty });
      if (delta !== 0) {
        const { error: adjErr } = await db.from('inventory_adjustments').insert({
          product_id: adjustProduct.id,
          location_id: locationId,
          quantity: adjustmentQty,
          adjustment_type: adjustmentType,
          adjusted_at: new Date().toISOString(),
          metadata: {
            user_id: currentUser?.id || null,
            user_name: currentUserName,
            source: 'products-list',
            before_qty: previousQty,
            after_qty: targetQty,
            delta,
            session_id: activePeriodId || null,
          }
        });
        if (adjErr) {
          console.warn('[inventory] adjustment log failed', adjErr);
        }
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
  const debouncedSearch = useDebouncedValue(search, 160);
  const [loading, setLoading] = useState(true);
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [resettingNegatives, setResettingNegatives] = useState(false);
  const [priceLocationMenuOpen, setPriceLocationMenuOpen] = useState(false);
  const priceLocationMenuRef = useRef(null);
  const [bulkSelectionMap, setBulkSelectionMap] = useState({});
  const [toolbarNotice, setToolbarNotice] = useState('');
  /** 'name_asc' | 'no_locations_first' */
  const [listSortMode, setListSortMode] = useState('name_asc');
  const [showDuplicateNamesOnly, setShowDuplicateNamesOnly] = useState(false);

  // (Planner removed per request) Keep only simple per-combo max display.


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
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, image_url, metadata, product_images(image_url), product_locations(location_id), unit:unit_of_measure(id, name, abbreviation)`)
          .order("created_at", { ascending: false }),
        db.from("categories").select("id, name").order("name", { ascending: true }),
        db.from("locations").select("id, name").order("name", { ascending: true }),
        db.from("unit_of_measure").select("id, name, abbreviation"),
        db.from("combos").select("id, combo_name, sku, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency, category_id"),
        db.from("combo_locations").select("combo_id, location_id"),
        db.from("combo_items").select("combo_id, product_id, quantity"),
        db.from('warehouse_assemblies').select('id, retail_product_id, item_kind, metadata'),
        db.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity'),
      ]);

      const [
        { data: products },
        { data: categories },
        { data: locations },
        { data: unitsData },
        { data: combos },
        { data: comboLocations },
        { data: comboItems },
        { data: warehouseAssemblies },
        { data: warehouseAssemblyInventory },
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

      const mappedProducts = mapCatalogProducts(
        filterProductsListCatalogProducts(
          products || [],
          warehouseAssemblies || [],
          warehouseAssemblyInventory || [],
        ),
        unitsData || [],
      );
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

  const persistInventoryCache = useCallback((rows) => {
    try {
      cacheSet(PRODUCTS_LIST_INVENTORY_CACHE_KEY, rows, PRODUCTS_LIST_INVENTORY_CACHE_TTL_MS);
    } catch {}
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const cached = cacheGet(PRODUCTS_LIST_INVENTORY_CACHE_KEY);
      if (Array.isArray(cached) && cached.length > 0) {
        setInventory(dedupeInventoryRows(cached));
      }
    } catch {}
    const snapshot = await fetchInventorySnapshot();
    if (!snapshot.error) {
      const rows = dedupeInventoryRows(snapshot.data || []);
      setInventory(rows);
      persistInventoryCache(rows);
    }
  }, [persistInventoryCache]);

  useEffect(() => {
    fetchAll();
    fetchInventory();
  }, [rtTickCatalog, fetchInventory]);

  const refreshInventoryForLocations = async (locationIds = []) => {
    const normalized = Array.from(new Set((locationIds || [])
      .map((locId) => normalizeLocationId(locId))
      .filter(Boolean)));
    if (normalized.length === 0) {
      await fetchInventory();
      return;
    }
    const snapshot = await fetchInventorySnapshot(normalized);
    if (snapshot?.error) {
      await fetchInventory();
      return;
    }
    const snapshotRows = dedupeInventoryRows(Array.isArray(snapshot.data) ? snapshot.data : []);
    setInventory((prev) => {
      const prevRows = Array.isArray(prev) ? prev : [];
      const filtered = prevRows.filter((row) => !normalized.includes(normalizeLocationId(row.location)));
      const merged = dedupeInventoryRows([...filtered, ...snapshotRows]);
      persistInventoryCache(merged);
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
    await fetchInventory();
    return deletedIds;
  }, [applyDeletedProductIds, fetchInventory]);

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
          updated_at: new Date().toISOString(),
        });
      });
      return next;
    });
  }, [normalizeLocationId]);


  const inventoryQtyLookup = useMemo(() => {
    const byKey = new Map();
    const byProduct = new Map();
    dedupeInventoryRows(inventory || []).forEach((row) => {
      const pid = String(row.product_id);
      const lid = normalizeLocationId(row.location);
      const qty = Number(row.quantity) || 0;
      const key = `${pid}::${lid}`;
      byKey.set(key, (byKey.get(key) || 0) + qty);
      byProduct.set(pid, (byProduct.get(pid) || 0) + qty);
    });
    return { byKey, byProduct };
  }, [inventory, normalizeLocationId]);

  // Helpers for sets (memoized for stable identities in hooks)
  const getStockForProduct = useCallback((productId, locId) => {
    const pid = String(productId);
    const lid = normalizeLocationId(locId);
    if (!lid) return inventoryQtyLookup.byProduct.get(pid) || 0;
    return inventoryQtyLookup.byKey.get(`${pid}::${lid}`) || 0;
  }, [inventoryQtyLookup, normalizeLocationId]);

  const openLocationStockCorrection = useCallback((item, locationRow) => {
    if (!canAdjustInventory) {
      alert('Inventory changes are disabled for your account.');
      return;
    }
    if (!item.__isCombo) {
      alert(productsListStockMoveDisabledMessage());
      return;
    }
    const locationId = normalizeLocationId(locationRow.id);
    setAdjustProduct(item);
    setAdjustSetMode('receive');
    setAdjustQty(1);
    setSelectedLocation(locationId || '');
    setTransferMode('adjust');
    setTransferFrom(locationId || '');
    setTransferTo('');
    setTransferQty('');
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setManualTransferDate(`${yyyy}-${mm}-${dd}`);
    setAdjustModalOpen(true);
  }, [canAdjustInventory, normalizeLocationId]);

  const handleStockCorrection = async () => {
    if (!stockCorrection?.product) return;
    alert(productsListStockMoveDisabledMessage());
    setStockCorrection(null);
  };

  const cancelInlineName = useCallback(() => {
    inlineNameDraftRef.current = '';
    setNameEdit(null);
  }, []);

  const saveInlineName = useCallback(async (item, isCombo, draftValue) => {
    if (inlineNameSaveLockRef.current) return false;
    inlineNameSaveLockRef.current = true;

    const trimmed = String(draftValue || '').trim();
    const currentName = isCombo ? item.combo_name : item.name;
    if (!trimmed) {
      alert('Product name cannot be empty.');
      inlineNameSaveLockRef.current = false;
      return false;
    }
    if (trimmed === String(currentName || '').trim()) {
      cancelInlineName();
      inlineNameSaveLockRef.current = false;
      return true;
    }

    // Drop any in-flight catalog fetch so stale cache cannot overwrite this save.
    catalogLoadSeqRef.current += 1;
    try {
      const patch = isCombo ? { combo_name: trimmed } : { name: trimmed, updated_at: new Date().toISOString() };
      const table = isCombo ? 'combos' : 'products';
      const { error } = await db.from(table).update(patch).eq('id', item.id);
      if (error) throw error;
      if (isCombo) {
        setCombos((prev) => prev.map((row) => (
          String(row.id) === String(item.id) ? { ...row, combo_name: trimmed } : row
        )));
      } else {
        setProducts((prev) => prev.map((row) => (
          String(row.id) === String(item.id) ? { ...row, name: trimmed, updated_at: patch.updated_at } : row
        )));
      }
      clearProductsListCaches();
      logUserActivity({
        actionType: 'product_update',
        actionLabel: isCombo ? 'Set Renamed' : 'Product Renamed',
        details: `${currentName} → ${trimmed}`,
        reference: String(item.id),
        entityType: isCombo ? 'combo' : 'product',
        entityId: String(item.id),
      });
      inlineNameDraftRef.current = '';
      cancelInlineName();
      const searchTerm = String(search || '').trim();
      if (searchTerm && !trimmed.toLowerCase().includes(searchTerm.toLowerCase())) {
        setSearch('');
        setToolbarNotice(`Renamed to "${trimmed}". Search filter cleared so the item stays visible.`);
      } else {
        setToolbarNotice(`Renamed to "${trimmed}".`);
      }
      inlineNameSaveLockRef.current = false;
      return true;
    } catch (err) {
      alert('Failed to save name: ' + (err.message || err));
      inlineNameSaveLockRef.current = false;
      return false;
    }
  }, [cancelInlineName, search]);

  const saveCategoryForItem = async (item, isCombo, categoryId) => {
    try {
      if (isCombo) {
        const { error } = await db.from('combos').update({ category_id: categoryId || null }).eq('id', item.id);
        if (error) throw error;
        setCombos((prev) => prev.map((row) => (
          String(row.id) === String(item.id) ? { ...row, category_id: categoryId || null } : row
        )));
      } else {
        const { error } = await db.from('products').update({ category_id: categoryId || null }).eq('id', item.id);
        if (error) throw error;
        setProducts((prev) => prev.map((row) => (
          String(row.id) === String(item.id) ? { ...row, category_id: categoryId || null } : row
        )));
      }
      const categoryName = categories.find((c) => String(c.id) === String(categoryId))?.name || 'None';
      logUserActivity({
        actionType: 'product_update',
        actionLabel: isCombo ? 'Set Category Changed' : 'Product Category Changed',
        details: `${isCombo ? item.combo_name : item.name} → ${categoryName}`,
        reference: String(item.id),
        entityType: isCombo ? 'combo' : 'product',
        entityId: String(item.id),
      });
      setCategoryEditItem(null);
      setCategorySearch('');
    } catch (err) {
      alert('Failed to update category: ' + (err.message || err));
    }
  };

  const filteredCategoryOptions = useMemo(() => {
    const term = (categorySearch || '').trim().toLowerCase();
    const list = (categories || []).slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    );
    if (!term) return list;
    return list.filter((cat) => String(cat.name || '').toLowerCase().includes(term));
  }, [categories, categorySearch]);

  useEffect(() => {
    if (!nameEdit || !nameInputRef.current) return;
    const el = nameInputRef.current;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // Some browsers reject selection on certain input types.
    }
  }, [nameEdit]);

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
    if (debouncedSearch.trim() !== "") {
      const searchLower = debouncedSearch.toLowerCase();
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
    debouncedSearch,
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

  const useVirtualTableRows = displayedProducts.length >= PRODUCTS_LIST_VIRTUAL_THRESHOLD;

  const [virtualListHeight, setVirtualListHeight] = useState(560);
  useEffect(() => {
    const update = () => {
      const next = Math.min(720, Math.max(360, window.innerHeight - 260));
      setVirtualListHeight(next);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const productsListHeavyModalOpen = Boolean(
    factoryStorageModalOpen || imageEditModalOpen || adjustModalOpen,
  );

  /* eslint-disable react-hooks/exhaustive-deps -- heavy modal prop bundle */
  const productsListHeavyModalProps = useMemo(() => ({
    factoryStorageModalOpen,
    factoryStorageModalProduct,
    factoryStorageModalRows,
    factoryStorageRowsLoading,
    factoryStorageModalError,
    factoryStorageForm,
    factoryStorageSubmitting,
    factoryStorageReleaseDraft,
    factoryStorageReleaseBusy,
    factoryStorageEditDraft,
    factoryStorageEditBusy,
    factoryStorageModalLabel,
    factoryStorageModalIsCombo,
    factoryStorageComboHoldSets,
    modalFactoryHoldQty,
    factoryStorageComboPreview,
    factoryStorageModalItemHeader,
    factoryStorageComboComponentMap,
    factoryStorageComboComponents,
    closeFactoryStorageModal,
    handleFactoryStorageFormChange,
    handleCreateFactoryStorageEntry,
    startFactoryStorageRelease,
    cancelFactoryStorageRelease,
    submitFactoryStorageRelease,
    startFactoryStorageEdit,
    handleFactoryStorageEditChange,
    cancelFactoryStorageEdit,
    submitFactoryStorageEdit,
    factoryModalInputStyle,
    canEditFactoryHolds,
    loadFactoryStorageRows,
    refreshFactoryStorageSummary,
    resolveFactoryStorageActor,
    imageEditModalOpen,
    imageEditProduct,
    imageEditBulkProducts,
    imageEditFile,
    imageEditLoading,
    setImageEditModalOpen,
    setImageEditProduct,
    setImageEditBulkProducts,
    setImageEditFile,
    setImageEditLoading,
    applyImageFileToItem,
    fetchAll,
    purgeExistingStorageImages,
    setToolbarNotice,
    setBulkSelectionMap,
    adjustModalOpen,
    adjustProduct,
    adjustSetMode,
    transferMode,
    selectedLocation,
    setSelectedLocation,
    adjustQty,
    setAdjustQty,
    adjustLoading,
    locations,
    setAdjustSetMode,
    setTransferMode,
    handleAdjustInventory,
    setAdjustModalOpen,
    canAdjustInventory,
    computeComboMaxQty,
    getStockForProduct,
    comboItems,
    transferFrom,
    setTransferFrom,
    transferTo,
    setTransferTo,
    transferQty,
    setTransferQty,
    transferBusy,
    setTransferBusy,
    manualTransferDate,
    setManualTransferDate,
    resolveLocationUuid,
    inventory,
    applyInventoryBulk,
    syncProductLocations,
    refreshInventoryForLocations,
  }), [
    factoryStorageModalOpen,
    factoryStorageModalProduct,
    factoryStorageModalRows,
    factoryStorageRowsLoading,
    factoryStorageModalError,
    factoryStorageForm,
    factoryStorageSubmitting,
    factoryStorageReleaseDraft,
    factoryStorageReleaseBusy,
    factoryStorageEditDraft,
    factoryStorageEditBusy,
    factoryStorageModalLabel,
    factoryStorageModalIsCombo,
    factoryStorageComboHoldSets,
    modalFactoryHoldQty,
    factoryStorageComboPreview,
    factoryStorageModalItemHeader,
    factoryStorageComboComponentMap,
    factoryStorageComboComponents,
    closeFactoryStorageModal,
    handleFactoryStorageFormChange,
    handleCreateFactoryStorageEntry,
    startFactoryStorageRelease,
    cancelFactoryStorageRelease,
    submitFactoryStorageRelease,
    startFactoryStorageEdit,
    handleFactoryStorageEditChange,
    cancelFactoryStorageEdit,
    submitFactoryStorageEdit,
    canEditFactoryHolds,
    loadFactoryStorageRows,
    refreshFactoryStorageSummary,
    resolveFactoryStorageActor,
    imageEditModalOpen,
    imageEditProduct,
    imageEditBulkProducts,
    imageEditFile,
    imageEditLoading,
    adjustModalOpen,
    adjustProduct,
    adjustSetMode,
    transferMode,
    selectedLocation,
    adjustQty,
    adjustLoading,
    locations,
    canAdjustInventory,
    computeComboMaxQty,
    getStockForProduct,
    comboItems,
    transferFrom,
    transferTo,
    transferQty,
    transferBusy,
    manualTransferDate,
    resolveLocationUuid,
    inventory,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

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

  const allBulkKeys = useMemo(() => (
    bulkSelectableItems.map(item => item.key)
  ), [bulkSelectableItems]);

  const bulkAllSelected = useMemo(() => (
    allBulkKeys.length > 0 && allBulkKeys.every(key => bulkSelectionMap[key])
  ), [allBulkKeys, bulkSelectionMap]);

  useEffect(() => {
    if (!priceLocationMenuOpen) return undefined;
    const onPointerDown = (event) => {
      const root = priceLocationMenuRef.current;
      if (root && !root.contains(event.target)) setPriceLocationMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPriceLocationMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [priceLocationMenuOpen]);

  const selectPriceLocationFilter = useCallback((locId) => {
    const value = String(locId || '').trim();
    setSelectedLocationIds(value ? [normalizeLocationId(value)] : []);
    setPriceLocationMenuOpen(false);
  }, [normalizeLocationId]);

  const openBulkDeleteConfirm = useCallback(() => {
    const targets = selectedBulkItems.map((item) => ({
      id: String(item.id),
      isCombo: !!item.isCombo,
    }));
    if (targets.length === 0) {
      alert('Select at least one row using the Bulk checkboxes.');
      return;
    }
    setDeleteTargets(targets);
    setDeleteConfirmText('');
    setDeleteConfirmOpen(true);
  }, [selectedBulkItems]);

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
        const delta = -currentQty;
        const { type: resetType, quantity: resetQty } = classifyInventoryAdjustmentDelta(delta);
        const { error: invErr } = await db
          .from('inventory')
          .update({ quantity: 0 })
          .eq('id', row.id);
        if (invErr) throw invErr;
        await db.from('inventory_adjustments').insert({
          product_id: row.product_id,
          location_id: row.location,
          quantity: resetQty,
          adjustment_type: resetType,
          adjusted_at: nowIso,
          metadata: {
            prior_quantity: currentQty,
            before_qty: currentQty,
            after_qty: 0,
            delta,
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

  const getEditablePriceRaw = useCallback((item, field, isCombo) => {
    if (field === 'price') {
      if (isCombo) return item.combo_price ?? item.standard_price ?? '';
      return item.price ?? '';
    }
    return item.promotional_price ?? '';
  }, []);

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

  const saveInlinePrice = useCallback(async (item, isCombo, field, draft) => {
    // Prevent Enter+blur (or double-blur) from saving twice. The second save
    // often had an empty draft and cleared promotional_price back to null.
    if (inlinePriceSaveLockRef.current) return false;
    inlinePriceSaveLockRef.current = true;

    if (!pricingEditLocationId) {
      alert('Choose a price location (▾ on the Price column). Use Product locations for bulk assign/unassign.');
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
  }, [pricingEditLocationId, pricingLocationLabel, products, combos, isSameLocation, getEditablePriceRaw]);

  const renderEditablePriceCell = useCallback((item, field, isCombo, rowKey, className) => {
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
            alert('Choose a price location (▾ on the Price column). Use Product locations for bulk assign/unassign.');
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
  }, [
    inlinePriceEdit,
    pricingEditLocationId,
    getEditablePriceRaw,
    saveInlinePrice,
  ]);

  const productsListRowCtx = useMemo(() => ({
    showDuplicateNamesOnly,
    bulkSelectionMap,
    setBulkSelectionMap,
    canManageCatalogPage,
    handleImageCellClick,
    nameEdit,
    nameInputRef,
    inlineNameDraftRef,
    inlineNameSaveLockRef,
    setNameEdit,
    cancelInlineName,
    saveInlineName,
    setCategoryEditItem,
    setCategorySearch,
    canAdjustInventory,
    openLocationStockCorrection,
    productsListStockMoveDisabledMessage,
    renderEditablePriceCell,
    openItemEditor,
    getStockForProductAcrossSelected,
    inventory,
    selectedLocationIds,
    isLocationSelected,
    getAssignedLocationIdsForItem,
    normalizeLocationId,
    locations,
    computeComboMaxQty,
    getStockForProduct,
    categories,
  }), [
    showDuplicateNamesOnly,
    bulkSelectionMap,
    canManageCatalogPage,
    handleImageCellClick,
    nameEdit,
    cancelInlineName,
    saveInlineName,
    canAdjustInventory,
    openLocationStockCorrection,
    openItemEditor,
    getStockForProductAcrossSelected,
    inventory,
    selectedLocationIds,
    isLocationSelected,
    getAssignedLocationIdsForItem,
    normalizeLocationId,
    locations,
    computeComboMaxQty,
    getStockForProduct,
    categories,
    renderEditablePriceCell,
  ]);

  const productsListVirtualKey = useMemo(
    () => `${displayedProducts.length}:${listSortMode}:${showDuplicateNamesOnly ? 1 : 0}:${selectedLocationIds.join(',')}`,
    [displayedProducts.length, listSortMode, showDuplicateNamesOnly, selectedLocationIds],
  );

  const renderProductsListRow = useCallback((item) => {
    const meta = buildProductsListRowMeta(item, productsListRowCtx);
    return (
      <ProductsListTableRow
        key={meta.isCombo ? `combo-${item.id}` : item.id}
        item={item}
        meta={meta}
        ctx={productsListRowCtx}
      />
    );
  }, [productsListRowCtx]);

  useEffect(() => {
    if (!inlinePriceEdit || !inlinePriceInputRef.current) return;
    // Only focus/select when starting an edit — not on every keystroke.
    // Selecting on each draft change was replacing typed digits (225 → 25).
    inlinePriceInputRef.current.focus();
    inlinePriceInputRef.current.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlinePriceEdit?.rowKey, inlinePriceEdit?.field]);

  return (
    <div className="products-list-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>All Products</h1>
      </div>
      <div className="products-list-toolbar">
        <div className="products-list-toolbar-grid">
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
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="products-toolbar-btn"
            title="Create a new product"
          >
            Create Products
          </button>
          <button
            type="button"
            onClick={() => navigate('/sets')}
            className="products-toolbar-btn"
            title="Create a new product set"
          >
            Create Sets
          </button>
          <button
            type="button"
            onClick={() => navigate('/products-list/locations')}
            className="products-toolbar-btn"
            title="Assign or remove locations for products and sets in bulk"
          >
            Product locations
          </button>
          <button
            type="button"
            onClick={() => setShowDuplicateNamesOnly((active) => !active)}
            className={`products-toolbar-btn products-toolbar-btn--duplicates${showDuplicateNamesOnly ? ' is-active' : ''}`}
            title={showDuplicateNamesOnly
              ? 'Showing duplicate names — click to show all products'
              : 'Show products with duplicate names'}
            aria-pressed={showDuplicateNamesOnly}
          >
            {showDuplicateNamesOnly
              ? `Duplicates (${duplicateNameInfo.productCount})`
              : `Duplicates${duplicateNameInfo.groupCount > 0 ? ` (${duplicateNameInfo.groupCount})` : ''}`}
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
        </div>
        {showDuplicateNamesOnly && (
          <div className="products-toolbar-message products-toolbar-message--duplicates">
            Showing {duplicateNameInfo.productCount} product{duplicateNameInfo.productCount === 1 ? '' : 's'} across {duplicateNameInfo.groupCount} duplicate name group{duplicateNameInfo.groupCount === 1 ? '' : 's'}.
            Names match when extra spaces, letter case, or word order differ.
          </div>
        )}
        {toolbarNotice && (
          <div className="products-toolbar-message">{toolbarNotice}</div>
        )}
        {selectedLocationIds.length !== 1 && (
          <div className="products-toolbar-message">
            Use the ▾ control on the Price column to pick a location for prices and promos. Use Product locations to assign or unassign outlets in bulk.
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
                      {canDelete ? (
                        <button
                          type="button"
                          className="products-list-bulk-delete-btn"
                          onClick={openBulkDeleteConfirm}
                          disabled={selectedBulkItems.length === 0}
                          title={`Delete selected (${selectedBulkItems.length})`}
                          aria-label={`Delete ${selectedBulkItems.length} selected item${selectedBulkItems.length === 1 ? '' : 's'}`}
                        >
                          ×
                        </button>
                      ) : null}
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
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '16%'}}>Name</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '8%'}}>SKU</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '12%'}}>Category</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '18%'}}>
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
                  <th
                    className="products-list-price-header-cell"
                    style={{ padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '9%' }}
                  >
                    <div className="products-list-price-header">
                      <span>Price</span>
                      <div className="products-list-price-loc-wrap" ref={priceLocationMenuRef}>
                        <button
                          type="button"
                          className={`products-list-price-loc-trigger${selectedLocationIds.length === 1 ? ' is-active' : ''}`}
                          onClick={() => setPriceLocationMenuOpen((open) => !open)}
                          aria-haspopup="listbox"
                          aria-expanded={priceLocationMenuOpen}
                          aria-label={
                            pricingLocationLabel
                              ? `Price location: ${pricingLocationLabel}`
                              : 'Price location: all locations'
                          }
                          title={
                            pricingLocationLabel
                              ? `Prices for ${pricingLocationLabel} — click to change`
                              : 'All locations — click to choose price location'
                          }
                        >
                          <span className="products-list-price-loc-caret" aria-hidden="true" />
                        </button>
                        {priceLocationMenuOpen && (
                          <div className="products-list-price-loc-menu" role="listbox" aria-label="Price location">
                            <button
                              type="button"
                              role="option"
                              className={`products-list-price-loc-option${selectedLocationIds.length === 0 ? ' is-selected' : ''}`}
                              aria-selected={selectedLocationIds.length === 0}
                              onClick={() => selectPriceLocationFilter('')}
                            >
                              All locations
                            </button>
                            {(locations || []).map((loc) => {
                              const id = normalizeLocationId(loc.id);
                              const selected = selectedLocationIds.length === 1
                                && isSameLocation(selectedLocationIds[0], id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  role="option"
                                  className={`products-list-price-loc-option${selected ? ' is-selected' : ''}`}
                                  aria-selected={selected}
                                  onClick={() => selectPriceLocationFilter(id)}
                                >
                                  {loc.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '9%'}}>Promo</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '5%'}}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {useVirtualTableRows ? (
                  <tr className="products-list-virtual-host">
                    <td colSpan={9} style={{ padding: 0, border: 'none', verticalAlign: 'top' }}>
                      <ProductsListVirtualTbody
                        items={displayedProducts}
                        rowCtx={productsListRowCtx}
                        RowComponent={ProductsListTableRow}
                        height={virtualListHeight}
                        listKey={productsListVirtualKey}
                      />
                    </td>
                  </tr>
                ) : (
                  displayedProducts.map((item) => renderProductsListRow(item))
                )}
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
                        await fetchInventory();
                      }

                      setToolbarNotice(`Deleted ${targets.length} selected item${targets.length === 1 ? '' : 's'}.`);
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

      {imageChoiceProduct && (
        <div className="products-image-modal-overlay" onClick={() => setImageChoiceProduct(null)}>
          <div className="products-image-modal products-image-modal--compact" onClick={(e) => e.stopPropagation()}>
            <h3 className="products-image-modal__title">Product Image</h3>
            <div className="products-image-modal__meta">
              {imageChoiceProduct.__isCombo ? imageChoiceProduct.combo_name : imageChoiceProduct.name}
            </div>
            <div className="products-image-modal__actions products-image-modal__actions--stack">
              <button
                type="button"
                className="products-image-modal__btn products-image-modal__btn--primary"
                onClick={() => {
                  const item = imageChoiceProduct;
                  setImageChoiceProduct(null);
                  openImageEditor(item);
                }}
              >
                Replace Image
              </button>
              <button
                type="button"
                className="products-image-modal__btn products-image-modal__btn--danger"
                disabled={imageEditLoading}
                onClick={() => handleRemoveProductImage(imageChoiceProduct)}
              >
                {imageEditLoading ? 'Removing…' : 'Remove Image'}
              </button>
              <button
                type="button"
                className="products-image-modal__btn products-image-modal__btn--secondary"
                onClick={() => setImageChoiceProduct(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryEditItem && (
        <div className="products-image-modal-overlay" onClick={() => { setCategoryEditItem(null); setCategorySearch(''); }}>
          <div className="products-category-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="products-image-modal__title">Change Category</h3>
            <div className="products-image-modal__meta">
              {categoryEditItem.isCombo ? categoryEditItem.item.combo_name : categoryEditItem.item.name}
            </div>
            <input
              type="search"
              className="products-category-modal__search"
              placeholder="Search categories…"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              autoFocus
            />
            <div className="products-category-modal__list" role="listbox" aria-label="Categories">
              <button
                type="button"
                className={`products-category-modal__option${!categoryEditItem.item.category_id ? ' is-selected' : ''}`}
                onClick={() => saveCategoryForItem(categoryEditItem.item, categoryEditItem.isCombo, null)}
              >
                — No category —
              </button>
              {filteredCategoryOptions.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`products-category-modal__option${String(categoryEditItem.item.category_id) === String(cat.id) ? ' is-selected' : ''}`}
                  onClick={() => saveCategoryForItem(categoryEditItem.item, categoryEditItem.isCombo, cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="products-image-modal__actions">
              <button
                type="button"
                className="products-image-modal__btn products-image-modal__btn--secondary"
                onClick={() => { setCategoryEditItem(null); setCategorySearch(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {stockCorrection && (
        <div className="products-adjust-modal-overlay" onClick={() => !stockCorrectionLoading && setStockCorrection(null)}>
          <div className="products-adjust-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="products-adjust-modal__title">Stock Correction</h3>
            <div className="products-adjust-modal__meta">
              Product: <b>{stockCorrection.product.name}</b> at <b>{stockCorrection.locationName}</b>
            </div>
            <div className="products-adjust-modal__hint products-adjust-modal__hint--bottom">
              Current qty: <b>{getStockForProduct(stockCorrection.product.id, stockCorrection.locationId).toLocaleString()}</b>
            </div>
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label">Action:</label>
              <select
                value={stockCorrection.mode}
                onChange={(e) => setStockCorrection((prev) => (prev ? { ...prev, mode: e.target.value } : prev))}
                className="products-adjust-modal__control"
              >
                <option value="add">Add stock (+)</option>
                <option value="deduct">Deduct stock (−)</option>
              </select>
            </div>
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label">Amount:</label>
              <input
                type="number"
                min={1}
                value={stockCorrection.qty}
                onChange={(e) => setStockCorrection((prev) => (prev ? { ...prev, qty: e.target.value } : prev))}
                className="products-adjust-modal__control products-adjust-modal__qty-input"
              />
            </div>
            <div className="products-adjust-modal__actions">
              <button
                type="button"
                onClick={handleStockCorrection}
                disabled={stockCorrectionLoading || !stockCorrection.qty}
                className="products-adjust-modal__btn products-adjust-modal__btn--primary"
              >
                {stockCorrectionLoading ? 'Saving…' : 'Apply'}
              </button>
              <button
                type="button"
                onClick={() => setStockCorrection(null)}
                disabled={stockCorrectionLoading}
                className="products-adjust-modal__btn products-adjust-modal__btn--secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {productsListHeavyModalOpen && (
        <Suspense fallback={null}>
          <ProductsListHeavyModals {...productsListHeavyModalProps} />
        </Suspense>
      )}
      {/* ======== End fixed modals ======== */}{/* ======== End fixed modals ======== */}
    </div>
  );
}

export default ProductsListPage;
