import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createShowroomQuoteAndSend } from '../services/showroomQuoteApi';
import { floor2StockAsFlatGroups } from '../utils/warehouseFloor2StockGroups';
import { inferShowroomWorkshopRoute } from '../utils/quoteShowroomOrder';
import { fetchCarpentryCatalog, fetchCarpentryFloorRuns, getCachedCarpentryCatalog, getCachedCarpentryFloorRuns } from '../services/carpentryCatalogApi';
import { readWarehouseFloor2WipImageUrl } from '../utils/warehouseFloor2WipImage';
import WarehouseFloor2WipThumbnail from './WarehouseFloor2WipThumbnail';

export default function HassanShowroomOrderForm({ onDonePath = '/orders' }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [floor2Stock, setFloor2Stock] = useState([]);
  const [assemblyById, setAssemblyById] = useState(new Map());
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, runs] = await Promise.all([
        fetchCarpentryCatalog({ forceFresh: true }),
        fetchCarpentryFloorRuns({ forceFresh: true }),
      ]);
      const map = new Map();
      (catalog?.candidates || []).forEach((a) => { if (a?.id) map.set(String(a.id), a); });
      (runs?.floor2Stock || []).forEach((row) => {
        const aid = String(row.assembly_id || '');
        if (aid && !map.has(aid)) map.set(aid, { id: aid, name: row.assembly_name || aid });
      });
      setAssemblyById(map);
      setFloor2Stock(runs?.floor2Stock || []);
    } catch (e) {
      setError(e?.message || 'Failed to load Floor 2 products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cachedRuns = getCachedCarpentryFloorRuns();
    const cachedCat = getCachedCarpentryCatalog();
    if (cachedRuns?.floor2Stock?.length) {
      setFloor2Stock(cachedRuns.floor2Stock);
      const map = new Map();
      (cachedCat?.candidates || []).forEach((a) => { if (a?.id) map.set(String(a.id), a); });
      setAssemblyById(map);
      setLoading(false);
    }
    void load();
  }, [load]);

  const groups = useMemo(
    () => floor2StockAsFlatGroups(floor2Stock, assemblyById),
    [floor2Stock, assemblyById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return groups.filter((g) => {
      const asm = assemblyById.get(String(g.assemblyIds?.[0] || ''));
      const sku = String(asm?.family_sku || '').toLowerCase();
      const name = String(g.familyBase || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [groups, search, assemblyById]);

  const addLine = (group) => {
    const aid = String(group.assemblyIds?.[0] || '').trim();
    if (!aid) return;
    const stockQty = Math.max(0, Number(group.totalQty) || 0);
    const asm = assemblyById.get(aid);
    setCart((prev) => {
      const existing = prev.find((l) => l.assembly_id === aid);
      if (existing) return prev;
      return [...prev, {
        assembly_id: aid,
        name: group.familyBase,
        route: inferShowroomWorkshopRoute(asm),
        stockQty,
        quantity: 1,
        image_url: readWarehouseFloor2WipImageUrl(asm) || asm?.image_url || '',
      }];
    });
  };

  const updateQty = (aid, qty) => {
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    setCart((prev) => prev.map((l) => (
      l.assembly_id === aid ? { ...l, quantity: n } : l
    )));
  };

  const removeLine = (aid) => setCart((prev) => prev.filter((l) => l.assembly_id !== aid));

  const handleCreate = async () => {
    if (!cart.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await createShowroomQuoteAndSend(
        cart.map((l) => ({
          assembly_id: l.assembly_id,
          quantity: l.quantity,
          route: l.route,
        })),
      );
      const dept = payload.route === 'carpentry' ? 'Carpentry' : 'Upholstery';
      alert(`Showroom order ${payload.quote_number || ''} created and sent to ${dept}.`);
      navigate(onDonePath);
    } catch (e) {
      setError(e?.message || 'Failed to create showroom order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hassan-showroom-order-form">
      <p className="quotes-muted-text" style={{ marginTop: 0 }}>
        Search Floor 2 WIP by name or SKU. Lines can be added at stock 0 — manufacture to Floor 2 before the workshop starts the order.
      </p>
      {error ? <div className="report-error" style={{ marginBottom: 12 }}>{error}</div> : null}

      <input
        className="quotes-input kitwe-search-input"
        style={{ width: '100%', maxWidth: 480, marginBottom: 12 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search Floor 2 product or SKU…"
      />

      {loading ? <div className="quotes-muted-text">Loading Floor 2…</div> : null}
      {!loading && !search.trim() ? (
        <p className="quotes-muted-text" style={{ marginBottom: 16 }}>Type in the search box to find Floor 2 products.</p>
      ) : null}

      <div className="hassan-showroom-order-form__grid">
        {filtered.map((g) => {
          const aid = String(g.assemblyIds?.[0] || '');
          const asm = assemblyById.get(aid);
          const inCart = cart.some((c) => c.assembly_id === aid);
          return (
            <button
              key={aid}
              type="button"
              disabled={inCart}
              onClick={() => addLine(g)}
              className="hassan-showroom-order-form__pick"
            >
              <WarehouseFloor2WipThumbnail assembly={asm} style={{ width: '100%', height: 100, marginBottom: 8 }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{g.familyBase}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Stock: {g.totalQty} · {inferShowroomWorkshopRoute(asm) === 'upholstery' ? 'Upholstery' : 'Carpentry'}
              </div>
            </button>
          );
        })}
      </div>

      <h3 style={{ marginBottom: 8 }}>Order lines</h3>
      {!cart.length ? (
        <p className="quotes-muted-text">Select products above.</p>
      ) : (
        <table className="table quotes-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Workshop</th>
              <th>Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cart.map((line) => (
              <tr key={line.assembly_id}>
                <td>{line.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{line.route}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateQty(line.assembly_id, e.target.value)}
                    style={{ width: 72 }}
                  />
                  <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>
                    Floor 2 stock: {line.stockQty ?? 0}
                  </span>
                </td>
                <td>
                  <button type="button" className="action-button" onClick={() => removeLine(line.assembly_id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        className="action-button"
        disabled={!cart.length || busy}
        onClick={handleCreate}
        style={{ background: '#1565c0', color: '#fff', padding: '10px 20px', fontWeight: 700 }}
      >
        {busy ? 'Creating…' : 'Create & send to workshop'}
      </button>
    </div>
  );
}