import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import BackToDashboard from './BackToDashboard';
import WarehouseAssemblyInlineName from './components/WarehouseAssemblyInlineName';
import WarehouseAssemblyInlineSku from './components/WarehouseAssemblyInlineSku';
import WarehouseAssemblyInlineSpecs from './components/WarehouseAssemblyInlineSpecs';
import WarehouseAssemblyThumbnail from './components/WarehouseAssemblyThumbnail';
import WarehouseCatalogViewToggle from './components/WarehouseCatalogViewToggle';
import WarehouseColorChip from './components/WarehouseColorChip';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import {
  deleteWarehouseAssembly,
  deleteWarehousePacket,
  fetchWarehouseCatalog,
  setWarehousePacketQuantity,
} from './services/warehouseCatalog';
import { completeUnitsAtLocation } from './services/warehouseTransfer';
import {
  analyzeAssemblyPacketBom,
  assemblyDerivesWarehouseStockFromPackets,
  assemblyUsesPacketBom,
  packetBomBottleneck,
} from './utils/warehouseAssemblyMath';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';
import { isWarehouseSetAssembly } from './utils/warehouseSetMath';
import {
  assemblyUsesFinishedBoxReceiving,
  assemblyUnitsPerCarton,
  boxCountFromFinishedUnits,
  finishedUnitsFromBoxCount,
  formatWarehouseBoxAndUnitStock,
} from './utils/warehouseUnitsPerCarton';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseCatalogSearchQuery,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from './utils/warehouseScanResolver';
import {
  isCompleteCatalogProduct,
  isIncompletePacketBomProduct,
} from './utils/warehouseCatalogProductCompleteness';
import WarehouseProductionLabelPrintDialog, {
  WarehouseLabelPrintIconButton,
} from './components/WarehouseProductionLabelPrintDialog';
import WarehouseAssemblyCategoryDialog, {
  WarehouseCategoryIconButton,
} from './components/WarehouseAssemblyCategoryDialog';
import { useAuthProfileMobileGrant } from './hooks/useAuthProfileMobileGrant';
import { isWarehouseCatalogAddProductAllowed } from './mobile/mobileAccessManifest';

export default function WarehouseProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isIncompleteView = location.pathname.startsWith('/warehouse-products/incomplete');
  const sessionUser = useMemo(() => getCurrentUser(), []);
  const canManage = useMemo(() => canManageCatalog(sessionUser), [sessionUser]);
  const { grant } = useAuthProfileMobileGrant();
  const canAddProduct = canManage || isWarehouseCatalogAddProductAllowed(grant);
  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_packet_inventory',
    'warehouse_assembly_colors',
    'warehouse_assembly_inventory',
    'warehouse_assembly_packets',
    'warehouse_colors',
    'categories',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [packets, setPackets] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [assemblyColors, setAssemblyColors] = useState([]);
  const [assemblyInventory, setAssemblyInventory] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [variantColors, setVariantColors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [, setSaving] = useState(false);
  const [labelPrintItem, setLabelPrintItem] = useState(null);
  const [categoryDialogAssembly, setCategoryDialogAssembly] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog();
      setAssemblies(data.assemblies);
      setPackets(data.packets);
      setInventory(data.inventory);
      setAssemblyColors(data.assemblyColors);
      setAssemblyInventory(data.assemblyInventory);
      setAssemblyPacketRows(data.assemblyPackets || []);
      setVariantColors(data.colors);
      setCategories(data.categories);
      setWarehouseLocationId(data.warehouseLocationId);
      setWarehouseLocationName(data.warehouseLocationName);
      if (!data.warehouseLocationId) {
        setError('Warehouse location could not be resolved for this catalog.');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load warehouse catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, rtTick]);

  const categoryName = useMemo(() => {
    const map = new Map((categories || []).map((c) => [String(c.id), c.name]));
    return (id) => map.get(String(id)) || '—';
  }, [categories]);

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(assemblyPacketRows, packets),
    [assemblyPacketRows, packets],
  );

  const warehouseCatalogProducts = useMemo(() => {
    const base = (assemblies || []).filter((a) => !isWarehouseSetAssembly(a));
    return base.filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      if (isIncompleteView) return isIncompletePacketBomProduct(a, pktList);
      return isCompleteCatalogProduct(a, pktList);
    });
  }, [assemblies, isIncompleteView, packetsByAssembly]);

  const inventoryByPacketId = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((row) => {
      if (warehouseLocationId && String(row.location_id) !== String(warehouseLocationId)) return;
      map.set(String(row.packet_id), Number(row.quantity) || 0);
    });
    return map;
  }, [inventory, warehouseLocationId]);

  const assemblyInventoryByAssembly = useMemo(() => {
    const out = new Map();
    (assemblyInventory || []).forEach((row) => {
      const key = String(row.assembly_id);
      if (!out.has(key)) out.set(key, new Map());
      out.get(key).set(String(row.location_id), Number(row.quantity) || 0);
    });
    return out;
  }, [assemblyInventory]);

  const stockForAssemblyAtLocation = useCallback((assembly, locId, stockMap) => {
    const pktList = packetsByAssembly.get(String(assembly.id)) || [];
    const invMap = assemblyInventoryByAssembly.get(String(assembly.id));
    const usePacketMath = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
    if (usePacketMath) {
      return completeUnitsAtLocation(pktList, inventory, locId, assembly.packet_count, {
        assemblyId: assembly.id,
        assemblyPacketRows,
        catalogPackets: packets,
      });
    }
    if (assemblyUsesFinishedBoxReceiving(assembly, pktList)) {
      const packet = pktList[0];
      const onHand = (inventory || []).find(
        (row) => String(row.packet_id) === String(packet.id)
          && String(row.location_id) === String(locId),
      );
      const boxes = Number(onHand?.quantity) || 0;
      return finishedUnitsFromBoxCount(boxes, assemblyUnitsPerCarton(assembly));
    }
    return invMap?.get(String(locId)) ?? 0;
  }, [
    assemblyInventoryByAssembly,
    assemblyPacketRows,
    inventory,
    packets,
    packetsByAssembly,
  ]);

  /** Finished qty at warehouse only (this page does not manage showroom stock). */
  const finishedStockByAssembly = useMemo(() => {
    const out = new Map();
    if (!warehouseLocationId) return out;
    const whKey = String(warehouseLocationId);
    warehouseCatalogProducts.forEach((assembly) => {
      const qty = stockForAssemblyAtLocation(assembly, warehouseLocationId, out);
      out.set(String(assembly.id), new Map([[whKey, qty]]));
    });
    return out;
  }, [warehouseCatalogProducts, stockForAssemblyAtLocation, warehouseLocationId]);

  const filteredAssemblies = useMemo(() => {
    const raw = search.trim();
    if (!raw) return warehouseCatalogProducts;
    const qLower = raw.toLowerCase();
    const qProductKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    const qPacketKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));

    const keysOverlap = (storedSku, queryKeys, normalizer) => {
      const storedKeys = expandWarehouseSkuMatchKeys(normalizer(storedSku));
      for (const k of queryKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    };

    return warehouseCatalogProducts.filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      const cat = categoryName(a.category_id).toLowerCase();
      if (String(a.name || '').toLowerCase().includes(qLower)) return true;
      if (cat.includes(qLower)) return true;
      if (String(a.family_sku || '').toLowerCase().includes(qLower)) return true;
      if (keysOverlap(a.family_sku, qProductKeys, normalizeWarehouseProductSku)) return true;
      return pktList.some(
        (p) => String(p.name || '').toLowerCase().includes(qLower)
          || String(p.sku || '').toLowerCase().includes(qLower)
          || keysOverlap(p.sku, qPacketKeys, normalizeWarehousePacketScan),
      );
    });
  }, [warehouseCatalogProducts, packetsByAssembly, search, categoryName]);

  const toggleExpanded = (assemblyId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(assemblyId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openLabelPrint = (name, sku, defaultCopies = 1) => {
    const labelName = String(name || '').trim();
    const labelSku = String(sku || '').trim();
    if (!labelName || !labelSku) {
      setError('Name and SKU are required to print a label.');
      return;
    }
    setLabelPrintItem({ name: labelName, sku: labelSku, defaultCopies });
  };

  const colorCatalogById = useMemo(
    () => new Map((variantColors || []).map((c) => [String(c.id), c])),
    [variantColors],
  );

  const colorsByAssembly = useMemo(() => {
    const out = new Map();
    (assemblyColors || []).forEach((row) => {
      const key = String(row.assembly_id);
      const color = colorCatalogById.get(String(row.color_id));
      if (!color) return;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(color);
    });
    out.forEach((list) => list.sort((a, b) => String(a.name).localeCompare(String(b.name))));
    return out;
  }, [assemblyColors, colorCatalogById]);

  const handleDeleteProduct = async (row) => {
    if (!canManage) return;
    if (!window.confirm(`Delete product "${row.name}"? Packets will be unlinked, not deleted.`)) return;
    setSaving(true);
    try {
      await deleteWarehouseAssembly(row.id);
      await load();
    } catch (err) {
      setError(err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePacket = async (row) => {
    if (!canManage) return;
    if (!window.confirm(`Delete packet ${row.sku}?`)) return;
    setSaving(true);
    try {
      await deleteWarehousePacket(row.id);
      await load();
    } catch (err) {
      setError(err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePacketQtyBlur = async (packet, rawValue) => {
    if (!canManage || !warehouseLocationId) return;
    const qty = Math.max(0, Number(rawValue) || 0);
    try {
      await setWarehousePacketQuantity(packet.id, warehouseLocationId, qty);
      await load();
    } catch (err) {
      setError(err?.message || 'Quantity update failed');
    }
  };

  const handleAssemblyImageUpdated = useCallback((assemblyId, imageUrl) => {
    setAssemblies((prev) => prev.map((row) => (
      String(row.id) === String(assemblyId) ? { ...row, image_url: imageUrl } : row
    )));
  }, []);

  const handleAssemblyFieldsUpdated = useCallback((assemblyId, patch) => {
    setAssemblies((prev) => prev.map((row) => (
      String(row.id) === String(assemblyId) ? { ...row, ...patch } : row
    )));
  }, []);

  return (
    <>
    <div className="products-container warehouse-products-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>
          {isIncompleteView ? 'Incomplete products (Warehouse)' : 'Warehouse'}
        </h1>
      </div>

      <p className="stc-note" style={{ margin: '8px 0 16px', opacity: 0.85 }}>
        <strong>{warehouseLocationName} stock only</strong> — enter on-hand on packets (BOM) or finished qty here.
        Showroom stock (Kitwe / Lusaka) is not managed on this page.
      </p>

      {error ? (
        <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>
      ) : null}

      <div className="warehouse-catalog-toolbar">
        <div className="warehouse-catalog-toolbar__main">
          <span className="warehouse-catalog-toolbar__label" id="wh-catalog-view-label">View</span>
          <WarehouseCatalogViewToggle aria-labelledby="wh-catalog-view-label" />
        </div>
        {(canManage || canAddProduct) && (
          <div className="warehouse-catalog-toolbar__create">
            <span className="warehouse-catalog-toolbar__label" id="wh-catalog-create-label">Create</span>
            <div className="warehouse-catalog-toolbar__actions" aria-labelledby="wh-catalog-create-label">
              {canAddProduct ? (
                <button
                  type="button"
                  className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
                  onClick={() => navigate('/warehouse-products/new')}
                >
                  <FaPlus aria-hidden />
                  <span>Product</span>
                </button>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  className="warehouse-catalog-action-btn"
                  onClick={() => navigate('/warehouse-products/packets/new')}
                >
                  <FaPlus aria-hidden />
                  <span>Packet</span>
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <input
        className="products-search-bar warehouse-catalog-search"
        placeholder="Search product SKU, packet SKU, name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (!v) return;
          const normalized = normalizeWarehouseCatalogSearchQuery(v);
          if (normalized && normalized !== v) setSearch(normalized);
        }}
      />

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {filteredAssemblies.length === 0 ? (
            <p>No products yet. Create packets on <Link to="/warehouse-products/packets">Packets (Warehouse)</Link>, then add a product and link them.</p>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredAssemblies.map((assembly) => {
              const pktList = packetsByAssembly.get(String(assembly.id)) || [];
              const stockByLoc = finishedStockByAssembly.get(String(assembly.id)) || new Map();
              const complete = stockByLoc.get(String(warehouseLocationId)) ?? 0;
              const isOpen = expanded.has(String(assembly.id));
              const totalPackets = Number(assembly.packet_count) || 0;
              const bom = analyzeAssemblyPacketBom(totalPackets, pktList);
              const assemblyColorsList = colorsByAssembly.get(String(assembly.id)) || [];
              const usePacketStock = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
              const useFinishedBoxReceiving = assemblyUsesFinishedBoxReceiving(assembly, pktList);
              const unitsPerBox = assemblyUnitsPerCarton(assembly);
              const stockDisplay = unitsPerBox > 1 && !usePacketStock
                ? formatWarehouseBoxAndUnitStock(complete, unitsPerBox).text
                : String(complete);
              const warehousePacketOnHand = usePacketStock
                ? pktList.reduce((sum, p) => sum + (inventoryByPacketId.get(String(p.id)) ?? 0), 0)
                : 0;
              const poolOpts = {
                assemblyId: assembly.id,
                assemblyPacketRows,
                catalogPackets: packets,
              };
              const warehouseBottleneck = usePacketStock
                ? packetBomBottleneck(pktList, inventoryByPacketId, poolOpts)
                : null;
              const warehouseOnHand = stockByLoc.get(String(warehouseLocationId)) ?? 0;
              const warehouseBoxEntry = unitsPerBox > 1 && warehouseLocationId;
              const warehouseDisplayQty = warehouseBoxEntry
                ? boxCountFromFinishedUnits(warehouseOnHand, unitsPerBox)
                : warehouseOnHand;
              return (
                <div key={assembly.id} className="warehouse-assembly-card">
                  <div className="warehouse-assembly-card__header">
                    <button
                      type="button"
                      className="warehouse-assembly-card__expand"
                      onClick={() => toggleExpanded(assembly.id)}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse packets' : 'Show packets'}
                    >
                      <span className="warehouse-assembly-card__expand-icon" aria-hidden />
                    </button>
                    <WarehouseAssemblyThumbnail
                      assembly={assembly}
                      canEdit={canManage}
                      onUpdated={handleAssemblyImageUpdated}
                      onError={(msg) => setError(msg)}
                    />
                    <div className="warehouse-assembly-card__main">
                      <div className="warehouse-assembly-card__title-row">
                        <span className="warehouse-kind-badge warehouse-kind-badge--product">
                          Product
                        </span>
                        <WarehouseAssemblyInlineName
                          assembly={assembly}
                          canEdit={canManage}
                          onUpdated={handleAssemblyFieldsUpdated}
                          onError={(msg) => setError(msg)}
                        />
                      </div>
                      <div className="warehouse-assembly-card__meta">
                        <WarehouseAssemblyInlineSku
                          assembly={assembly}
                          canEdit={canManage}
                          onUpdated={handleAssemblyFieldsUpdated}
                          onError={(msg) => setError(msg)}
                        />
                        <span>
                          {assemblyUsesPacketBom(assembly)
                            ? (totalPackets
                              ? (bom.isComplete
                                ? `${bom.cartonsPerUnit}/${totalPackets} cartons per unit · BOM complete`
                                : `${bom.cartonsPerUnit}/${totalPackets} cartons (${bom.linked} packet line(s)) · BOM incomplete`)
                              : 'Set total packets on product')
                            : (useFinishedBoxReceiving
                              ? `${unitsPerBox} units per box · enter stock on linked box packet`
                              : (unitsPerBox > 1
                                ? `${unitsPerBox} finished units per box · enter boxes at Warehouse below`
                                : 'Finished stock only (no packet BOM)'))}
                        </span>
                        <span>
                          Category:{' '}
                          {canManage ? (
                            <button
                              type="button"
                              className="warehouse-assembly-card__category-link"
                              onClick={() => setCategoryDialogAssembly(assembly)}
                            >
                              {categoryName(assembly.category_id)}
                            </button>
                          ) : (
                            categoryName(assembly.category_id)
                          )}
                        </span>
                      </div>
                      <WarehouseAssemblyInlineSpecs
                        assembly={assembly}
                        canEdit={canManage}
                        onUpdated={handleAssemblyFieldsUpdated}
                        onError={(msg) => setError(msg)}
                      />
                      {assembly.has_color_variants && assemblyColorsList.length > 0 ? (
                        <div className="warehouse-assembly-card__colors">
                          {assemblyColorsList.map((c) => (
                            <WarehouseColorChip key={c.id} name={c.name} className="warehouse-color-chip--compact" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="warehouse-assembly-card__stock">
                      <div className="warehouse-assembly-card__stock-label">
                        {usePacketStock
                          ? `Complete units @ ${warehouseLocationName}`
                          : `Finished @ ${warehouseLocationName}`}
                      </div>
                      <strong
                        className={`warehouse-assembly-card__stock-qty${
                          complete > 0 ? ' warehouse-assembly-card__stock-qty--positive' : ''
                        }`}
                      >
                        {stockDisplay}
                      </strong>
                      {usePacketStock && complete === 0 ? (
                        <p className="warehouse-assembly-card__stock-hint">
                          {warehousePacketOnHand === 0
                            ? 'BOM is set — expand and enter on-hand qty on each packet at warehouse.'
                            : warehouseBottleneck
                              ? `Limiting packet: ${warehouseBottleneck.packet.sku} — on hand ${warehouseBottleneck.onHand}, need ${warehouseBottleneck.need} per unit (save product after changing qty per product).`
                              : 'Not enough on one or more packets to build 1 unit.'}
                        </p>
                      ) : null}
                    </div>
                    {canManage && (
                      <div className="warehouse-assembly-card__actions">
                        <div className="warehouse-assembly-card__actions-row">
                          <WarehouseLabelPrintIconButton
                            onClick={() => openLabelPrint(assembly.name, assembly.family_sku)}
                          />
                          <WarehouseCategoryIconButton
                            onClick={() => setCategoryDialogAssembly(assembly)}
                          />
                          <button
                            type="button"
                            className="warehouse-card-btn"
                            style={{ flex: 1 }}
                            onClick={() => navigate(`/warehouse-products/${assembly.id}/edit`)}
                          >
                            Edit
                          </button>
                        </div>
                        <button
                          type="button"
                          className="warehouse-card-btn warehouse-card-btn--danger"
                          onClick={() => handleDeleteProduct(assembly)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {isOpen && useFinishedBoxReceiving && pktList.length === 1 && (
                    <div className="warehouse-finished-box-stock-panel">
                      <p className="warehouse-field-hint" style={{ padding: '8px 12px', margin: 0 }}>
                        Enter <strong>boxes</strong> on the packet line below. Finished units = boxes × {unitsPerBox}.
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ background: '#0f172a' }}>
                            <th style={{ padding: 8, textAlign: 'left' }}>Box packet</th>
                            <th style={{ padding: 8, textAlign: 'right' }}>Boxes on hand</th>
                            <th style={{ padding: 8, textAlign: 'right' }}>Finished units</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pktList.map((packet) => {
                            const boxes = inventoryByPacketId.get(String(packet.id)) ?? 0;
                            const units = finishedUnitsFromBoxCount(boxes, unitsPerBox);
                            return (
                              <tr key={packet.id}>
                                <td style={{ padding: 8 }}>
                                  <code>{packet.sku}</code> {packet.name}
                                </td>
                                <td style={{ padding: 8, textAlign: 'right' }}>
                                  {canManage ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      className="warehouse-qty-input"
                                      defaultValue={boxes}
                                      key={`box-${packet.id}-${boxes}`}
                                      onBlur={(e) => handlePacketQtyBlur(packet, e.target.value)}
                                      style={{ width: 72, textAlign: 'right' }}
                                    />
                                  ) : (
                                    boxes
                                  )}
                                </td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{units}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {isOpen && !usePacketStock && !useFinishedBoxReceiving && warehouseLocationId && (
                    <table className="warehouse-finished-stock-table">
                      <thead>
                        <tr>
                          <th>{warehouseLocationName}</th>
                          <th style={{ textAlign: 'right' }}>
                            {unitsPerBox > 1 ? 'Cartons on hand' : 'Finished on hand'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            {unitsPerBox > 1 ? (
                              <span className="warehouse-field-hint">
                                ×{unitsPerBox} units per carton
                              </span>
                            ) : (
                              warehouseLocationName
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <strong
                              className={`warehouse-assembly-card__stock-qty${
                                warehouseOnHand > 0 ? ' warehouse-assembly-card__stock-qty--positive' : ''
                              }`}
                            >
                              {warehouseBoxEntry
                                ? `${warehouseDisplayQty} boxes (${warehouseOnHand} units)`
                                : warehouseOnHand}
                            </strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  {isOpen && usePacketStock && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: '#0f172a' }}>
                          <th style={{ padding: 8, textAlign: 'left' }}>Kind</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>Pkt</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>SKU</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>On hand ({warehouseLocationName})</th>
                          {canManage && <th style={{ padding: 8 }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pktList.length === 0 ? (
                          <tr>
                            <td colSpan={canManage ? 6 : 5} style={{ padding: 12, textAlign: 'center' }}>
                              No packets linked — edit product to attach packets.
                            </td>
                          </tr>
                        ) : pktList.map((packet) => {
                          const onHand = inventoryByPacketId.get(String(packet.id)) ?? 0;
                          const isBottleneck = pktList.length > 0 && complete > 0
                            && onHand === Math.min(...pktList.map((p) => inventoryByPacketId.get(String(p.id)) ?? 0));
                          return (
                            <tr key={packet.id}>
                              <td style={{ padding: 8 }}>
                                <span className="warehouse-kind-badge warehouse-kind-badge--packet">Packet</span>
                              </td>
                              <td style={{ padding: 8 }}>
                                {totalPackets
                                ? `${String(packet.packet_number).padStart(2, '0')}/${totalPackets}`
                                : `#${packet.packet_number}`}
                              </td>
                              <td style={{ padding: 8, fontFamily: 'monospace', fontSize: '0.8rem' }}>{packet.sku}</td>
                              <td style={{ padding: 8 }}>{packet.name}</td>
                              <td style={{ padding: 8, textAlign: 'right' }}>
                                {canManage ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="warehouse-qty-input"
                                    defaultValue={onHand}
                                    key={`${packet.id}-${onHand}`}
                                    onBlur={(e) => handlePacketQtyBlur(packet, e.target.value)}
                                    style={{
                                      width: 72,
                                      textAlign: 'right',
                                      borderColor: isBottleneck ? '#fbbf24' : undefined,
                                    }}
                                  />
                                ) : (
                                  <span style={{ color: isBottleneck ? '#fbbf24' : undefined }}>{onHand}</span>
                                )}
                              </td>
                              {canManage && (
                                <td style={{ padding: 8 }}>
                                  <WarehouseLabelPrintIconButton
                                    onClick={() => openLabelPrint(packet.name, packet.sku)}
                                  />
                                  {' '}
                                  <button type="button" onClick={() => navigate(`/warehouse-products/packets/${packet.id}/edit`)}>Edit</button>
                                  {' '}
                                  <button type="button" onClick={() => handleDeletePacket(packet)}>Delete</button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

        </>
      )}

    </div>
    <WarehouseProductionLabelPrintDialog
      open={Boolean(labelPrintItem)}
      item={labelPrintItem}
      onClose={() => setLabelPrintItem(null)}
    />
    <WarehouseAssemblyCategoryDialog
      open={Boolean(categoryDialogAssembly)}
      assembly={categoryDialogAssembly}
      categories={categories}
      onClose={() => setCategoryDialogAssembly(null)}
      onCategoriesChange={setCategories}
      onUpdated={handleAssemblyFieldsUpdated}
      onError={(msg) => setError(msg)}
    />
    </>
  );
}
