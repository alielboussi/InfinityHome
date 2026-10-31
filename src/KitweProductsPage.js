import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { fetchWarehouseCatalog, saveWarehouseAssembly, WAREHOUSE_INVENTORY_MODE } from './services/warehouseCatalog';
import { KITWE_LOCATION_ID } from './constants/warehouseShowroomLocations';
import { fetchProductLocationPricesForLocation } from './services/locationPricing';
import { buildProductLocationPriceMap, resolveProductLocationPricing } from './utils/locationPricing';
import {
  ensureRetailProductForKitweAssembly,
  indexRetailProducts,
  loadRetailProductsForAssemblies,
  resolveRetailProductForAssembly,
  saveKitweAssemblyLocationPrice,
} from './utils/kitweAssemblyRetailPricing';
import { queueKitwePriceLabels } from './utils/kitwePriceLabels';
import { isWarehouseSetAssembly } from './utils/warehouseSetMath';
import {
  filterKitweCatalogProducts,
  kitweProductAssemblyOptions,
  listKitweWarehouseSets,
} from './utils/kitweSetStock';
import {
  createKitwePortalProduct,
  setKitwePortalProductStock,
} from './utils/kitweProductPortal';
import { generateRandomWarehouseSku16 } from './utils/warehouseRandomSku';
import { normalizeWarehouseProductSku } from './utils/warehouseScanResolver';
import { recomputeWarehouseLocationStock } from './services/warehouseTransfer';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';

const emptyLine = () => ({ component_assembly_id: '', quantity: 1 });

export default function KitweProductsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'sets' ? 'sets' : 'products';
  const showCreateSet = searchParams.get('create') === '1' && view === 'sets';

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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priceDraft, setPriceDraft] = useState({});
  const [savingId, setSavingId] = useState('');
  const [labelBusyId, setLabelBusyId] = useState('');

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
  const [packets, setPackets] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [packetInventory, setPacketInventory] = useState([]);
  const [expandedAssemblyIds, setExpandedAssemblyIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, locPrices, catRes] = await Promise.all([
        fetchWarehouseCatalog(),
        fetchProductLocationPricesForLocation(db, KITWE_LOCATION_ID),
        db.from('categories').select('id, name').order('name'),
      ]);
      const allAssemblies = data.assemblies || [];
      setAssemblies(allAssemblies);
      setAssemblyInventory(data.assemblyInventory || []);
      setWarehouseLocationId(data.warehouseLocationId || null);
      setSetItems(data.setItems || []);
      setPackets(data.packets || []);
      setAssemblyPacketRows(data.assemblyPackets || []);
      setPacketInventory(data.inventory || []);
      setCategories(catRes?.data || []);
      setPriceMap(buildProductLocationPriceMap(locPrices || []));
      const deliveredProducts = filterKitweCatalogProducts(
        allAssemblies,
        data.assemblyInventory || [],
      );
      const setAsm = allAssemblies.filter((a) => isWarehouseSetAssembly(a));
      setRetailIndex(await loadRetailProductsForAssemblies([...deliveredProducts, ...setAsm], []));
    } catch (err) {
      setError(err?.message || 'Failed to load Kitwe catalog');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const setView = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'sets') params.set('view', 'sets');
    else {
      params.delete('view');
      params.delete('create');
    }
    setSearchParams(params, { replace: true });
  };

  const openCreateSet = () => {
    const params = new URLSearchParams(searchParams);
    params.set('view', 'sets');
    params.set('create', '1');
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

  const inventoryByPacketId = useMemo(() => {
    const map = new Map();
    (packetInventory || []).forEach((row) => {
      if (String(row.location_id) !== KITWE_LOCATION_ID) return;
      map.set(String(row.packet_id), Number(row.quantity) || 0);
    });
    return map;
  }, [packetInventory]);

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(assemblyPacketRows, packets),
    [assemblyPacketRows, packets],
  );

  const toggleAssemblyExpanded = (assemblyId) => {
    const key = String(assemblyId);
    setExpandedAssemblyIds((prev) => {
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
    () => kitweProductAssemblyOptions(assemblies, assemblyInventory),
    [assemblies, assemblyInventory],
  );

  const productRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filterKitweCatalogProducts(assemblies, assemblyInventory)
      .filter((a) => {
        if (categoryFilter && String(a.category_id || '') !== String(categoryFilter)) return false;
        if (!q) return true;
        const cat = categoriesById.get(String(a.category_id || '')) || '';
        return String(a.name || '').toLowerCase().includes(q)
          || String(a.family_sku || '').toLowerCase().includes(q)
          || cat.toLowerCase().includes(q);
      })
      .map((a) => {
        const retail = resolveRetailProductForAssembly(a, retailIndex);
        const pricing = retail
          ? resolveProductLocationPricing(retail, KITWE_LOCATION_ID, priceMap)
          : { price: null, promotional_price: null };
        return {
          ...a,
          kitweQty: qtyByAssembly.get(String(a.id)) || 0,
          categoryName: categoriesById.get(String(a.category_id || '')) || '—',
          standardPrice: pricing.price,
          promoPrice: pricing.promotional_price,
        };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [assemblies, assemblyInventory, qtyByAssembly, search, categoryFilter, categoriesById, retailIndex, priceMap]);

  const setRows = useMemo(() => {
    const q = search.trim().toLowerCase();
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
        const retail = resolveRetailProductForAssembly(row, retailIndex);
        const pricing = retail
          ? resolveProductLocationPricing(retail, KITWE_LOCATION_ID, priceMap)
          : { price: null, promotional_price: null };
        return {
          ...row,
          categoryName: categoriesById.get(String(row.category_id || '')) || '—',
          standardPrice: pricing.price,
          promoPrice: pricing.promotional_price,
        };
      });
  }, [assemblies, setItems, assemblyInventory, search, categoryFilter, categoriesById, retailIndex, priceMap]);

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

      await saveWarehouseAssembly({
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

  const renderPriceRow = (row, { qtyValue, productExtra = null, editableStock = false, showPacketExpand = false }) => {
    const pktList = packetsByAssembly.get(String(row.id)) || [];
    const isOpen = expandedAssemblyIds.has(String(row.id));
    const canExpand = showPacketExpand && pktList.length > 0;

    return (
      <React.Fragment key={row.id}>
        <tr className="kitwe-catalog-row">
          <td className="col-expand">
            {canExpand ? (
              <button
                type="button"
                className="kitwe-expand-btn"
                onClick={() => toggleAssemblyExpanded(row.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Hide packets' : 'Show packets'}
              >
                <span className="kitwe-expand-btn__icon" aria-hidden />
              </button>
            ) : null}
          </td>
          <td className="col-sku" title={row.family_sku || ''}>{row.family_sku || '—'}</td>
          <td className="col-product">
            <div className="kitwe-product-cell">
              <strong className="kitwe-product-cell__name">{row.name}</strong>
              {productExtra}
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
            {editableStock ? (
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
              <span className="kitwe-qty-readonly">{qtyValue ?? row.kitweQty}</span>
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
            </div>
          </td>
        </tr>
        {canExpand && isOpen ? (
          <tr className="kitwe-packet-detail-row">
            <td colSpan={8}>
              <div className="kitwe-packet-panel">
                <div className="kitwe-packet-panel__title">Packets at Kitwe</div>
                <table className="kitwe-packet-nested-table">
                  <thead>
                    <tr>
                      <th>Packet</th>
                      <th>SKU</th>
                      <th className="kitwe-packet-nested-table__qty">Qty @ Kitwe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pktList.map((packet) => (
                      <tr key={packet.id}>
                        <td>
                          {packet.name || 'Packet'}
                          {packet.packet_number != null && packet.packet_number !== ''
                            ? ` · #${packet.packet_number}`
                            : ''}
                        </td>
                        <td><code className="kitwe-packet-sku">{packet.sku || '—'}</code></td>
                        <td className="kitwe-packet-nested-table__qty">
                          {inventoryByPacketId.get(String(packet.id)) ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
        Products from Factory→Kitwe deliveries (production app send + Hassan accept) and products you create here appear in this list.
        New SKUs are mirrored in central Warehouse at 0; only Kitwe qty is set from this page until stock arrives by delivery.
        Stock edits on listed rows remain available until stocktake-only migration.
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
        <div className="kitwe-view-toggle" role="group" aria-label="Products or sets">
          <button
            type="button"
            className={view === 'products' ? 'active' : ''}
            onClick={() => setView('products')}
          >
            Products
          </button>
          <button
            type="button"
            className={view === 'sets' ? 'active' : ''}
            onClick={() => setView('sets')}
          >
            Sets
          </button>
        </div>
      </div>

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      {showCreateProduct && view === 'products' ? (
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
          <col className="kitwe-col-expand" />
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
            <th className="col-expand" aria-label="Expand" />
            <th className="col-sku">SKU</th>
            <th className="col-product">Product</th>
            <th className="col-category">Category</th>
            <th className="col-qty">Qty (edit)</th>
            <th className="col-price" title="Standard price">Std price</th>
            <th className="col-price" title="Promotional price">Promo price</th>
            <th className="col-actions">Save</th>
          </tr>
        </thead>
        <tbody>
          {view === 'products' ? (
            productRows.length ? (
              productRows.map((row) => renderPriceRow(row, {
                editableStock: true,
                showPacketExpand: true,
              }))
            ) : (
              <tr>
                <td colSpan={8} className="kitwe-empty-hint">
                  No Kitwe products yet. Create one above, or accept a factory delivery into Kitwe.
                </td>
              </tr>
            )
          ) : (
            setRows.map((row) => renderPriceRow(row, {
              qtyValue: row.kitweBuildableQty,
              productExtra: (row.components || []).length ? (
                <div className="kitwe-set-components">
                  {(row.components || []).map((c) => (
                    <div key={c.component_assembly_id}>{c.per_set}× {c.name}</div>
                  ))}
                </div>
              ) : null,
            }))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
