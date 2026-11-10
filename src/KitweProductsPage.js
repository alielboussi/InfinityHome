import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { saveWarehouseAssembly, WAREHOUSE_INVENTORY_MODE } from './services/warehouseCatalog';
import { useWarehouseCatalogQuery } from './hooks/useWarehouseCatalogQuery';
import { KITWE_LOCATION_ID } from './constants/warehouseShowroomLocations';
import { fetchProductLocationPricesForLocation } from './services/locationPricing';
import { buildProductLocationPriceMap } from './utils/locationPricing';
import {
  ensureRetailProductForKitweAssembly,
  indexRetailProducts,
  loadRetailProductsForAssemblies,
  resolveKitweAssemblyCatalogPricing,
  resolveRetailProductForAssembly,
  saveKitweAssemblyLocationPrice,
} from './utils/kitweAssemblyRetailPricing';
import KitweCatalogBulkLabelDialog from './components/KitweCatalogBulkLabelDialog';
import { queueKitwePriceLabels } from './utils/kitwePriceLabels';
import {
  filterKitweCatalogProducts,
  kitweProductAssemblyOptions,
  listKitweWarehouseSets,
} from './utils/kitweSetStock';
import {
  createKitwePortalProduct,
  markKitwePortalSet,
  removeFromKitweProductsCatalog,
  setKitwePortalProductStock,
} from './utils/kitweProductPortal';
import { isKitwePortalCreatedSet } from './utils/kitweSetStock';
import { generateRandomWarehouseSku16 } from './utils/warehouseRandomSku';
import { normalizeWarehouseProductSku } from './utils/warehouseScanResolver';
import { recomputeWarehouseLocationStock } from './services/warehouseTransfer';
import useDebouncedValue from './hooks/useDebouncedValue';

const emptyLine = () => ({ component_assembly_id: '', quantity: 1 });

export default function KitweProductsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showCreateSet = searchParams.get('create') === '1';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [assemblyInventory, setAssemblyInventory] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [setItems, setSetItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priceMap, setPriceMap] = useState(new Map());
  const [retailIndex, setRetailIndex] = useState(() => indexRetailProducts([]));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 160);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priceDraft, setPriceDraft] = useState({});
  const [savingId, setSavingId] = useState('');
  const [labelBusyId, setLabelBusyId] = useState('');
  const [deleteBusyId, setDeleteBusyId] = useState('');

  const [setName, setSetName] = useState('');
  const [setSku, setSetSku] = useState('');
  const [setCategoryId, setSetCategoryId] = useState('');
  const [setLines, setSetLines] = useState([emptyLine()]);
  const [setSaving, setSetSaving] = useState(false);

  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [productName, setProductName] = useState('');
  const [productSku, setProductSku] = useState('');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [productKitweQty, setProductKitweQty] = useState('0');
  const [productSaving, setProductSaving] = useState(false);
  const [stockDraft, setStockDraft] = useState({});
  const [stockSavingId, setStockSavingId] = useState('');
  const [expandedSetIds, setExpandedSetIds] = useState(() => new Set());
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [bulkLabelDialogOpen, setBulkLabelDialogOpen] = useState(false);
  const [bulkLabelBusy, setBulkLabelBusy] = useState(false);
  const hasCatalogRef = useRef(false);
  const retailLoadSeqRef = useRef(0);
  const { data: catalogData, error: catalogError, isLoading: catalogLoading } = useWarehouseCatalogQuery();

  const load = useCallback(async () => {
    const background = hasCatalogRef.current;
    if (!background) setLoading(true);
    setError('');
    try {
      const data = catalogData;
      if (!data) {
        if (!catalogLoading) setLoading(false);
        return;
      }
      const inv = data.assemblyInventory || [];
      const items = data.setItems || [];
      const allAssemblies = data.assemblies || [];
      const [locPrices, catRes] = await Promise.all([
        fetchProductLocationPricesForLocation(db, KITWE_LOCATION_ID),
        db.from('categories').select('id, name').order('name'),
      ]);
      setAssemblies(allAssemblies);
      setAssemblyInventory(inv);
      setWarehouseLocationId(data.warehouseLocationId || null);
      setSetItems(items);
      setCategories(catRes?.data || []);
      setPriceMap(buildProductLocationPriceMap(locPrices || []));
      hasCatalogRef.current = true;
    } catch (err) {
      setError(err?.message || 'Failed to load Kitwe catalog');
    } finally {
      setLoading(false);
    }
  }, [catalogData, catalogLoading]);

  const kitweRetailAssemblies = useMemo(() => {
    if (!assemblies.length) return [];
    const products = filterKitweCatalogProducts(assemblies, assemblyInventory, setItems);
    const sets = listKitweWarehouseSets(assemblies, setItems, assemblyInventory);
    return [...products, ...sets];
  }, [assemblies, assemblyInventory, setItems]);

  useEffect(() => {
    if (!kitweRetailAssemblies.length) return undefined;
    const seq = retailLoadSeqRef.current + 1;
    retailLoadSeqRef.current = seq;
    let cancelled = false;
    (async () => {
      try {
        const index = await loadRetailProductsForAssemblies(kitweRetailAssemblies, []);
        if (!cancelled && retailLoadSeqRef.current === seq) {
          setRetailIndex(index);
        }
      } catch {
        /* table still shows location prices via retail_product_id */
      }
    })();
    return () => { cancelled = true; };
  }, [kitweRetailAssemblies]);

  useEffect(() => {
    if (catalogError) {
      setError(catalogError?.message || 'Failed to load Kitwe catalog');
      setLoading(false);
    }
  }, [catalogError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showCreateSet || setSku) return;
    setSetSku(generateRandomWarehouseSku16());
  }, [showCreateSet, setSku]);

  useEffect(() => {
    if (!showCreateProduct || productSku) return;
    setProductSku(generateRandomWarehouseSku16());
  }, [showCreateProduct, productSku]);

  const openEditSet = (assemblyId) => {
    const id = String(assemblyId || '').trim();
    if (!id) return;
    navigate(`/warehouse-products/${id}/edit`);
  };

  const openCreateSet = () => {
    const params = new URLSearchParams(searchParams);
    params.set('create', '1');
    params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const closeCreateSet = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('create');
    setSearchParams(params, { replace: true });
  };

  const qtyByAssembly = useMemo(() => {
    const map = new Map();
    (assemblyInventory || []).forEach((row) => {
      if (String(row.location_id) !== KITWE_LOCATION_ID) return;
      map.set(String(row.assembly_id), Number(row.quantity) || 0);
    });
    return map;
  }, [assemblyInventory]);

  const toggleSetExpanded = (assemblyId) => {
    const key = String(assemblyId);
    setExpandedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const categoriesById = useMemo(
    () => new Map((categories || []).map((c) => [String(c.id), c.name])),
    [categories],
  );

  const componentOptions = useMemo(
    () => kitweProductAssemblyOptions(assemblies, assemblyInventory, setItems),
    [assemblies, assemblyInventory, setItems],
  );

  const productRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return filterKitweCatalogProducts(assemblies, assemblyInventory, setItems)
      .filter((a) => {
        if (categoryFilter && String(a.category_id || '') !== String(categoryFilter)) return false;
        if (!q) return true;
        const cat = categoriesById.get(String(a.category_id || '')) || '';
        return String(a.name || '').toLowerCase().includes(q)
          || String(a.family_sku || '').toLowerCase().includes(q)
          || cat.toLowerCase().includes(q);
      })
      .map((a) => {
        const pricing = resolveKitweAssemblyCatalogPricing(a, retailIndex, priceMap, KITWE_LOCATION_ID);
        return {
          ...a,
          kitweQty: qtyByAssembly.get(String(a.id)) || 0,
          categoryName: categoriesById.get(String(a.category_id || '')) || '—',
          standardPrice: pricing.price,
          promoPrice: pricing.promotional_price,
        };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [assemblies, assemblyInventory, setItems, qtyByAssembly, debouncedSearch, categoryFilter, categoriesById, retailIndex, priceMap]);

  const setRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return listKitweWarehouseSets(assemblies, setItems, assemblyInventory)
      .filter((row) => {
        if (categoryFilter && String(row.category_id || '') !== String(categoryFilter)) return false;
        if (!q) return true;
        const cat = categoriesById.get(String(row.category_id || '')) || '';
        return String(row.name || '').toLowerCase().includes(q)
          || String(row.family_sku || '').toLowerCase().includes(q)
          || cat.toLowerCase().includes(q);
      })
      .map((row) => {
        const pricing = resolveKitweAssemblyCatalogPricing(row, retailIndex, priceMap, KITWE_LOCATION_ID);
        return {
          ...row,
          categoryName: categoriesById.get(String(row.category_id || '')) || '—',
          standardPrice: pricing.price,
          promoPrice: pricing.promotional_price,
        };
      });
  }, [assemblies, setItems, assemblyInventory, debouncedSearch, categoryFilter, categoriesById, retailIndex, priceMap]);

  const catalogRows = useMemo(() => {
    const products = productRows.map((row) => ({ kind: 'product', ...row }));
    const sets = setRows.map((row) => ({ kind: 'set', ...row }));
    return [...products, ...sets].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [productRows, setRows]);

  const rowBulkKey = (row) => `${row.kind}:${row.id}`;

  const allBulkKeys = useMemo(
    () => catalogRows.map((row) => rowBulkKey(row)),
    [catalogRows],
  );

  const bulkAllSelected = useMemo(
    () => allBulkKeys.length > 0 && allBulkKeys.every((key) => bulkSelected.has(key)),
    [allBulkKeys, bulkSelected],
  );

  const bulkSomeSelected = useMemo(
    () => !bulkAllSelected && allBulkKeys.some((key) => bulkSelected.has(key)),
    [allBulkKeys, bulkSelected, bulkAllSelected],
  );

  const bulkLabelDialogRows = useMemo(() => (
    catalogRows
      .filter((row) => bulkSelected.has(rowBulkKey(row)))
      .map((row) => {
        const retail = resolveRetailProductForAssembly(row, retailIndex);
        const defaultQty = row.kind === 'set'
          ? Math.max(1, Number(row.kitweBuildableQty) || 1)
          : Math.max(1, Number(row.kitweQty) || 1);
        return {
          key: rowBulkKey(row),
          kind: row.kind,
          name: row.name,
          sku: row.family_sku,
          retailProductId: retail?.id || '',
          defaultQty,
          printStandardOnly: false,
        };
      })
  ), [catalogRows, bulkSelected, retailIndex]);

  const handleBulkSelectAll = (checked) => {
    setBulkSelected(checked ? new Set(allBulkKeys) : new Set());
  };

  const handleBulkToggle = (row, checked) => {
    const key = rowBulkKey(row);
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleBulkQueueLabels = async (jobs) => {
    setBulkLabelBusy(true);
    setError('');
    try {
      const items = [];
      for (const job of jobs) {
        const catalogRow = catalogRows.find((r) => rowBulkKey(r) === String(job.key));
        let productId = String(job.retailProductId || '').trim();
        if (!productId && catalogRow) {
          const retail = await ensureRetailProductForKitweAssembly(catalogRow);
          productId = String(retail?.id || '').trim();
        }
        if (!productId) continue;
        items.push({
          productId,
          qty: job.qty,
          printStandardOnly: job.printStandardOnly,
        });
      }
      if (!items.length) throw new Error('Could not link retail products for labels.');
      queueKitwePriceLabels({ items, locationId: KITWE_LOCATION_ID });
      setBulkLabelDialogOpen(false);
      navigate('/price-labels');
    } catch (err) {
      setError(err?.message || 'Failed to open labels');
    } finally {
      setBulkLabelBusy(false);
    }
  };

  const draftKey = (assemblyId, field) => `${assemblyId}:${field}`;

  const getDraft = (row, field) => {
    const key = draftKey(row.id, field);
    if (priceDraft[key] !== undefined) return priceDraft[key];
    if (field === 'price') return row.standardPrice ?? '';
    if (field === 'promotional_price') return row.promoPrice ?? '';
    return '';
  };

  const getStockDraft = (row) => {
    const key = draftKey(row.id, 'stock');
    if (stockDraft[key] !== undefined) return stockDraft[key];
    return row.kitweQty ?? 0;
  };

  const saveStockQty = async (row) => {
    setStockSavingId(row.id);
    setError('');
    try {
      const qty = Math.max(0, Math.floor(Number(getStockDraft(row)) || 0));
      await setKitwePortalProductStock(row, qty);
      setStockDraft((d) => {
        const next = { ...d };
        delete next[draftKey(row.id, 'stock')];
        return next;
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save stock quantity');
    } finally {
      setStockSavingId('');
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setProductSaving(true);
    setError('');
    try {
      await createKitwePortalProduct({
        name: productName,
        familySku: productSku,
        categoryId: productCategoryId,
        kitweQty: productKitweQty,
        warehouseLocationId,
      });
      setProductName('');
      setProductSku(generateRandomWarehouseSku16());
      setProductCategoryId('');
      setProductKitweQty('0');
      setShowCreateProduct(false);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to create product');
    } finally {
      setProductSaving(false);
    }
  };

  const savePrices = async (row) => {
    setSavingId(row.id);
    setError('');
    try {
      await saveKitweAssemblyLocationPrice(row, {
        price: getDraft(row, 'price'),
        promotionalPrice: getDraft(row, 'promotional_price'),
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save prices');
    } finally {
      setSavingId('');
    }
  };

  const saveCategory = async (assemblyId, categoryId) => {
    setError('');
    try {
      await db.from('warehouse_assemblies').update({
        category_id: categoryId || null,
        updated_at: new Date().toISOString(),
      }).eq('id', assemblyId);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to update category');
    }
  };

  const printLabel = async (row) => {
    setLabelBusyId(row.id);
    setError('');
    try {
      const retail = await ensureRetailProductForKitweAssembly(row);
      if (!retail?.id) throw new Error('Could not link a retail product for labels.');
      queueKitwePriceLabels({ productIds: [retail.id], locationId: KITWE_LOCATION_ID });
      navigate('/price-labels');
    } catch (err) {
      setError(err?.message || 'Failed to open labels');
    } finally {
      setLabelBusyId('');
    }
  };

  const deleteRow = async (row) => {
    const isPortalSet = isKitwePortalCreatedSet(row);
    const label = String(row.name || row.family_sku || 'this item');
    const ok = window.confirm(
      isPortalSet
        ? `Delete set "${label}"? This removes the set and its Kitwe recipe.`
        : `Remove "${label}" from Kitwe products? Kitwe stock is cleared; Factory warehouse catalog is unchanged.`,
    );
    if (!ok) return;
    setDeleteBusyId(row.id);
    setError('');
    try {
      await removeFromKitweProductsCatalog(row);
      setBulkSelected((prev) => {
        const next = new Set(prev);
        next.delete(String(row.id));
        return next;
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Delete failed');
    } finally {
      setDeleteBusyId('');
    }
  };

  const handleCreateSet = async (e) => {
    e.preventDefault();
    setSetSaving(true);
    setError('');
    try {
      const trimmedName = String(setName || '').trim();
      const familySku = normalizeWarehouseProductSku(setSku);
      if (!trimmedName) throw new Error('Set name is required.');
      if (!familySku) throw new Error('SKU is required.');
      const setComponents = setLines
        .map((line) => ({
          component_assembly_id: String(line.component_assembly_id || '').trim(),
          quantity: Math.max(1, Number(line.quantity) || 1),
        }))
        .filter((line) => line.component_assembly_id);
      if (!setComponents.length) throw new Error('Add at least one Kitwe product.');

      for (const line of setComponents) {
        const opt = componentOptions.find((o) => String(o.id) === line.component_assembly_id);
        if (!opt) throw new Error('Each component must be a valid Kitwe warehouse product.');
        const stock = (assemblyInventory || []).find(
          (r) => String(r.assembly_id) === line.component_assembly_id
            && String(r.location_id) === KITWE_LOCATION_ID,
        );
        const qty = Number(stock?.quantity) || 0;
        if (qty < line.quantity) {
          throw new Error(`${opt.name} has only ${qty} at Kitwe (need ${line.quantity} per set).`);
        }
      }

      const saved = await saveWarehouseAssembly({
        name: trimmedName,
        family_sku: familySku,
        catalog_kind: 'set',
        category_id: setCategoryId || null,
        set_location_id: KITWE_LOCATION_ID,
        set_components: setComponents,
        location_ids: [KITWE_LOCATION_ID],
        inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
        create_portal: 'kitwe-products',
      });
      await markKitwePortalSet(saved.id);
      await recomputeWarehouseLocationStock(KITWE_LOCATION_ID);
      setSetName('');
      setSetSku(generateRandomWarehouseSku16());
      setSetLines([emptyLine()]);
      closeCreateSet();
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save set');
    } finally {
      setSetSaving(false);
    }
  };

  const renderCatalogRow = (row) => {
    const isSet = row.kind === 'set';
    const components = isSet ? (row.components || []) : [];
    const isOpen = isSet && expandedSetIds.has(String(row.id));
    const canExpandSet = isSet && components.length > 0;
    const bulkKey = rowBulkKey(row);

    return (
      <React.Fragment key={bulkKey}>
        <tr className={`kitwe-catalog-row${isSet ? ' kitwe-catalog-row--set' : ''}`}>
          <td className="col-bulk">
            <input
              type="checkbox"
              className="products-bulk-checkbox"
              checked={bulkSelected.has(bulkKey)}
              disabled={bulkLabelBusy}
              onChange={(e) => handleBulkToggle(row, e.target.checked)}
              aria-label={`Select ${row.name}`}
            />
          </td>
          <td className="col-sku" title={row.family_sku || ''}>{row.family_sku || '—'}</td>
          <td className="col-product">
            <div className="kitwe-product-cell">
              <div className="kitwe-product-cell__head">
                {canExpandSet ? (
                  <button
                    type="button"
                    className="kitwe-expand-btn kitwe-expand-btn--inline"
                    onClick={() => toggleSetExpanded(row.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'Hide set components' : 'Show set components'}
                  >
                    <span className="kitwe-expand-btn__icon" aria-hidden />
                  </button>
                ) : null}
                <strong className="kitwe-product-cell__name">
                  {row.name}
                  {isSet ? <span className="kitwe-product-cell__badge">Set</span> : null}
                </strong>
                {isSet ? (
                  <button
                    type="button"
                    className="kitwe-set-component-link kitwe-set-edit-btn"
                    onClick={() => openEditSet(row.id)}
                  >
                    Edit set
                  </button>
                ) : null}
              </div>
            </div>
          </td>
          <td className="col-category">
            <select
              className="kitwe-cell-select"
              value={row.category_id || ''}
              onChange={(e) => saveCategory(row.id, e.target.value)}
            >
              <option value="">—</option>
              {(categories || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </td>
          <td className="col-qty">
            {!isSet ? (
              <div className="kitwe-qty-edit">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="kitwe-cell-input kitwe-cell-input--qty"
                  value={getStockDraft(row)}
                  onChange={(e) => setStockDraft((d) => ({
                    ...d,
                    [draftKey(row.id, 'stock')]: e.target.value,
                  }))}
                />
                <button
                  type="button"
                  className="kitwe-btn-secondary kitwe-btn-compact"
                  disabled={stockSavingId === row.id}
                  onClick={() => saveStockQty(row)}
                >
                  {stockSavingId === row.id ? '…' : 'Stock'}
                </button>
              </div>
            ) : (
              <span className="kitwe-qty-readonly" title="Buildable from components at Kitwe">
                {row.kitweBuildableQty ?? 0}
              </span>
            )}
          </td>
          <td className="col-price">
            <input
              type="number"
              min={0}
              step="0.01"
              className="kitwe-cell-input"
              value={getDraft(row, 'price')}
              onChange={(e) => setPriceDraft((d) => ({ ...d, [draftKey(row.id, 'price')]: e.target.value }))}
            />
          </td>
          <td className="col-price">
            <input
              type="number"
              min={0}
              step="0.01"
              className="kitwe-cell-input"
              value={getDraft(row, 'promotional_price')}
              onChange={(e) => setPriceDraft((d) => ({ ...d, [draftKey(row.id, 'promotional_price')]: e.target.value }))}
            />
          </td>
          <td className="col-actions">
            <div className="kitwe-row-actions">
              <button
                type="button"
                className="kitwe-btn-save kitwe-btn-compact"
                disabled={savingId === row.id}
                onClick={() => savePrices(row)}
              >
                {savingId === row.id ? '…' : 'Save'}
              </button>
              <button
                type="button"
                className="kitwe-btn-secondary kitwe-btn-compact"
                disabled={labelBusyId === row.id}
                onClick={() => printLabel(row)}
              >
                {labelBusyId === row.id ? '…' : 'Label'}
              </button>
              <button
                type="button"
                className="kitwe-btn-danger kitwe-btn-compact"
                disabled={deleteBusyId === row.id}
                onClick={() => deleteRow(row)}
              >
                {deleteBusyId === row.id ? '…' : 'Delete'}
              </button>
            </div>
          </td>
        </tr>
        {canExpandSet && isOpen ? (
          <tr className="kitwe-set-detail-row">
            <td colSpan={8}>
              <div className="kitwe-set-panel">
                <div className="kitwe-set-panel__title">Products in this set</div>
                <ul className="kitwe-set-panel__list">
                  {components.map((c) => (
                    <li key={c.component_assembly_id}>
                      <span className="kitwe-set-panel__qty">{c.per_set}×</span>
                      <button
                        type="button"
                        className="kitwe-set-component-link"
                        onClick={() => openEditSet(c.component_assembly_id)}
                      >
                        {c.name}
                      </button>
                      <span className="kitwe-set-panel__stock">
                        ({c.kitwe_qty ?? 0} at Kitwe)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </td>
          </tr>
        ) : null}
      </React.Fragment>
    );
  };

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>Kitwe catalog</h1>
      <p style={{ color: 'var(--kitwe-muted, #94a3b8)', marginBottom: 16 }}>
        Listed products are Factory→Kitwe deliveries accepted by Hassan, plus any product you create here.
        Components used in a Kitwe set are hidden; sets show on this list with their products expandable below each set row.
      </p>

      <div className="kitwe-catalog-toolbar">
        <input
          className="kitwe-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, SKU, category…"
        />
        <select
          className="kitwe-category-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {(categories || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="kitwe-btn-create-set"
          onClick={() => setShowCreateProduct((v) => !v)}
        >
          {showCreateProduct ? 'Close' : 'Create product'}
        </button>
        <button type="button" className="kitwe-btn-create-set" onClick={openCreateSet}>
          Create set
        </button>
      </div>

      {bulkSelected.size > 0 ? (
        <div className="warehouse-catalog-bulk-label-bar kitwe-catalog-bulk-label-bar">
          <label className="warehouse-catalog-bulk-label-bar__select-all">
            <input
              type="checkbox"
              className="products-bulk-checkbox"
              checked={bulkAllSelected}
              ref={(el) => {
                if (el) el.indeterminate = bulkSomeSelected;
              }}
              disabled={bulkLabelBusy}
              onChange={(e) => handleBulkSelectAll(e.target.checked)}
            />
            <span>Select all ({catalogRows.length})</span>
          </label>
          <span className="warehouse-catalog-bulk-label-bar__meta">
            {bulkSelected.size} selected
          </span>
          <button
            type="button"
            className="warehouse-catalog-bulk-label-bar__print kitwe-btn-create-set"
            disabled={bulkLabelBusy}
            onClick={() => setBulkLabelDialogOpen(true)}
          >
            Bulk labels
          </button>
        </div>
      ) : null}

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      {showCreateProduct ? (
        <div className="kitwe-create-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Create product</h2>
            <button type="button" className="kitwe-btn-secondary" onClick={() => setShowCreateProduct(false)}>Close</button>
          </div>
          <form onSubmit={handleCreateProduct}>
            <div className="kitwe-create-form-row">
              <label className="kitwe-form-field kitwe-form-field--name">
                <span>Product name</span>
                <input className="kitwe-form-control" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </label>
              <label className="kitwe-form-field kitwe-form-field--sku">
                <span>SKU</span>
                <input className="kitwe-form-control" value={productSku} onChange={(e) => setProductSku(e.target.value)} />
              </label>
              <label className="kitwe-form-field kitwe-form-field--category">
                <span>Category</span>
                <select className="kitwe-form-control" value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)}>
                  <option value="">—</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="kitwe-form-field kitwe-form-field--qty">
                <span>Kitwe qty</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="kitwe-form-control"
                  value={productKitweQty}
                  onChange={(e) => setProductKitweQty(e.target.value)}
                />
              </label>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--kitwe-muted, #94a3b8)', margin: '8px 0 12px' }}>
              If this SKU already exists in Warehouse, it will not be duplicated — only Kitwe stock is set here.
            </p>
            <div className="kitwe-create-form-actions">
              <button type="submit" className="kitwe-btn-create-set" disabled={productSaving}>
                {productSaving ? 'Saving…' : 'Save product'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showCreateSet ? (
        <div className="kitwe-create-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Create set</h2>
            <button type="button" className="kitwe-btn-secondary" onClick={closeCreateSet}>Close</button>
          </div>
          <form onSubmit={handleCreateSet}>
            <div className="kitwe-create-form-row">
              <label className="kitwe-form-field kitwe-form-field--name">
                <span>Set name</span>
                <input className="kitwe-form-control" value={setName} onChange={(e) => setSetName(e.target.value)} />
              </label>
              <label className="kitwe-form-field kitwe-form-field--sku">
                <span>SKU</span>
                <input className="kitwe-form-control" value={setSku} onChange={(e) => setSetSku(e.target.value)} />
              </label>
              <label className="kitwe-form-field kitwe-form-field--category">
                <span>Category</span>
                <select className="kitwe-form-control" value={setCategoryId} onChange={(e) => setSetCategoryId(e.target.value)}>
                  <option value="">—</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Components</h3>
            {setLines.map((line, index) => (
              <div key={index} className="kitwe-component-row">
                <select
                  className="kitwe-form-control kitwe-form-control--product"
                  value={line.component_assembly_id}
                  onChange={(e) => setSetLines((prev) => prev.map((r, i) => (i === index ? { ...r, component_assembly_id: e.target.value } : r)))}
                >
                  <option value="">Select product…</option>
                  {componentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (qty {qtyByAssembly.get(String(p.id)) || 0})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  className="kitwe-form-control kitwe-form-control--qty"
                  value={line.quantity}
                  onChange={(e) => setSetLines((prev) => prev.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))}
                />
                <button type="button" className="kitwe-btn-secondary" onClick={() => setSetLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))}>Remove</button>
              </div>
            ))}
            <div className="kitwe-create-form-actions">
              <button type="button" className="kitwe-btn-secondary" onClick={() => setSetLines((prev) => [...prev, emptyLine()])}>Add component</button>
              <button type="submit" className="kitwe-btn-create-set" disabled={setSaving}>{setSaving ? 'Saving…' : 'Save set'}</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="kitwe-catalog-table-wrap">
      <table className="kitwe-catalog-table">
        <colgroup>
          <col className="kitwe-col-bulk" />
          <col className="kitwe-col-sku" />
          <col className="kitwe-col-product" />
          <col className="kitwe-col-category" />
          <col className="kitwe-col-qty" />
          <col className="kitwe-col-price" />
          <col className="kitwe-col-price" />
          <col className="kitwe-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th className="col-bulk" aria-label="Select">
              <input
                type="checkbox"
                className="products-bulk-checkbox"
                checked={bulkAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = bulkSomeSelected;
                }}
                disabled={bulkLabelBusy || catalogRows.length === 0}
                onChange={(e) => handleBulkSelectAll(e.target.checked)}
                aria-label="Select all rows"
              />
            </th>
            <th className="col-sku">SKU</th>
            <th className="col-product">Product</th>
            <th className="col-category">Category</th>
            <th className="col-qty">Qty (edit)</th>
            <th className="col-price" title="Standard price">Std price</th>
            <th className="col-price" title="Promotional price">Promo price</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {catalogRows.length ? (
            catalogRows.map((row) => renderCatalogRow(row))
          ) : (
            <tr>
              <td colSpan={8} className="kitwe-empty-hint">
                No Kitwe products or sets yet. Accept a factory delivery into Kitwe, create a product, or build a set.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <KitweCatalogBulkLabelDialog
        open={bulkLabelDialogOpen}
        rows={bulkLabelDialogRows}
        busy={bulkLabelBusy}
        onClose={() => setBulkLabelDialogOpen(false)}
        onQueue={handleBulkQueueLabels}
      />
    </div>
  );
}