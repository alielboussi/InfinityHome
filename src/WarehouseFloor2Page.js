import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { deleteWarehouseAssembly } from './services/warehouseCatalog';
import { mergeWarehouseFloor2WipImageMetadata } from './utils/warehouseFloor2WipImage';
import { floor2StockAsFlatGroups } from './utils/warehouseFloor2StockGroups';
import WarehouseFloor2WipThumbnail from './components/WarehouseFloor2WipThumbnail';
import {
  fetchCarpentryCatalog,
  fetchCarpentryFloorRuns,
  getCachedCarpentryCatalog,
  getCachedCarpentryFloorRuns,
  postAddFloor2Product,
  postSetFloor2ProductStock,
} from './services/carpentryCatalogApi';
import { getCachedProductionPortalSnapshot } from './utils/loadProductionPortalCatalogInputs';
import CategoryRemainingChecklist from './components/CategoryRemainingChecklist';
import WarehouseProductionLabelPrintDialog, {
  WarehouseLabelPrintIconButton,
} from './components/WarehouseProductionLabelPrintDialog';
import { useAuthProfileMobileGrant } from './hooks/useAuthProfileMobileGrant';
import { isWarehouseCatalogLabelPrintAllowed } from './mobile/mobileAccessManifest';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';
import { warehouseLabelPrintItemFromRow } from './utils/warehouseRowLabelPrint';
import { formatAssemblyDimensions } from './utils/warehouseAssemblySpecs';

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

export default function WarehouseFloor2Page({
  pageTitle = 'Warehouse Floor 2',
  pageSubtitle = 'Unfinished carpentry WIP (after workshop Manufacture or manual add from Floor 1). Finish in the carpentry app → Floor 1; or send to upholstery from Floor 2.',
  embedInHub = false,
} = {}) {
  const initialCatalog = useMemo(() => getCachedCarpentryCatalog(), []);
  const initialRuns = useMemo(() => getCachedCarpentryFloorRuns(), []);
  const [loading, setLoading] = useState(!(initialCatalog && initialRuns));
  const [error, setError] = useState('');
  const [runs, setRuns] = useState(() => initialRuns?.rows || []);
  const [floor2Stock, setFloor2Stock] = useState(() => initialRuns?.floor2Stock || []);
  const [tableMissing, setTableMissing] = useState(() => Boolean(initialRuns?.tableMissing));
  const [assemblyById, setAssemblyById] = useState(() => buildAssemblyMapFromCatalog(initialCatalog));

  const [candidates, setCandidates] = useState(() => initialCatalog?.candidates || []);
  const [warehouseSetCandidates, setWarehouseSetCandidates] = useState(() => initialCatalog?.setCandidates || []);
  const [categories, setCategories] = useState(() => initialCatalog?.categories || []);
  const [search, setSearch] = useState('');
  const [stockEditById, setStockEditById] = useState({});
  const [busyId, setBusyId] = useState('');
  const sessionUser = useMemo(() => getCurrentUser(), []);
  const canManage = useMemo(() => canManageCatalog(sessionUser), [sessionUser]);
  const { grant } = useAuthProfileMobileGrant();
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
    if (forceFresh || !(getCachedCarpentryCatalog() && getCachedCarpentryFloorRuns())) {
      setLoading(true);
    }
    setError('');
    try {
      const [payload, catalog] = await Promise.all([
        fetchCarpentryFloorRuns(),
        fetchCarpentryCatalog({ forceFresh }).catch(() => ({ candidates: [], setCandidates: [], categories: [] })),
      ]);
      const runRows = payload.rows || [];
      const stockRows = payload.floor2Stock || [];
      setRuns(runRows);
      setFloor2Stock(stockRows);
      setTableMissing(Boolean(payload.tableMissing));
      setCandidates(catalog.candidates || []);
      setWarehouseSetCandidates(catalog.setCandidates || []);
      setCategories(
        (catalog.categories || [])
          .map((c) => ({ id: String(c.id), name: String(c.name || '').trim() }))
          .filter((c) => c.name),
      );

      const baseMap = buildAssemblyMapFromCatalog(catalog);
      const floor2AssemblyIds = [
        ...new Set([
          ...stockRows.map((r) => r.assembly_id),
          ...runRows.map((r) => r.assembly_id),
        ].filter(Boolean).map(String)),
      ];
      if (floor2AssemblyIds.length) {
        const { data: photoRows } = await db
          .from('warehouse_assemblies')
          .select('id, name, family_sku, metadata, dim_length, dim_width, dim_height')
          .in('id', floor2AssemblyIds);
        (photoRows || []).forEach((a) => {
          const id = String(a.id);
          const prev = baseMap.get(id) || { id };
          baseMap.set(id, { ...prev, ...a, name: prev.name || a.name, family_sku: prev.family_sku || a.family_sku });
        });
      }
      const missingIds = [
        ...new Set([
          ...runRows.map((r) => r.assembly_id),
          ...stockRows.map((s) => s.assembly_id),
        ].filter((id) => id && !baseMap.has(String(id)))),
      ];
      if (missingIds.length) {
        const { data } = await db
          .from('warehouse_assemblies')
          .select('id, name, family_sku, metadata, dim_length, dim_width, dim_height')
          .in('id', missingIds);
        (data || []).forEach((a) => {
          baseMap.set(String(a.id), a);
        });
      }
      setAssemblyById(baseMap);
    } catch (err) {
      setError(err?.message || 'Failed to load floor runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const floor2QtyByAssembly = useMemo(() => {
    const map = new Map();
    (floor2Stock || []).forEach((row) => {
      map.set(String(row.assembly_id), Number(row.quantity) || 0);
    });
    return map;
  }, [floor2Stock]);

  const stockFamilyGroups = useMemo(
    () => floor2StockAsFlatGroups(floor2Stock, assemblyById),
    [floor2Stock, assemblyById],
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

  const renderStockEditor = (aid, rowQty) => {
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

  const handleSaveStockOnHand = async (assemblyId) => {
    const id = String(assemblyId || '').trim();
    if (!id) return;
    const current = floor2QtyByAssembly.get(id) ?? 0;
    const raw = stockEditById[id] !== undefined ? stockEditById[id] : current;
    const nextQty = Math.max(0, Math.floor(Number(raw) || 0));
    setBusyId(`stock-${id}`);
    setError('');
    try {
      await postSetFloor2ProductStock(id, nextQty);
      setStockEditById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to update Floor 2 stock on hand');
    } finally {
      setBusyId('');
    }
  };

  const handleDeleteFloor2Product = async (assemblyId) => {
    if (!canManage) return;
    const id = String(assemblyId || '').trim();
    if (!id) return;
    const asm = assemblyById.get(id);
    const name = asm?.name || id;
    if (!window.confirm(`Delete product "${name}" from Floor 2 and catalog?`)) return;
    const prevFloor2Stock = floor2Stock;
    const prevRuns = runs;
    setError('');
    setFloor2Stock((prev) => prev.filter((r) => String(r.assembly_id) !== id));
    setRuns((prev) => prev.filter((r) => String(r.assembly_id) !== id));
    setBusyId(`del-${id}`);
    try {
      await deleteWarehouseAssembly(id);
      load({ forceFresh: true });
    } catch (err) {
      setFloor2Stock(prevFloor2Stock);
      setRuns(prevRuns);
      setError(err?.message || 'Failed to delete Floor 2 product');
    } finally {
      setBusyId('');
    }
  };

  const existingFloor2ProductIds = useMemo(() => {
    const set = new Set();
    (floor2Stock || []).forEach((row) => {
      if ((Number(row.quantity) || 0) > 0 && row.assembly_id) {
        set.add(String(row.assembly_id));
      }
    });
    (runs || []).forEach((run) => {
      if (run?.assembly_id) {
        set.add(String(run.assembly_id));
      }
    });
    return set;
  }, [floor2Stock, runs]);

  const handleAddFloor2Batch = async (ids) => {
    const unique = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => !existingFloor2ProductIds.has(id));
    if (!unique.length) return;
    setBusyId(`cat-batch-${unique[0]}`);
    setError('');
    try {
      await Promise.all(unique.map((id) => postAddFloor2Product(id, 1)));
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to add selected products to Warehouse Floor 2');
      throw err;
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="kitwe-catalog-page">
      {!embedInHub ? <BackToDashboard /> : null}
      {!embedInHub ? <h1 style={{ marginTop: 16 }}>{pageTitle}</h1> : null}
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        {pageSubtitle}
      </p>
      {tableMissing ? (
        <p style={{ color: '#b45309' }}>
          Carpentry production collections are not registered yet. Run{' '}
          <code>node scripts/applyCarpentryProductionSchema.js</code> (Firestore) after deploying server changes.
        </p>
      ) : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      <div className="kitwe-catalog-add-toolbar kitwe-catalog-add-toolbar--inline-row">
        <div className="carpentry-add-search-wrap kitwe-catalog-add-toolbar__search">
          <input
            type="search"
            className="kitwe-search-input carpentry-add-search-input kitwe-catalog-search"
            style={{ width: '100%' }}
            placeholder="Search Floor 2 products by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CategoryRemainingChecklist
          toolbarInline
          categories={categories}
          candidates={candidates}
          setCandidates={warehouseSetCandidates}
          existingProductIds={existingFloor2ProductIds}
          busy={Boolean(busyId)}
          selectPlaceholder="Select category to add remaining…"
          addButtonLabel="Add selected to Floor 2"
          onAddSelected={handleAddFloor2Batch}
        />
      </div>

      {loading ? <p>Loading…</p> : null}

      {!loading && search.trim() && filteredStockFamilyGroups.length === 0 && stockFamilyGroups.length > 0 ? (
        <p className="kitwe-empty-hint" style={{ marginTop: 8 }}>
          No Floor 2 products match your search.
        </p>
      ) : null}

      {!loading && !search.trim() && stockFamilyGroups.length === 0 ? (
        <p className="kitwe-empty-hint" style={{ marginTop: 8 }}>
          No unfinished products on Floor 2 yet. Add from Floor 1 above, create in the carpentry app, or set stock on
          a carpentry-catalog product.
        </p>
      ) : null}

      {filteredStockFamilyGroups.length > 0 ? (
        <div className="kitwe-catalog-table-wrap" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, margin: '8px 0 12px', padding: '0 10px' }}>
            Current Unfinished Stock on Floor 2
            {canManage ? (
              <span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: '#64748b', marginTop: 4 }}>
                Add or change WIP photos on each row; use Remove to clear Floor 2-only images (Floor 1 catalog unchanged).
              </span>
            ) : null}
          </h2>
          <div className="kitwe-catalog-product-rows" role="list">
            <div
              className="kitwe-catalog-product-rows__header kitwe-catalog-product-rows__header--floor2"
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
              const dimensionsText = asm ? formatAssemblyDimensions(asm) : '';
              return (
                <article
                  key={group.key}
                  className="kitwe-catalog-product-row kitwe-catalog-product-row--floor2"
                  role="listitem"
                >
                  <div className="kitwe-catalog-product-row__wip">
                    <WarehouseFloor2WipThumbnail
                      assembly={asm || { id: aid, name: group.familyBase, metadata: {} }}
                      canEdit={canManage}
                      compactLabel="WIP"
                      onUpdated={handleAssemblyImageUpdated}
                      onError={(msg) => setError(msg || 'Failed to update WIP photo')}
                    />
                  </div>
                  <div className="kitwe-catalog-product-row__sku">{sku}</div>
                  <div className="kitwe-catalog-product-row__name">
                    <strong>{group.familyBase}</strong>
                    {dimensionsText ? (
                      <span className="kitwe-catalog-product-row__dims" title="From warehouse catalog (Floor 1)">
                        {dimensionsText}
                      </span>
                    ) : null}
                  </div>
                  <div className="kitwe-catalog-product-row__meta">
                    {renderStockEditor(aid, row.quantity)}
                  </div>
                  <div className="kitwe-catalog-product-row__actions">
                    <div className="kitwe-catalog-product-row__actions-inner">
                      {canPrintLabels && asm ? (
                        <WarehouseLabelPrintIconButton
                          title="Print warehouse label"
                          onClick={() => openRowLabelPrint(asm, row.quantity)}
                        />
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          className="kitwe-btn-secondary kitwe-btn-compact kitwe-btn-danger"
                          disabled={busyId === `del-${aid}`}
                          onClick={() => handleDeleteFloor2Product(aid)}
                        >
                          {busyId === `del-${aid}` ? '…' : 'Delete'}
                        </button>
                      ) : !canPrintLabels ? (
                        <span style={{ fontSize: 13, color: 'var(--kitwe-muted, #64748b)' }}>
                          Qty: {Math.max(0, Number(row.quantity) || 0)}
                        </span>
                      ) : null}
                    </div>
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
