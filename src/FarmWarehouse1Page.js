import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { useAuthProfileMobileGrant } from './hooks/useAuthProfileMobileGrant';
import { isCatalogLocationStockIncreaseAllowed } from './mobile/mobileAccessManifest';
import WarehouseFloor2WipThumbnail from './components/WarehouseFloor2WipThumbnail';
import { fetchCarpentryCatalog, getCachedCarpentryCatalog } from './services/carpentryCatalogApi';
import { postSetFarmProductStock } from './services/carpentryCatalogApi';
import { resolveFarmWarehouse1Location } from './constants/farmWarehouseLocations';
import { resolveWarehouseFloor2Location } from './constants/warehouseFloorLocations';
import { buildFarmWarehouseCandidates } from './utils/farmWarehouseCatalogView';
import { getCachedProductionPortalSnapshot } from './utils/loadProductionPortalCatalogInputs';

function buildAssemblyMapFromCatalog(catalog) {
  const map = new Map();
  const snap = getCachedProductionPortalSnapshot();
  (snap?.assemblies || []).forEach((a) => {
    if (a?.id) map.set(String(a.id), a);
  });
  (catalog?.candidates || []).forEach((c) => {
    if (c?.id && !map.has(String(c.id))) map.set(String(c.id), c);
  });
  return map;
}

export default function FarmWarehouse1Page({
  pageTitle = 'Farm',
  pageSubtitle = 'Same SKUs and Floor 2 WIP photos as Floor 2 — independent farm on-hand quantities.',
  embedInHub = false,
} = {}) {
  const initialCatalog = useMemo(() => getCachedCarpentryCatalog(), []);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [assemblyById, setAssemblyById] = useState(() => buildAssemblyMapFromCatalog(initialCatalog));
  const [search, setSearch] = useState('');
  const [stockEditById, setStockEditById] = useState({});
  const [busyId, setBusyId] = useState('');
  const sessionUser = useMemo(() => getCurrentUser(), []);
  const canManage = useMemo(() => canManageCatalog(sessionUser), [sessionUser]);
  const { grant } = useAuthProfileMobileGrant();
  const canIncreaseFarmStock = canManage || isCatalogLocationStockIncreaseAllowed(
    grant,
    'warehouse_farm_1',
    sessionUser?.email,
  );

  const load = useCallback(async ({ forceFresh = false } = {}) => {
    if (forceFresh || !getCachedCarpentryCatalog()) setLoading(true);
    setError('');
    try {
      const catalog = await fetchCarpentryCatalog({ forceFresh }).catch(() => ({ candidates: [] }));
      const baseMap = buildAssemblyMapFromCatalog(catalog);
      const snap = getCachedProductionPortalSnapshot();
      const assemblies = snap?.assemblies || [];
      const { data: locRows } = await db.from('locations').select('id, name');
      const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
      const farmLoc = resolveFarmWarehouse1Location(locRows || []);
      if (!farmLoc?.id) {
        throw new Error('Farm Warehouse 1 location is missing — run node scripts/ensureFarmWarehouseLocation.js');
      }
      const locIds = [floor2Loc?.id, farmLoc.id].filter(Boolean).map(String);
      const { data: invRows, error: invErr } = await db
        .from('warehouse_assembly_inventory')
        .select('assembly_id, quantity, location_id')
        .in('location_id', locIds);
      if (invErr) throw new Error(invErr.message || 'Failed to load stock');

      const floor2Inv = (invRows || []).filter((r) => String(r.location_id) === String(floor2Loc?.id || ''));
      const farmInv = (invRows || []).filter((r) => String(r.location_id) === String(farmLoc.id));
      const candidates = buildFarmWarehouseCandidates(
        assemblies,
        floor2Inv,
        farmInv,
        floor2Loc?.id,
        farmLoc.id,
      );
      setRows(candidates);
      const ids = candidates.map((c) => String(c.assembly_id || c.id)).filter(Boolean);
      if (ids.length) {
        const { data: photoRows } = await db
          .from('warehouse_assemblies')
          .select('id, name, family_sku, metadata')
          .in('id', ids);
        (photoRows || []).forEach((a) => {
          const id = String(a.id);
          const prev = baseMap.get(id) || { id };
          baseMap.set(id, { ...prev, ...a });
        });
      }
      setAssemblyById(baseMap);
    } catch (err) {
      setError(err?.message || 'Failed to load Farm warehouse catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = String(row.name || '').toLowerCase();
      const sku = String(row.family_sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [rows, search]);

  const handleSaveStockOnHand = async (assemblyId) => {
    const id = String(assemblyId || '').trim();
    if (!id || !canIncreaseFarmStock) return;
    const current = rows.find((r) => String(r.assembly_id || r.id) === id)?.farm_qty ?? 0;
    const raw = stockEditById[id] !== undefined ? stockEditById[id] : current;
    const nextQty = Math.max(0, Math.floor(Number(raw) || 0));
    setBusyId(`stock-${id}`);
    setError('');
    try {
      await postSetFarmProductStock(id, nextQty);
      setStockEditById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to update farm stock on hand');
    } finally {
      setBusyId('');
    }
  };

  const renderStockCell = (row) => {
    const aid = String(row.assembly_id || row.id || '');
    const current = Math.max(0, Math.floor(Number(row.farm_qty) || 0));
    const draftVal = stockEditById[aid] !== undefined ? stockEditById[aid] : String(current);
    const isSaving = busyId === `stock-${aid}`;
    if (!canIncreaseFarmStock) {
      return <span>{current}</span>;
    }
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          min="0"
          step="1"
          className="kitwe-cell-input"
          style={{ width: 84, textAlign: 'center' }}
          value={draftVal}
          disabled={isSaving}
          onChange={(e) => setStockEditById((prev) => ({ ...prev, [aid]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveStockOnHand(aid);
          }}
          aria-label={`Farm stock for ${row.name || aid}`}
        />
        <button
          type="button"
          className="kitwe-btn kitwe-btn-primary kitwe-btn-compact"
          disabled={isSaving}
          onClick={() => handleSaveStockOnHand(aid)}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  };

  return (
    <div className="kitwe-catalog-page">
      {!embedInHub ? <h1 style={{ marginTop: 16 }}>{pageTitle}</h1> : null}
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        {pageSubtitle}
      </p>
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}
      <div className="kitwe-catalog-add-toolbar kitwe-catalog-add-toolbar--inline-row">
        <ServerSearch value={search} onChange={setSearch} />
      </div>
      {loading ? <p>Loading…</p> : null}
      {!loading && filtered.length === 0 ? (
        <p style={{ color: 'var(--kitwe-muted, #64748b)' }}>No farm warehouse products found.</p>
      ) : null}
      <div className="kitwe-catalog-grid" style={{ marginTop: 16 }}>
        {filtered.map((row) => {
          const aid = String(row.assembly_id || row.id || '');
          const asm = assemblyById.get(aid) || { id: aid, name: row.name, family_sku: row.family_sku };
          return (
            <div key={aid} className="kitwe-catalog-card">
              <WarehouseFloor2WipThumbnail
                assembly={asm}
                canEdit={false}
              />
              <div className="kitwe-catalog-card__body">
                <div className="kitwe-catalog-card__title" title={row.name}>{row.name || aid}</div>
                {row.family_sku ? (
                  <div className="kitwe-catalog-card__sku">{row.family_sku}</div>
                ) : null}
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div>Floor 2: {Math.max(0, Number(row.floor2_qty) || 0)}</div>
                  <div style={{ marginTop: 6 }}>Farm on hand: {renderStockCell(row)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServerSearch({ value, onChange }) {
  return (
    <div className="carpentry-add-search-wrap kitwe-catalog-add-toolbar__search">
      <input
        type="search"
        className="kitwe-search-input"
        placeholder="Search farm product or SKU…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search farm warehouse"
      />
    </div>
  );
}
