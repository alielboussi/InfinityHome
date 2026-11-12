import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { useAuthProfileMobileGrant } from './hooks/useAuthProfileMobileGrant';
import {
  isCatalogLocationPhotoUploadAllowed,
  isCatalogLocationStockIncreaseAllowed,
} from './mobile/mobileAccessManifest';
import WarehouseFloor2WipThumbnail from './components/WarehouseFloor2WipThumbnail';
import { mergeWarehouseFloor2WipImageMetadata } from './utils/warehouseFloor2WipImage';
import { fetchCarpentryCatalog, getCachedCarpentryCatalog } from './services/carpentryCatalogApi';
import { postSetFarmProductStock } from './services/carpentryCatalogApi';
import { resolveFarmWarehouse1Location } from './constants/farmWarehouseLocations';
import { resolveWarehouseFloor2Location } from './constants/warehouseFloorLocations';
import { buildFarmWarehouseCandidates } from './utils/farmWarehouseCatalogView';
import { floor2StockAsFlatGroups } from './utils/warehouseFloor2StockGroups';
import { getCachedProductionPortalSnapshot } from './utils/loadProductionPortalCatalogInputs';
import WarehouseProductionLabelPrintDialog, {
  WarehouseLabelPrintIconButton,
} from './components/WarehouseProductionLabelPrintDialog';
import { isWarehouseCatalogLabelPrintAllowed } from './mobile/mobileAccessManifest';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';
import { warehouseLabelPrintItemFromRow } from './utils/warehouseRowLabelPrint';

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
  const canEditWipPhoto = canManage || isCatalogLocationPhotoUploadAllowed(
    grant,
    'warehouse_farm_1',
    sessionUser?.email,
  );
  const canPrintLabels = canManage || isWarehouseCatalogLabelPrintAllowed(grant, sessionUser?.email);
  const [labelPrintItem, setLabelPrintItem] = useState(null);

  const packetsByAssembly = useMemo(() => {
    const snap = getCachedProductionPortalSnapshot();
    if (!snap?.assemblyPackets || !snap?.packets) return new Map();
    return buildPacketsByAssembly(snap.assemblyPackets, snap.packets);
  }, []);

  const openRowLabelPrint = useCallback((assembly, qty) => {
    const pktList = packetsByAssembly.get(String(assembly?.id)) || [];
    const item = warehouseLabelPrintItemFromRow(assembly, qty, { pktList });
    if (!item) {
      setError('Name and SKU are required to print a label.');
      return;
    }
    setError('');
    setLabelPrintItem(item);
  }, [packetsByAssembly]);

  const farmQtyByAssembly = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const aid = String(row.assembly_id || row.id || '');
      if (aid) map.set(aid, Math.max(0, Math.floor(Number(row.farm_qty) || 0)));
    });
    return map;
  }, [rows]);

  const farmStockRows = useMemo(
    () => rows.map((row) => ({
      assembly_id: row.assembly_id || row.id,
      quantity: Math.max(0, Math.floor(Number(row.farm_qty) || 0)),
    })),
    [rows],
  );

  const stockFamilyGroups = useMemo(
    () => floor2StockAsFlatGroups(farmStockRows, assemblyById),
    [farmStockRows, assemblyById],
  );

  const filteredStockFamilyGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stockFamilyGroups;
    return stockFamilyGroups.filter((group) => {
      if (String(group.familyBase || '').toLowerCase().includes(q)) return true;
      return (group.rows || []).some((row) => {
        const aid = String(row.assembly_id || '');
        const asm = assemblyById.get(aid);
        const name = String(asm?.name || '').toLowerCase();
        const sku = String(asm?.family_sku || '').toLowerCase();
        return name.includes(q) || sku.includes(q);
      });
    });
  }, [stockFamilyGroups, search, assemblyById]);

  const handleAssemblyImageUpdated = useCallback((assemblyId, imageUrl) => {
    const id = String(assemblyId || '');
    if (!id) return;
    setAssemblyById((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) || { id };
      const metadata = mergeWarehouseFloor2WipImageMetadata(existing.metadata, imageUrl);
      next.set(id, { ...existing, metadata });
      return next;
    });
  }, []);

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
          baseMap.set(id, { ...prev, ...a, name: prev.name || a.name, family_sku: prev.family_sku || a.family_sku });
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

  const handleSaveStockOnHand = async (assemblyId) => {
    const id = String(assemblyId || '').trim();
    if (!id || !canIncreaseFarmStock) return;
    const current = farmQtyByAssembly.get(id) ?? 0;
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

  const renderStockEditor = (aid, rowQty) => {
    if (!canIncreaseFarmStock) {
      return <span>{Math.max(0, Number(rowQty) || 0)}</span>;
    }
    const draftVal = stockEditById[aid] !== undefined ? stockEditById[aid] : rowQty;
    const isSaving = busyId === `stock-${aid}`;
    const asm = assemblyById.get(aid);
    return (
      <div className="floor2-stock-editor">
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
          aria-label={`Stock on hand for ${asm?.name || aid}`}
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
        <div className="carpentry-add-search-wrap kitwe-catalog-add-toolbar__search">
          <input
            type="search"
            className="kitwe-search-input carpentry-add-search-input kitwe-catalog-search"
            style={{ width: '100%' }}
            placeholder="Search farm products by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? <p>Loading…</p> : null}

      {!loading && search.trim() && filteredStockFamilyGroups.length === 0 && stockFamilyGroups.length > 0 ? (
        <p className="kitwe-empty-hint" style={{ marginTop: 8 }}>
          No farm products match your search.
        </p>
      ) : null}

      {!loading && !search.trim() && stockFamilyGroups.length === 0 ? (
        <p className="kitwe-empty-hint" style={{ marginTop: 8 }}>
          No products on the farm list yet. Farm rows follow the same Floor 2 WIP catalog — set farm stock when units
          arrive at the farm.
        </p>
      ) : null}

      {filteredStockFamilyGroups.length > 0 ? (
        <div className="kitwe-catalog-table-wrap" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, margin: '8px 0 12px', padding: '0 10px' }}>
            Current stock at Farm
            {canEditWipPhoto ? (
              <span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: '#64748b', marginTop: 4 }}>
                WIP photos are shared with Floor 2. Adjust farm on-hand in the Stock on hand column.
              </span>
            ) : null}
          </h2>
          <div className="kitwe-catalog-product-rows" role="list">
            <div
              className="kitwe-catalog-product-rows__header kitwe-catalog-product-rows__header--floor2-farm"
              aria-hidden
            >
              <span>Photo</span>
              <span>SKU</span>
              <span>Product</span>
              <span>Stock on hand</span>
              <span>Actions</span>
            </div>
            {filteredStockFamilyGroups.map((group) => {
              const row = (group.rows || [])[0];
              if (!row) return null;
              const aid = String(row.assembly_id);
              const asm = assemblyById.get(aid);
              const sku = asm?.family_sku || '—';
              const farmQty = farmQtyByAssembly.get(aid) ?? row.quantity;
              return (
                <article
                  key={group.key}
                  className="kitwe-catalog-product-row kitwe-catalog-product-row--floor2-farm"
                  role="listitem"
                >
                  <div className="kitwe-catalog-product-row__wip">
                    <WarehouseFloor2WipThumbnail
                      assembly={asm || { id: aid, name: group.familyBase, metadata: {} }}
                      canEdit={canEditWipPhoto}
                      compactLabel="WIP"
                      onUpdated={handleAssemblyImageUpdated}
                      onError={(msg) => setError(msg || 'Failed to update WIP photo')}
                    />
                  </div>
                  <div className="kitwe-catalog-product-row__sku">{sku}</div>
                  <div className="kitwe-catalog-product-row__name">
                    <strong>{group.familyBase}</strong>
                  </div>
                  <div className="kitwe-catalog-product-row__meta">
                    {renderStockEditor(aid, farmQty)}
                  </div>
                  <div className="kitwe-catalog-product-row__actions">
                    {canPrintLabels && asm ? (
                      <WarehouseLabelPrintIconButton
                        title="Print warehouse label"
                        onClick={() => openRowLabelPrint(asm, farmQty)}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--kitwe-muted, #64748b)' }}>—</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      <WarehouseProductionLabelPrintDialog
        open={Boolean(labelPrintItem)}
        item={labelPrintItem}
        onClose={() => setLabelPrintItem(null)}
      />
    </div>
  );
}
