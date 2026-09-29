import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import BackToDashboard from './BackToDashboard';
import WarehouseCatalogViewToggle from './components/WarehouseCatalogViewToggle';
import WarehouseColorChip from './components/WarehouseColorChip';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import {
  deleteWarehouseAssembly,
  deleteWarehousePacket,
  fetchWarehouseCatalog,
  setWarehouseAssemblyQuantity,
  setWarehousePacketQuantity,
} from './services/warehouseCatalog';
import { completeUnitsAtLocation } from './services/warehouseTransfer';
import {
  analyzeAssemblyPacketBom,
  assemblyUsesPacketBom,
  packetBomBottleneck,
} from './utils/warehouseAssemblyMath';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';

export default function WarehouseProductsPage() {
  const navigate = useNavigate();
  const canManage = useMemo(() => canManageCatalog(getCurrentUser()), []);
  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_packet_inventory',
    'warehouse_assembly_locations',
    'warehouse_assembly_colors',
    'warehouse_assembly_inventory',
    'warehouse_assembly_packets',
    'warehouse_colors',
    'categories',
    'locations',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [packets, setPackets] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [assemblyLocations, setAssemblyLocations] = useState([]);
  const [assemblyColors, setAssemblyColors] = useState([]);
  const [assemblyInventory, setAssemblyInventory] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [variantColors, setVariantColors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog();
      setAssemblies(data.assemblies);
      setPackets(data.packets);
      setInventory(data.inventory);
      setAssemblyLocations(data.assemblyLocations);
      setAssemblyColors(data.assemblyColors);
      setAssemblyInventory(data.assemblyInventory);
      setAssemblyPacketRows(data.assemblyPackets || []);
      setVariantColors(data.colors);
      setCategories(data.categories);
      setLocations(data.locations);
      setWarehouseLocationId(data.warehouseLocationId);
      setWarehouseLocationName(data.warehouseLocationName);
      if (!data.warehouseLocationId) {
        setError('No Warehouse location found. Add a location named "Warehouse".');
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

  const locationNamesByAssembly = useMemo(() => {
    const locMap = new Map((locations || []).map((l) => [String(l.id), l.name]));
    const out = new Map();
    (assemblyLocations || []).forEach((row) => {
      const key = String(row.assembly_id);
      if (!out.has(key)) out.set(key, []);
      const name = locMap.get(String(row.location_id));
      if (name) out.get(key).push(name);
    });
    return out;
  }, [assemblyLocations, locations]);

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(assemblyPacketRows, packets),
    [assemblyPacketRows, packets],
  );

  const inventoryByPacketId = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((row) => {
      if (warehouseLocationId && String(row.location_id) !== String(warehouseLocationId)) return;
      map.set(String(row.packet_id), Number(row.quantity) || 0);
    });
    return map;
  }, [inventory, warehouseLocationId]);

  const locationName = useCallback((id) => {
    const row = (locations || []).find((l) => String(l.id) === String(id));
    return row?.name || String(id);
  }, [locations]);

  const assemblyInventoryByAssembly = useMemo(() => {
    const out = new Map();
    (assemblyInventory || []).forEach((row) => {
      const key = String(row.assembly_id);
      if (!out.has(key)) out.set(key, new Map());
      out.get(key).set(String(row.location_id), Number(row.quantity) || 0);
    });
    return out;
  }, [assemblyInventory]);

  /** Finished qty per location: direct stock or derived from packets when BOM is complete. */
  const finishedStockByAssembly = useMemo(() => {
    const out = new Map();
    (assemblies || []).forEach((assembly) => {
      const pktList = packetsByAssembly.get(String(assembly.id)) || [];
      const locIds = new Set(
        (assemblyLocations || [])
          .filter((r) => String(r.assembly_id) === String(assembly.id))
          .map((r) => r.location_id),
      );
      if (warehouseLocationId) locIds.add(warehouseLocationId);
      const perLoc = new Map();
      const invMap = assemblyInventoryByAssembly.get(String(assembly.id));
      const bom = analyzeAssemblyPacketBom(assembly.packet_count, pktList);
      const usePacketMath = assemblyUsesPacketBom(assembly) && bom.isComplete;

      locIds.forEach((locId) => {
        if (usePacketMath) {
          perLoc.set(
            String(locId),
            completeUnitsAtLocation(pktList, inventory, locId, assembly.packet_count, {
              assemblyId: assembly.id,
              assemblyPacketRows,
              catalogPackets: packets,
            }),
          );
        } else {
          perLoc.set(String(locId), invMap?.get(String(locId)) ?? 0);
        }
      });
      out.set(String(assembly.id), perLoc);
    });
    return out;
  }, [
    assemblies,
    assemblyLocations,
    assemblyInventoryByAssembly,
    inventory,
    packetsByAssembly,
    assemblyPacketRows,
    packets,
    warehouseLocationId,
  ]);

  const filteredAssemblies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assemblies;
    return (assemblies || []).filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      if (String(a.name || '').toLowerCase().includes(q)) return true;
      if (String(a.family_sku || '').toLowerCase().includes(q)) return true;
      return pktList.some(
        (p) => String(p.name || '').toLowerCase().includes(q)
          || String(p.sku || '').toLowerCase().includes(q),
      );
    });
  }, [assemblies, packetsByAssembly, search]);

  const toggleExpanded = (assemblyId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(assemblyId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  const handleAssemblyQtyBlur = async (assemblyId, locationId, rawValue) => {
    if (!canManage || !locationId) return;
    const qty = Math.max(0, Number(rawValue) || 0);
    try {
      await setWarehouseAssemblyQuantity(assemblyId, locationId, qty);
      await load();
    } catch (err) {
      setError(err?.message || 'Quantity update failed');
    }
  };

  const openTransfer = (assembly) => {
    navigate(`/warehouse-products/${assembly.id}/transfer`);
  };

  return (
    <div className="products-container warehouse-products-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Products (Warehouse)</h1>
      </div>

      <p className="stc-note" style={{ margin: '8px 0 16px', opacity: 0.85 }}>
        <strong>Finished products</strong> — expand a row to adjust packet or finished stock at {warehouseLocationName}.
        Use <strong>Finished units only</strong> when carton BOM is unknown.
      </p>

      {error ? (
        <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>
      ) : null}

      <div className="warehouse-catalog-toolbar">
        <WarehouseCatalogViewToggle />
        {canManage && (
          <div className="warehouse-catalog-toolbar__actions">
            <button
              type="button"
              className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
              onClick={() => navigate('/warehouse-products/new')}
            >
              <FaPlus aria-hidden />
              <span>Product</span>
            </button>
            <button
              type="button"
              className="warehouse-catalog-action-btn"
              onClick={() => navigate('/warehouse-products/packets/new')}
            >
              <FaPlus aria-hidden />
              <span>Packet</span>
            </button>
          </div>
        )}
      </div>
      <input
        className="products-search-bar warehouse-catalog-search"
        placeholder="Search product SKU, packet SKU, name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
              const bom = analyzeAssemblyPacketBom(assembly.packet_count, pktList);
              const stockByLoc = finishedStockByAssembly.get(String(assembly.id)) || new Map();
              const complete = stockByLoc.get(String(warehouseLocationId)) ?? 0;
              const isOpen = expanded.has(String(assembly.id));
              const locNames = locationNamesByAssembly.get(String(assembly.id)) || [];
              const totalPackets = Number(assembly.packet_count) || 0;
              const showroomLocIds = (assemblyLocations || [])
                .filter((r) => String(r.assembly_id) === String(assembly.id)
                  && String(r.location_id) !== String(warehouseLocationId))
                .map((r) => r.location_id);
              const assemblyColorsList = colorsByAssembly.get(String(assembly.id)) || [];
              const usePacketStock = assemblyUsesPacketBom(assembly) && bom.isComplete;
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
              const stockLocationIds = [
                ...showroomLocIds,
                ...(warehouseLocationId ? [warehouseLocationId] : []),
              ];
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
                    <div className="warehouse-assembly-card__main">
                      <div className="warehouse-assembly-card__title-row">
                        <span className="warehouse-kind-badge warehouse-kind-badge--product">Product</span>
                        <strong className="warehouse-assembly-card__title">{assembly.name}</strong>
                      </div>
                      <div className="warehouse-assembly-card__meta">
                        <span>SKU: <code>{assembly.family_sku}</code></span>
                        <span>
                          {assemblyUsesPacketBom(assembly)
                            ? (totalPackets
                              ? (bom.isComplete
                                ? `${bom.cartonsPerUnit}/${totalPackets} cartons per unit · BOM complete`
                                : `${bom.cartonsPerUnit}/${totalPackets} cartons (${bom.linked} packet line(s)) · BOM incomplete`)
                              : 'Set total packets on product')
                            : 'Finished stock only (no packet BOM)'}
                        </span>
                        <span>{categoryName(assembly.category_id)}</span>
                        <span>{locNames.length ? locNames.join(', ') : 'No showroom locations'}</span>
                      </div>
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
                        {complete}
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
                      {showroomLocIds.map((locId) => {
                        const q = stockByLoc.get(String(locId)) ?? 0;
                        return (
                          <div key={locId} className="warehouse-assembly-card__stock-showroom">
                            {locationName(locId)}: <strong>{q}</strong>
                          </div>
                        );
                      })}
                    </div>
                    {canManage && (
                      <div className="warehouse-assembly-card__actions">
                        {usePacketStock && showroomLocIds.length > 0 && complete > 0 && (
                          <button
                            type="button"
                            className="warehouse-card-btn"
                            onClick={() => openTransfer(assembly)}
                          >
                            Transfer
                          </button>
                        )}
                        <button
                          type="button"
                          className="warehouse-card-btn"
                          onClick={() => navigate(`/warehouse-products/${assembly.id}/edit`)}
                        >
                          Edit
                        </button>
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
                  {isOpen && !usePacketStock && (
                    <table className="warehouse-finished-stock-table">
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th style={{ textAlign: 'right' }}>Finished on hand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockLocationIds.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ padding: 12, textAlign: 'center' }}>
                              Select showroom locations on the product, then set quantities here.
                            </td>
                          </tr>
                        ) : stockLocationIds.map((locId) => {
                          const onHand = stockByLoc.get(String(locId)) ?? 0;
                          return (
                            <tr key={locId}>
                              <td>{locationName(locId)}</td>
                              <td style={{ textAlign: 'right' }}>
                                {canManage ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="warehouse-qty-input"
                                    defaultValue={onHand}
                                    key={`asm-${assembly.id}-${locId}-${onHand}`}
                                    onBlur={(e) => handleAssemblyQtyBlur(assembly.id, locId, e.target.value)}
                                    style={{ width: 72, textAlign: 'right' }}
                                  />
                                ) : (
                                  onHand
                                )}
                              </td>
                            </tr>
                          );
                        })}
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
                                  <button type="button" onClick={() => navigate(`/warehouse-products/packets/${packet.id}/edit`)}>Edit</button>
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
  );
}
