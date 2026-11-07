import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import WarehouseCatalogViewToggle from './components/WarehouseCatalogViewToggle';
import WarehouseCatalogCreateActions from './components/WarehouseCatalogCreateActions';
import WarehouseCatalogFunnelFilter from './components/WarehouseCatalogFunnelFilter';
import WarehouseCatalogListPager, {
  WAREHOUSE_CATALOG_PAGE_SIZE,
  paginateList,
} from './components/WarehouseCatalogListPager';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import useDebouncedValue from './hooks/useDebouncedValue';
import {
  deleteWarehousePacket,
  fetchWarehouseCatalog,
  setWarehousePacketQuantity,
} from './services/warehouseCatalog';
import { buildPacketAssemblyAssignments } from './utils/warehouseAssemblyPacketPool';
import WarehouseProductionLabelPrintDialog, {
  WarehouseLabelPrintIconButton,
} from './components/WarehouseProductionLabelPrintDialog';

const PACKET_FILTER = {
  ALL: 'all',
  UNASSIGNED: 'unassigned',
};

export default function WarehousePacketsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const canManage = useMemo(() => canManageCatalog(getCurrentUser()), []);
  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_packet_inventory',
    'warehouse_assembly_packets',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [packets, setPackets] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [search, setSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 160);
  const assignmentFilter = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('assignment') === 'unassigned'
      ? PACKET_FILTER.UNASSIGNED
      : PACKET_FILTER.ALL;
  }, [location.search]);
  const [, setSaving] = useState(false);
  const [labelPrintItem, setLabelPrintItem] = useState(null);
  const hasCatalogRef = useRef(false);

  const applyCatalog = useCallback((data) => {
    setAssemblies(data.assemblies);
    setPackets(data.packets);
    setAssemblyPacketRows(data.assemblyPackets || []);
    setInventory(data.inventory);
    setCategories(data.categories || []);
    setWarehouseLocationId(data.warehouseLocationId);
    setWarehouseLocationName(data.warehouseLocationName);
    if (!data.warehouseLocationId) {
      setError('No Warehouse location found. Add a location named "Warehouse".');
    }
  }, []);

  const load = useCallback(async () => {
    const background = hasCatalogRef.current;
    if (!background) setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog({
        onCachedSnapshot: (snap) => {
          applyCatalog(snap);
          hasCatalogRef.current = true;
          setLoading(false);
        },
      });
      applyCatalog(data);
      hasCatalogRef.current = true;
    } catch (err) {
      setError(err?.message || 'Failed to load packets');
    } finally {
      setLoading(false);
    }
  }, [applyCatalog]);

  useEffect(() => {
    load();
  }, [load, rtTick]);

  const packetAssignmentsByPacketId = useMemo(
    () => buildPacketAssemblyAssignments(assemblyPacketRows, packets, assemblies),
    [assemblyPacketRows, packets, assemblies],
  );

  const packetIsAssigned = useCallback(
    (packetId) => (packetAssignmentsByPacketId.get(String(packetId)) || []).length > 0,
    [packetAssignmentsByPacketId],
  );

  const categoryName = useMemo(() => {
    const map = new Map((categories || []).map((c) => [String(c.id), c.name]));
    return (id) => (id ? map.get(String(id)) || '—' : '—');
  }, [categories]);

  const inventoryByPacketId = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((row) => {
      if (warehouseLocationId && String(row.location_id) !== String(warehouseLocationId)) return;
      map.set(String(row.packet_id), Number(row.quantity) || 0);
    });
    return map;
  }, [inventory, warehouseLocationId]);

  const filteredPackets = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return (packets || [])
      .filter((p) => {
        const assigned = packetIsAssigned(p.id);
        if (assignmentFilter === PACKET_FILTER.UNASSIGNED && assigned) return false;
        if (!q) return true;
        const products = packetAssignmentsByPacketId.get(String(p.id)) || [];
        const productHay = products.map((pr) => `${pr.name} ${pr.family_sku}`).join(' ').toLowerCase();
        return String(p.sku || '').toLowerCase().includes(q)
          || String(p.name || '').toLowerCase().includes(q)
          || productHay.includes(q);
      })
      .sort((a, b) => {
        const aAssigned = packetIsAssigned(a.id) ? 0 : 1;
        const bAssigned = packetIsAssigned(b.id) ? 0 : 1;
        if (aAssigned !== bAssigned) return aAssigned - bAssigned;
        return String(a.sku || '').localeCompare(String(b.sku || ''));
      });
  }, [packets, debouncedSearch, assignmentFilter, packetAssignmentsByPacketId, packetIsAssigned]);

  useEffect(() => {
    setListPage(1);
  }, [debouncedSearch, assignmentFilter, location.search]);

  const packetPagination = useMemo(
    () => paginateList(filteredPackets, listPage, WAREHOUSE_CATALOG_PAGE_SIZE),
    [filteredPackets, listPage],
  );

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

  const openLabelPrint = (packet) => {
    const name = String(packet?.name || '').trim();
    const sku = String(packet?.sku || '').trim();
    if (!name || !sku) {
      setError('Name and SKU are required to print a label.');
      return;
    }
    setLabelPrintItem({ name, sku, defaultCopies: 1 });
  };

  return (
    <>
    <div className="products-container warehouse-products-page warehouse-packets-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row warehouse-page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Packets (Warehouse)</h1>
        <div className="warehouse-page-header-row__tools">
          <label className="portal-hub-bar__select-wrap warehouse-page-header-row__view">
            <span className="portal-hub-bar__select-label">View</span>
            <WarehouseCatalogViewToggle />
          </label>
          <WarehouseCatalogCreateActions
            canManage={canManage}
            canAddProduct={canManage}
          />
        </div>
      </div>

      {error ? (
        <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>
      ) : null}

      <div className="warehouse-catalog-filter-row warehouse-catalog-filter-row--flat">
        <input
          className="warehouse-catalog-filter-control warehouse-catalog-search products-search-bar"
          placeholder="Search SKU, packet name, or product SKU / name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <WarehouseCatalogFunnelFilter />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : filteredPackets.length === 0 ? (
        <p>No packets match this filter.</p>
      ) : (
        <>
          <WarehouseCatalogListPager
            page={packetPagination.page}
            pageCount={packetPagination.pageCount}
            total={packetPagination.total}
            onPageChange={setListPage}
            itemLabel="packets"
          />
        <div className="warehouse-packets-table-wrap">
          <table className="warehouse-packets-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Pkt #</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Finished product</th>
                <th className="warehouse-packets-table__num">On hand ({warehouseLocationName})</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {packetPagination.items.map((packet) => {
                const onHand = inventoryByPacketId.get(String(packet.id)) ?? 0;
                const products = packetAssignmentsByPacketId.get(String(packet.id)) || [];
                const primaryProduct = products[0] || null;
                const totalPackets = primaryProduct ? Number(primaryProduct.packet_count) || 0 : 0;
                return (
                  <tr key={packet.id}>
                    <td>
                      {products.length ? (
                        <span className="warehouse-packets-status warehouse-packets-status--assigned">Assigned</span>
                      ) : (
                        <span className="warehouse-packets-status warehouse-packets-status--open">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {totalPackets
                        ? `${String(packet.packet_number).padStart(2, '0')}/${totalPackets}`
                        : `#${packet.packet_number}`}
                    </td>
                    <td><code>{packet.sku}</code></td>
                    <td>{packet.name}</td>
                    <td>{categoryName(packet.category_id)}</td>
                    <td>
                      {products.length ? (
                        <ul className="warehouse-packets-product-list">
                          {products.map((product) => (
                            <li key={product.id}>
                              <strong>{product.name}</strong>
                              <div className="warehouse-field-hint">
                                <code>{product.family_sku}</code>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="warehouse-field-hint">—</span>
                      )}
                    </td>
                    <td className="warehouse-packets-table__num">
                      {canManage ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="warehouse-qty-input"
                          defaultValue={onHand}
                          key={`pkt-list-${packet.id}-${onHand}`}
                          onBlur={(e) => handlePacketQtyBlur(packet, e.target.value)}
                        />
                      ) : (
                        onHand
                      )}
                    </td>
                    {canManage && (
                      <td className="warehouse-packets-table__actions">
                        <WarehouseLabelPrintIconButton
                          onClick={() => openLabelPrint(packet)}
                        />
                        <button type="button" className="warehouse-card-btn" onClick={() => navigate(`/warehouse-products/packets/${packet.id}/edit`)}>Edit</button>
                        <button
                          type="button"
                          className="warehouse-card-btn warehouse-card-btn--danger"
                          onClick={() => handleDeletePacket(packet)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          <WarehouseCatalogListPager
            page={packetPagination.page}
            pageCount={packetPagination.pageCount}
            total={packetPagination.total}
            onPageChange={setListPage}
            itemLabel="packets"
          />
        </>
      )}
    </div>
    <WarehouseProductionLabelPrintDialog
      open={Boolean(labelPrintItem)}
      item={labelPrintItem}
      onClose={() => setLabelPrintItem(null)}
    />
    </>
  );
}
