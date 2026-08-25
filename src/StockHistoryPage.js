import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import {
  fetchComboAdjustmentHistory,
  fetchInventoryAdjustmentHistory,
  formatAdjustmentDelta,
  formatQty,
} from './utils/inventoryAdjustmentHistory';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import { dedupeInventoryRows, sumInventoryQuantity } from './utils/inventoryApi';
import { getMaxSetQty } from './utils/setInventoryUtils';
import './global-theme.css';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function parseCatalogKey(value) {
  const raw = String(value || '');
  const sep = raw.indexOf(':');
  if (sep < 0) return { kind: 'product', id: raw };
  return { kind: raw.slice(0, sep), id: raw.slice(sep + 1) };
}

/**
 * Read-only stock history.
 * Current Stock = opening stock + inventory changes − sales (after stock period start).
 * This page never writes inventory.
 */
export default function StockHistoryPage() {
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [catalogKey, setCatalogKey] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');

  const { kind: itemKind, id: itemId } = useMemo(() => parseCatalogKey(catalogKey), [catalogKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setError('');
      try {
        const [locRes, prodRes, comboRes, comboItemsRes, invRes] = await Promise.all([
          db.from('locations').select('id, name').order('name', { ascending: true }),
          db.from('products').select('id, name, sku').order('name', { ascending: true }),
          db.from('combos').select('id, combo_name, sku').order('combo_name', { ascending: true }),
          db.from('combo_items').select('combo_id, product_id, quantity'),
          fetchInventorySnapshot(),
        ]);
        if (locRes.error) throw locRes.error;
        if (prodRes.error) throw prodRes.error;
        if (comboRes.error) throw comboRes.error;
        if (comboItemsRes.error) throw comboItemsRes.error;
        if (invRes.error) throw invRes.error;
        if (cancelled) return;
        setLocations(Array.isArray(locRes.data) ? locRes.data : []);
        setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
        setCombos(Array.isArray(comboRes.data) ? comboRes.data : []);
        setComboItems(Array.isArray(comboItemsRes.data) ? comboItemsRes.data : []);
        setInventory(dedupeInventoryRows(Array.isArray(invRes.data) ? invRes.data : []));
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load catalog.');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const comboItemsByCombo = useMemo(() => {
    const map = new Map();
    (comboItems || []).forEach((row) => {
      const key = String(row.combo_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [comboItems]);

  const getLiveLocationQty = useCallback((pid, locId) => {
    if (!pid || !locId) return 0;
    return sumInventoryQuantity(inventory, pid, locId);
  }, [inventory]);

  const getLiveSetQty = useCallback((comboId, locId) => {
    const items = comboItemsByCombo.get(String(comboId)) || [];
    if (!items.length || !locId) return 0;
    const stock = {};
    items.forEach((item) => {
      stock[String(item.product_id)] = getLiveLocationQty(item.product_id, locId);
    });
    return getMaxSetQty(items, stock);
  }, [comboItemsByCombo, getLiveLocationQty]);

  const filteredProducts = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    const list = products || [];
    if (!term) return list.slice(0, 80);
    return list
      .filter((p) =>
        (p.name && p.name.toLowerCase().includes(term))
        || (p.sku && String(p.sku).toLowerCase().includes(term))
      )
      .slice(0, 80);
  }, [products, search]);

  const filteredCombos = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    const list = combos || [];
    if (!term) return list.slice(0, 80);
    return list
      .filter((c) =>
        (c.combo_name && c.combo_name.toLowerCase().includes(term))
        || (c.sku && String(c.sku).toLowerCase().includes(term))
      )
      .slice(0, 80);
  }, [combos, search]);

  const selectedProduct = useMemo(() => {
    if (itemKind !== 'product') return null;
    return (products || []).find((p) => String(p.id) === String(itemId)) || null;
  }, [products, itemKind, itemId]);

  const selectedCombo = useMemo(() => {
    if (itemKind !== 'combo') return null;
    return (combos || []).find((c) => String(c.id) === String(itemId)) || null;
  }, [combos, itemKind, itemId]);

  const selectedLocation = useMemo(
    () => (locations || []).find((l) => String(l.id) === String(locationId)) || null,
    [locations, locationId],
  );

  const liveCurrentQty = useMemo(() => {
    if (!itemId || !locationId) return 0;
    if (itemKind === 'combo') return getLiveSetQty(itemId, locationId);
    return getLiveLocationQty(itemId, locationId);
  }, [itemKind, itemId, locationId, getLiveLocationQty, getLiveSetQty]);

  const loadHistory = useCallback(async () => {
    if (!itemId || !locationId) {
      setRows([]);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const currentQty = itemKind === 'combo'
        ? getLiveSetQty(itemId, locationId)
        : getLiveLocationQty(itemId, locationId);

      const result = itemKind === 'combo'
        ? await fetchComboAdjustmentHistory(db, {
          comboId: itemId,
          locationId,
          comboItems: comboItemsByCombo.get(String(itemId)) || [],
          currentQty,
          limit: 200,
        })
        : await fetchInventoryAdjustmentHistory(db, {
          productId: itemId,
          locationId,
          currentQty,
          limit: 200,
        });

      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setSummary({
        openingStock: result?.openingStock ?? 0,
        totalIn: result?.totalIn ?? 0,
        totalOut: result?.totalOut ?? 0,
        totalSales: result?.totalSales ?? 0,
        calculatedCurrent: result?.calculatedCurrent ?? 0,
        currentStock: currentQty,
        hasGap: Boolean(result?.hasGap),
      });
    } catch (err) {
      setError(err?.message || 'Failed to load stock history.');
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [
    itemId,
    itemKind,
    locationId,
    getLiveLocationQty,
    getLiveSetQty,
    comboItemsByCombo,
  ]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectedLabel = selectedCombo
    ? `${selectedCombo.combo_name} (Set)${selectedCombo.sku ? ` (${selectedCombo.sku})` : ''}`
    : selectedProduct
      ? `${selectedProduct.name}${selectedProduct.sku ? ` (${selectedProduct.sku})` : ''}`
      : '';

  return (
    <div className="stock-periods-page" style={{ padding: 16 }}>
      <BackToDashboard />
      <div className="stock-periods-card" style={{ marginTop: 12 }}>
        <div className="stock-periods-section-title">Stock History</div>
        <div className="stock-periods-note">
          Read-only. Products use live Locations qty. Sets use buildable set count from component stock (same as Products list / POS).
        </div>

        {bootLoading ? (
          <div className="stock-periods-note">Loading…</div>
        ) : (
          <>
            <div className="stock-periods-filters">
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
                Search product or set
                <input
                  className="pos-control"
                  type="text"
                  placeholder="Name or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>

              <label className="stock-periods-label">
                Product / Set
                <select
                  className="pos-control"
                  value={catalogKey}
                  onChange={(e) => setCatalogKey(e.target.value)}
                  disabled={!locationId}
                >
                  <option value="">Select product or set…</option>
                  {filteredProducts.length > 0 ? (
                    <optgroup label="Products">
                      {filteredProducts.map((p) => (
                        <option key={`product-${p.id}`} value={`product:${p.id}`}>
                          {p.name}{p.sku ? ` (${p.sku})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {filteredCombos.length > 0 ? (
                    <optgroup label="Sets">
                      {filteredCombos.map((c) => (
                        <option key={`combo-${c.id}`} value={`combo:${c.id}`}>
                          {c.combo_name}{c.sku ? ` (${c.sku})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
            </div>

            {selectedLabel && selectedLocation && (
              <div className="products-adjust-history-modal__current" style={{ marginTop: 16 }}>
                {selectedLabel} • {selectedLocation.name}
                {' · '}
                {itemKind === 'combo' ? 'Live set qty' : 'Live Locations qty'}: <b>{liveCurrentQty.toLocaleString()}</b>
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
                Sales: <b>{Number(summary.totalSales || 0).toLocaleString()}</b>
                {' · '}
                Current: <b>{Number(summary.currentStock || 0).toLocaleString()}</b>
                {' '}
                <span style={{ color: '#9aa4b2', fontSize: 12 }}>
                  ({itemKind === 'combo' ? 'live set count' : 'live inventory'})
                </span>
                {summary.hasGap ? (
                  <div style={{ color: '#f59e0b', fontSize: 12, marginTop: 6 }}>
                    History running total ({Number(summary.calculatedCurrent || 0).toLocaleString()}) differs from live qty
                    {itemKind === 'combo'
                      ? ' — component stock may have changed without audit rows, or another set using the same parts was sold/assembled.'
                      : ' — check for duplicate inventory rows or missing audit entries.'}
                  </div>
                ) : null}
              </div>
            )}

            {loading ? (
              <div className="stock-periods-note" style={{ marginTop: 12 }}>Loading history…</div>
            ) : !itemId || !locationId ? (
              <div className="stock-periods-note" style={{ marginTop: 12 }}>
                Choose a location and product or set to view history.
              </div>
            ) : (
              <table className="products-adjust-history-table stock-history-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Qty</th>
                    <th>Stock</th>
                    <th>Type</th>
                    <th>Customer / Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 16 }}>No history rows.</td>
                    </tr>
                  ) : rows.map((row) => {
                    const isLocked = Boolean(row.locked);
                    const isOpening = row.type === 'Opening Stock';
                    const isCurrent = row.type === 'Current Stock';
                    const delta = row.delta == null ? null : Number(row.delta || 0);
                    const deltaClass = isLocked
                      ? 'products-adjust-history-delta--locked'
                      : delta > 0
                        ? 'products-adjust-history-delta--plus'
                        : delta < 0
                          ? 'products-adjust-history-delta--minus'
                          : 'products-adjust-history-delta--zero';
                    const qtyLabel = isCurrent
                      ? '—'
                      : isOpening
                        ? formatQty(row.runningQty)
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
                        <td>{row.detail || (isLocked ? '—' : '')}</td>
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
