import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { canManageCatalog, getCurrentUser } from './accessControl';
import db from './dataClient';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { fetchWarehouseCatalog } from './services/warehouseCatalog';
import {
  completeUnitsAtLocation,
  transferWarehouseAssemblyToCatalogProduct,
  matchCatalogProductsByAssemblySku,
} from './services/warehouseTransfer';
import {
  analyzeAssemblyPacketBom,
  assemblyUsesPacketBom,
} from './utils/warehouseAssemblyMath';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';

export default function WarehouseProductTransferPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const canManage = useMemo(() => canManageCatalog(getCurrentUser()), []);

  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_packet_inventory',
    'warehouse_assembly_locations',
    'warehouse_assembly_packets',
    'products',
    'inventory',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [assembly, setAssembly] = useState(null);
  const [packetsByAssembly, setPacketsByAssembly] = useState(new Map());
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [packets, setPackets] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [assemblyLocations, setAssemblyLocations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [catalogProducts, setCatalogProducts] = useState([]);

  const [toLocationId, setToLocationId] = useState('');
  const [units, setUnits] = useState('1');
  const [catalogProductId, setCatalogProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [transferReference, setTransferReference] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, { data: products, error: prodErr }] = await Promise.all([
        fetchWarehouseCatalog(),
        db.from('products').select('id, name, sku').order('name', { ascending: true }),
      ]);
      if (prodErr) throw new Error(prodErr.message || 'Failed to load products list');

      const row = (catalog.assemblies || []).find((a) => String(a.id) === String(productId));
      if (!row) {
        setAssembly(null);
        setError('Warehouse product not found.');
        return;
      }

      setAssembly(row);
      setPackets(catalog.packets || []);
      setInventory(catalog.inventory || []);
      setAssemblyLocations(catalog.assemblyLocations || []);
      setAssemblyPacketRows(catalog.assemblyPackets || []);
      setLocations(catalog.locations || []);
      setWarehouseLocationId(catalog.warehouseLocationId);
      setWarehouseLocationName(catalog.warehouseLocationName || 'Warehouse');
      setPacketsByAssembly(buildPacketsByAssembly(catalog.assemblyPackets, catalog.packets));
      setCatalogProducts(products || []);

      const showrooms = (catalog.assemblyLocations || []).filter(
        (r) => String(r.assembly_id) === String(row.id)
          && String(r.location_id) !== String(catalog.warehouseLocationId),
      );
      setToLocationId(showrooms[0]?.location_id || '');

      const matches = matchCatalogProductsByAssemblySku(row, products || []);
      if (matches.length === 1) {
        setCatalogProductId(String(matches[0].id));
      }
    } catch (err) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (!canManage) {
      navigate('/warehouse-products', { replace: true });
      return;
    }
    load();
  }, [canManage, load, navigate, rtTick]);

  const locationName = useCallback((id) => {
    const row = (locations || []).find((l) => String(l.id) === String(id));
    return row?.name || String(id);
  }, [locations]);

  const pktList = useMemo(
    () => packetsByAssembly.get(String(productId)) || [],
    [packetsByAssembly, productId],
  );

  const bom = useMemo(
    () => analyzeAssemblyPacketBom(assembly?.packet_count, pktList),
    [assembly, pktList],
  );

  const usePacketStock = assemblyUsesPacketBom(assembly) && bom.isComplete;

  const availableAtWarehouse = useMemo(() => {
    if (!warehouseLocationId || !usePacketStock) return 0;
    return completeUnitsAtLocation(pktList, inventory, warehouseLocationId, assembly?.packet_count, {
      assemblyId: productId,
      assemblyPacketRows,
      catalogPackets: packets,
    });
  }, [
    assembly,
    assemblyPacketRows,
    inventory,
    packets,
    pktList,
    productId,
    usePacketStock,
    warehouseLocationId,
  ]);

  const skuMatches = useMemo(
    () => matchCatalogProductsByAssemblySku(assembly, catalogProducts),
    [assembly, catalogProducts],
  );

  const productSearchResults = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = catalogProducts || [];
    if (!q) return list.slice(0, 20);
    return list
      .filter((p) => String(p.name || '').toLowerCase().includes(q)
        || String(p.sku || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [catalogProducts, productSearch]);

  const selectedCatalogProduct = useMemo(
    () => (catalogProducts || []).find((p) => String(p.id) === String(catalogProductId)),
    [catalogProducts, catalogProductId],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assembly || !warehouseLocationId || !toLocationId || !catalogProductId) return;
    if (!usePacketStock) {
      setError('Complete the packet BOM before transferring finished units.');
      return;
    }
    if (!String(deliveryNoteNumber).trim() || !String(transferReference).trim()) {
      setError('Delivery note # and reference are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await transferWarehouseAssemblyToCatalogProduct({
        assemblyId: assembly.id,
        fromLocationId: warehouseLocationId,
        toLocationId,
        units,
        catalogProductId,
        deliveryNoteNumber,
        reference: transferReference,
        user: getCurrentUser(),
      });
      navigate('/warehouse-products', { replace: true });
    } catch (err) {
      setError(err?.message || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;

  return (
    <div className="products-container warehouse-products-page" style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Transfer to Products List</h1>
      </div>

      <p className="stc-note" style={{ margin: '8px 0 16px' }}>
        Temporary bridge: deducts the BOM cartons from {warehouseLocationName} only, and adds{' '}
        <strong>finished product qty</strong> to a <Link to="/products-list">Products List</Link> item at the showroom.
        Cartons are not moved to showroom packet stock.
      </p>

      {error ? <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div> : null}

      {loading ? <p>Loading…</p> : !assembly ? null : (
        <form onSubmit={handleSubmit} className="product-form warehouse-form-panel">
          <h3 className="warehouse-form-title">
            <span className="warehouse-kind-badge warehouse-kind-badge--product">Warehouse</span>
            {assembly.name}
          </h3>
          <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
            SKU <code>{assembly.family_sku}</code>
            {' · '}
            {usePacketStock
              ? `${availableAtWarehouse} complete unit(s) at ${warehouseLocationName}`
              : 'BOM incomplete — fix packets before transferring'}
          </p>

          <div className="warehouse-field">
            <label htmlFor="wh-xfer-delivery-note">Delivery note #</label>
            <input
              id="wh-xfer-delivery-note"
              type="text"
              required
              value={deliveryNoteNumber}
              onChange={(e) => setDeliveryNoteNumber(e.target.value)}
              placeholder="e.g. DN-2026-0142"
              autoComplete="off"
            />
          </div>

          <div className="warehouse-field">
            <label htmlFor="wh-xfer-reference">Reference</label>
            <input
              id="wh-xfer-reference"
              type="text"
              required
              value={transferReference}
              onChange={(e) => setTransferReference(e.target.value)}
              placeholder="e.g. truck load / internal ref"
              autoComplete="off"
            />
          </div>

          <div className="warehouse-field">
            <label htmlFor="wh-xfer-to">To location (showroom)</label>
            <select
              id="wh-xfer-to"
              required
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
            >
              <option value="">Select location</option>
              {(assemblyLocations || [])
                .filter((r) => String(r.assembly_id) === String(assembly.id)
                  && String(r.location_id) !== String(warehouseLocationId))
                .map((r) => (
                  <option key={r.location_id} value={r.location_id}>
                    {locationName(r.location_id)}
                  </option>
                ))}
            </select>
          </div>

          <div className="warehouse-field">
            <label htmlFor="wh-xfer-units">Complete products to transfer</label>
            <input
              id="wh-xfer-units"
              type="number"
              min="1"
              max={Math.max(1, availableAtWarehouse)}
              required
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              disabled={!usePacketStock || availableAtWarehouse < 1}
            />
            <p className="warehouse-field-hint">
              Each unit deducts the linked packet cartons (qty per product × units) from {warehouseLocationName} only.
            </p>
            {usePacketStock && Number(units) > 0 ? (
              <ul className="warehouse-field-hint" style={{ marginTop: 8, paddingLeft: 18 }}>
                {pktList.map((p) => (
                  <li key={p.id}>
                    <code>{p.sku}</code>: −{(Math.max(1, Number(p.qty_per_unit) || 1) * Math.floor(Number(units) || 0))} carton(s)
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="warehouse-field warehouse-field--packet-links">
            <label htmlFor="wh-xfer-catalog-search">Receive on Products List as</label>
            {skuMatches.length > 0 ? (
              <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
                SKU match: {skuMatches.map((p) => p.name).join(', ')}
              </p>
            ) : (
              <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
                No catalog SKU matches <code>{assembly.family_sku}</code> — search and pick the correct product.
              </p>
            )}
            <input
              id="wh-xfer-catalog-search"
              type="search"
              className="warehouse-packet-pick-search"
              placeholder="Search Products List by name or SKU…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              autoComplete="off"
            />
            {selectedCatalogProduct ? (
              <p className="warehouse-field-hint">
                Selected: <strong>{selectedCatalogProduct.name}</strong> (<code>{selectedCatalogProduct.sku}</code>)
              </p>
            ) : null}
            <ul className="warehouse-packet-pick-results">
              {productSearchResults.map((p) => (
                <li key={p.id}>
                  <div className="warehouse-packet-pick-results__text">
                    <code>{p.sku}</code>
                    <span className="warehouse-packet-pick-results__name">{p.name}</span>
                  </div>
                  <button
                    type="button"
                    className={`product-form-btn product-form-btn--secondary warehouse-packet-pick-add${
                      String(catalogProductId) === String(p.id) ? ' warehouse-packet-pick-add--active' : ''
                    }`}
                    onClick={() => setCatalogProductId(String(p.id))}
                  >
                    {String(catalogProductId) === String(p.id) ? 'Selected' : 'Select'}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="warehouse-form-actions">
            <button
              type="submit"
              className="product-form-btn product-form-btn--primary"
              disabled={
                saving
                || !usePacketStock
                || availableAtWarehouse < 1
                || !catalogProductId
                || !toLocationId
                || !deliveryNoteNumber.trim()
                || !transferReference.trim()
              }
            >
              {saving ? 'Transferring…' : 'Transfer & update Products List'}
            </button>
            <button
              type="button"
              className="product-form-btn product-form-btn--secondary"
              onClick={() => navigate('/warehouse-products')}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
