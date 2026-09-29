import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import BackToDashboard from './BackToDashboard';
import WarehouseCatalogViewToggle from './components/WarehouseCatalogViewToggle';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import {
  deleteWarehousePacket,
  fetchWarehouseCatalog,
  setWarehousePacketQuantity,
} from './services/warehouseCatalog';
import { buildPacketAssemblyAssignments } from './utils/warehouseAssemblyPacketPool';

const PACKET_FILTER = {
  ALL: 'all',
  ASSIGNED: 'assigned',
  UNASSIGNED: 'unassigned',
};

export default function WarehousePacketsPage() {
  const navigate = useNavigate();
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
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [search, setSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState(PACKET_FILTER.ALL);
  const [, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog();
      setAssemblies(data.assemblies);
      setPackets(data.packets);
      setAssemblyPacketRows(data.assemblyPackets || []);
      setInventory(data.inventory);
      setWarehouseLocationId(data.warehouseLocationId);
      setWarehouseLocationName(data.warehouseLocationName);
      if (!data.warehouseLocationId) {
        setError('No Warehouse location found. Add a location named "Warehouse".');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load packets');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const inventoryByPacketId = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((row) => {
      if (warehouseLocationId && String(row.location_id) !== String(warehouseLocationId)) return;
      map.set(String(row.packet_id), Number(row.quantity) || 0);
    });
    return map;
  }, [inventory, warehouseLocationId]);

  const filteredPackets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (packets || [])
      .filter((p) => {
        const assigned = packetIsAssigned(p.id);
        if (assignmentFilter === PACKET_FILTER.ASSIGNED && !assigned) return false;
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
  }, [packets, search, assignmentFilter, packetAssignmentsByPacketId, packetIsAssigned]);

  const counts = useMemo(() => {
    const all = packets || [];
    const assigned = all.filter((p) => packetIsAssigned(p.id)).length;
    return { all: all.length, assigned, unassigned: all.length - assigned };
  }, [packets, packetIsAssigned]);

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

  return (
    <div className="products-container warehouse-products-page warehouse-packets-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Packets (Warehouse)</h1>
      </div>

      <p className="stc-note" style={{ margin: '8px 0 16px', opacity: 0.85 }}>
        Warehouse cartons — assigned or unassigned. On-hand qty is per packet at {warehouseLocationName}.
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
      <div className="warehouse-packets-filter-row">
        <div className="warehouse-packets-filter" role="tablist" aria-label="Packet assignment filter">
          <button
            type="button"
            role="tab"
            aria-selected={assignmentFilter === PACKET_FILTER.ALL}
            className={`warehouse-packets-filter-btn${assignmentFilter === PACKET_FILTER.ALL ? ' is-active' : ''}`}
            onClick={() => setAssignmentFilter(PACKET_FILTER.ALL)}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={assignmentFilter === PACKET_FILTER.ASSIGNED}
            className={`warehouse-packets-filter-btn${assignmentFilter === PACKET_FILTER.ASSIGNED ? ' is-active' : ''}`}
            onClick={() => setAssignmentFilter(PACKET_FILTER.ASSIGNED)}
          >
            Assigned ({counts.assigned})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={assignmentFilter === PACKET_FILTER.UNASSIGNED}
            className={`warehouse-packets-filter-btn${assignmentFilter === PACKET_FILTER.UNASSIGNED ? ' is-active' : ''}`}
            onClick={() => setAssignmentFilter(PACKET_FILTER.UNASSIGNED)}
          >
            Unassigned ({counts.unassigned})
          </button>
        </div>
      </div>
      <input
        className="products-search-bar warehouse-catalog-search"
        placeholder="Search SKU, packet name, or product SKU / name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p>Loading…</p>
      ) : filteredPackets.length === 0 ? (
        <p>No packets match this filter.</p>
      ) : (
        <div className="warehouse-packets-table-wrap">
          <table className="warehouse-packets-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Pkt #</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Finished product</th>
                <th className="warehouse-packets-table__num">On hand ({warehouseLocationName})</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredPackets.map((packet) => {
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
      )}
    </div>
  );
}
