import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import {
  fetchInventoryAdjustmentHistory,
  formatAdjustmentDelta,
  formatQty,
} from './utils/inventoryAdjustmentHistory';
import { fetchComputedInventorySnapshot } from './services/inventorySnapshot';
import { dedupeInventoryRows, sumInventoryQuantity } from './utils/inventoryApi';
import './global-theme.css';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

/**
 * Read-only stock history.
 * Current Stock = opening stock + inventory changes − sales (after stock period start).
 * This page never writes inventory.
 */
export default function StockHistoryPage() {
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setError('');
      try {
        const [locRes, prodRes, invRes] = await Promise.all([
          db.from('locations').select('id, name').order('name', { ascending: true }),
          db.from('products').select('id, name, sku').order('name', { ascending: true }),
          fetchComputedInventorySnapshot(),
        ]);
        if (locRes.error) throw locRes.error;
        if (prodRes.error) throw prodRes.error;
        if (invRes.error) throw invRes.error;
        if (cancelled) return;
        setLocations(Array.isArray(locRes.data) ? locRes.data : []);
        setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
        setInventory(dedupeInventoryRows(Array.isArray(invRes.data) ? invRes.data : []));
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load catalog.');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const getLiveLocationQty = useCallback((pid, locId) => {
    if (!pid || !locId) return 0;
    return sumInventoryQuantity(inventory, pid, locId);
  }, [inventory]);

  const filteredProducts = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    if (!term) return products.slice(0, 80);
    return (products || [])
      .filter((p) =>
        (p.name && p.name.toLowerCase().includes(term))
        || (p.sku && String(p.sku).toLowerCase().includes(term))
      )
      .slice(0, 80);
  }, [products, search]);

  const selectedProduct = useMemo(
    () => (products || []).find((p) => String(p.id) === String(productId)) || null,
    [products, productId],
  );

  const selectedLocation = useMemo(
    () => (locations || []).find((l) => String(l.id) === String(locationId)) || null,
    [locations, locationId],
  );

  const liveCurrentQty = useMemo(
    () => getLiveLocationQty(productId, locationId),
    [getLiveLocationQty, productId, locationId],
  );

  const loadHistory = useCallback(async () => {
    if (!productId || !locationId) {
      setRows([]);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Always pass live Locations-column qty. History is read-only.
      const currentQty = getLiveLocationQty(productId, locationId);
      const result = await fetchInventoryAdjustmentHistory(db, {
        productId,
        locationId,
        currentQty,
        limit: 200,
      });
      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setSummary({
        openingStock: result?.openingStock ?? 0,
        totalIn: result?.totalIn ?? 0,
        totalOut: result?.totalOut ?? 0,
        currentStock: currentQty,
      });
    } catch (err) {
      setError(err?.message || 'Failed to load stock history.');
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [productId, locationId, getLiveLocationQty]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="stock-periods-page" style={{ padding: 16 }}>
      <BackToDashboard />
      <div className="stock-periods-card" style={{ marginTop: 12 }}>
        <div className="stock-periods-section-title">Stock History</div>
        <div className="stock-periods-note">
          Read-only. Current Stock always matches the live Locations qty from Products (never recalculated from history).
        </div>

        {bootLoading ? (
          <div className="stock-periods-note">Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12 }}>
              <label className="stock-periods-label">
                Location
                <select
                  className="pos-control"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">Select location…</option>
                  {(locations || []).map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </label>

              <label className="stock-periods-label">
                Search product
                <input
                  className="pos-control"
                  type="text"
                  placeholder="Name or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>

              <label className="stock-periods-label">
                Product
                <select
                  className="pos-control"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  disabled={!locationId}
                >
                  <option value="">Select product…</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.sku ? ` (${p.sku})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedProduct && selectedLocation && (
              <div className="products-adjust-history-modal__current" style={{ marginTop: 16 }}>
                {selectedProduct.name} • {selectedLocation.name}
                {' · '}
                Live Locations qty: <b>{liveCurrentQty.toLocaleString()}</b>
              </div>
            )}

            {error && <div className="stock-periods-error" style={{ marginTop: 12 }}>{error}</div>}

            {summary && (
              <div className="products-adjust-history-modal__current" style={{ marginTop: 12 }}>
                Opening: <b>{Number(summary.openingStock || 0).toLocaleString()}</b>
                {' · '}
                In: <b>{Number(summary.totalIn || 0).toLocaleString()}</b>
                {' · '}
                Out: <b>{Number(summary.totalOut || 0).toLocaleString()}</b>
                {' · '}
                Current: <b>{Number(summary.currentStock || 0).toLocaleString()}</b>
                {' '}
                <span style={{ color: '#9aa4b2', fontSize: 12 }}>(from Locations column)</span>
              </div>
            )}

            {loading ? (
              <div className="stock-periods-note" style={{ marginTop: 12 }}>Loading history…</div>
            ) : !productId || !locationId ? (
              <div className="stock-periods-note" style={{ marginTop: 12 }}>
                Choose a location and product to view history.
              </div>
            ) : (
              <table className="products-adjust-history-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Qty</th>
                    <th>Stock</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>No history rows.</td>
                    </tr>
                  ) : rows.map((row) => {
                    const isLocked = Boolean(row.locked);
                    const isOpening = row.type === 'Opening Stock';
                    const isCurrent = row.type === 'Current Stock';
                    const delta = Number(row.delta || 0);
                    const deltaClass = isLocked
                      ? 'products-adjust-history-delta--locked'
                      : delta > 0
                        ? 'products-adjust-history-delta--plus'
                        : delta < 0
                          ? 'products-adjust-history-delta--minus'
                          : 'products-adjust-history-delta--zero';
                    const qtyLabel = isLocked
                      ? formatQty(isCurrent ? row.runningQty : delta)
                      : formatAdjustmentDelta(delta);
                    return (
                      <tr
                        key={row.id || `${row.adjustedAt}-${row.type}`}
                        className={isLocked ? 'products-adjust-history-row--locked' : undefined}
                      >
                        <td>
                          {isCurrent ? '—' : (row.adjustedAt ? formatDateTime(row.adjustedAt) : (isOpening ? '—' : ''))}
                        </td>
                        <td className={deltaClass}>{qtyLabel}</td>
                        <td>{formatQty(isCurrent ? summary?.currentStock : row.runningQty)}</td>
                        <td>{row.type}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
