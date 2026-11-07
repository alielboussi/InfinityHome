import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { canManageCatalog, getCurrentUser } from './accessControl';
import WarehouseFloor2WipThumbnail from './components/WarehouseFloor2WipThumbnail';
import { deleteWarehouseAssembly, uploadWarehouseFloor2WipFamilyImage } from './services/warehouseCatalog';
import { fileToSquareCatalogImage } from './utils/squareCatalogImage';
import {
  mergeWarehouseFloor2WipFamilyImageMetadata,
  mergeWarehouseFloor2WipImageMetadata,
  floor2FamilyCoverSeaterRank,
  readWarehouseFloor2WipFamilyImageUrl,
  readWarehouseFloor2WipImageUrl,
} from './utils/warehouseFloor2WipImage';
import { groupFloor2StockByFamily } from './utils/warehouseFloor2StockGroups';
import { rewriteLegacyStorageUrl } from './utils/storageImageUrl';
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
  const [inlayFamilyKey, setInlayFamilyKey] = useState('');
  const [cardPhotoBusyKey, setCardPhotoBusyKey] = useState('');
  const cardPhotoInputRef = useRef(null);
  const cardPhotoTargetRef = useRef(null);
  const sessionUser = useMemo(() => getCurrentUser(), []);
  const canManage = useMemo(() => canManageCatalog(sessionUser), [sessionUser]);

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

  const handleFamilyImageUpdated = useCallback((assemblyIds, imageUrl) => {
    const ids = [...new Set((assemblyIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) return;
    setAssemblyById((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        const existing = next.get(id) || { id };
        const metadata = mergeWarehouseFloor2WipFamilyImageMetadata(existing.metadata, imageUrl);
        next.set(id, { ...existing, metadata });
      });
      return next;
    });
  }, []);

  const openFamilyCardPhotoPicker = useCallback((group) => {
    if (!canManage || cardPhotoBusyKey || !group?.assemblyIds?.length) return;
    cardPhotoTargetRef.current = group;
    cardPhotoInputRef.current?.click();
  }, [canManage, cardPhotoBusyKey]);

  const handleFamilyCardPhotoChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const group = cardPhotoTargetRef.current;
    cardPhotoTargetRef.current = null;
    if (!file || !group?.assemblyIds?.length) return;
    setCardPhotoBusyKey(group.key);
    setError('');
    try {
      const squareFile = await fileToSquareCatalogImage(file, undefined, { fit: 'contain' });
      const url = await uploadWarehouseFloor2WipFamilyImage(group.assemblyIds, squareFile);
      handleFamilyImageUpdated(group.assemblyIds, url);
    } catch (err) {
      setError(err?.message || 'Failed to upload family WIP photo');
    } finally {
      setCardPhotoBusyKey('');
    }
  }, [handleFamilyImageUpdated]);

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
          .select('id, name, family_sku, metadata')
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
        const { data } = await db.from('warehouse_assemblies').select('id, name, family_sku, metadata').in('id', missingIds);
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
    () => groupFloor2StockByFamily(floor2Stock, assemblyById),
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

  const inlayGroup = useMemo(
    () => stockFamilyGroups.find((g) => g.key === inlayFamilyKey) || null,
    [stockFamilyGroups, inlayFamilyKey],
  );

  const pickFamilyCardImageUrl = useCallback((group) => {
    const rows = group.rows || [];
    const ranked = [...rows].sort((a, b) => {
      const asmA = assemblyById.get(String(a.assembly_id));
      const asmB = assemblyById.get(String(b.assembly_id));
      return (
        floor2FamilyCoverSeaterRank(asmA?.name) - floor2FamilyCoverSeaterRank(asmB?.name)
      );
    });
    for (const row of ranked) {
      const asm = assemblyById.get(String(row.assembly_id));
      const variant = readWarehouseFloor2WipImageUrl(asm);
      if (variant) return rewriteLegacyStorageUrl(variant, { bucket: 'productimages' });
    }
    for (const row of rows) {
      const asm = assemblyById.get(String(row.assembly_id));
      const family = readWarehouseFloor2WipFamilyImageUrl(asm);
      if (family) return rewriteLegacyStorageUrl(family, { bucket: 'productimages' });
    }
    return '';
  }, [assemblyById]);

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
                Click a card to upload its family WIP photo; use the top-right badge for variants and stock.
              </span>
            ) : null}
          </h2>
          <input
            ref={cardPhotoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFamilyCardPhotoChange}
            disabled={!canManage || Boolean(cardPhotoBusyKey)}
          />
          <div className="floor2-manufacture-grid">
            {filteredStockFamilyGroups.map((group) => {
              const variantCount = group.rows.length;
              const imageUrl = pickFamilyCardImageUrl(group);
              const inlayLabel = variantCount === 1 ? '1 product' : `${variantCount} variants`;
              const photoBusy = cardPhotoBusyKey === group.key;
              return (
                <div
                  key={group.key}
                  className={`floor2-manufacture-tile${imageUrl ? ' has-photo' : ''}`}
                >
                  <button
                    type="button"
                    className="floor2-manufacture-tile__photo-hit"
                    disabled={!canManage || photoBusy}
                    onClick={() => openFamilyCardPhotoPicker(group)}
                    aria-label={
                      canManage
                        ? (imageUrl
                          ? `Change family WIP photo for ${group.familyBase}`
                          : `Add family WIP photo for ${group.familyBase}`)
                        : group.familyBase
                    }
                    title={canManage ? (imageUrl ? 'Click to change family WIP photo' : 'Click to add family WIP photo') : undefined}
                  >
                    {imageUrl ? (
                      <img className="floor2-manufacture-tile__photo" src={imageUrl} alt="" />
                    ) : (
                      <div className="floor2-manufacture-tile__photo-placeholder" aria-hidden />
                    )}
                    <div className="floor2-manufacture-tile__overlay" aria-hidden />
                    <h3 className="floor2-manufacture-tile__title">{group.familyBase}</h3>
                    {!imageUrl ? (
                      <div className="floor2-manufacture-tile__no-image-center">
                        <span className="floor2-manufacture-tile__no-image-icon" aria-hidden>
                          ▦
                        </span>
                        {canManage ? (
                          <span className="floor2-manufacture-tile__photo-hint">Click to add photo</span>
                        ) : null}
                      </div>
                    ) : null}
                    {photoBusy ? (
                      <span className="floor2-manufacture-tile__busy" aria-hidden>Uploading…</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="floor2-manufacture-tile__inlay"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInlayFamilyKey(group.key);
                    }}
                    aria-label={`${inlayLabel} — ${group.familyBase}`}
                  >
                    <span className="floor2-manufacture-tile__inlay-icon" aria-hidden>☰</span>
                    {inlayLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {inlayGroup && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="floor2-inlay-backdrop"
            role="presentation"
            onClick={() => setInlayFamilyKey('')}
          >
            <div
              className="floor2-inlay-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="floor2-inlay-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="floor2-inlay-panel__head">
                <h3 id="floor2-inlay-title">{inlayGroup.familyBase}</h3>
                <button type="button" className="kitwe-btn-secondary kitwe-btn-compact" onClick={() => setInlayFamilyKey('')}>
                  Close
                </button>
              </div>
              <p className="floor2-inlay-panel__sub">
                Family and variant WIP photos (production apps only) plus Floor 2 stock per product.
              </p>
              <div className="floor2-inlay-panel__family-photo">
                <span className="floor2-family-card__photo-label">Family WIP (all variants)</span>
                {inlayGroup.rows[0] && assemblyById.get(String(inlayGroup.rows[0].assembly_id)) ? (
                  <WarehouseFloor2WipThumbnail
                    assembly={assemblyById.get(String(inlayGroup.rows[0].assembly_id))}
                    imageKind="family"
                    familyAssemblyIds={inlayGroup.assemblyIds}
                    canEdit={canManage}
                    onFamilyUpdated={handleFamilyImageUpdated}
                    onError={(msg) => setError(msg)}
                    compactLabel="Family"
                  />
                ) : null}
              </div>
              <div className="floor2-inlay-panel__table-wrap">
                <table className="kitwe-catalog-table floor2-inlay-table">
                  <thead>
                    <tr>
                      <th className="floor2-inlay-col-wip">Variant WIP</th>
                      <th>Product</th>
                      <th className="floor2-inlay-col-sku">SKU</th>
                      <th className="floor2-inlay-col-stock">Stock on hand</th>
                      {canManage ? <th style={{ width: 92 }}>Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {inlayGroup.rows.map((row) => {
                      const aid = String(row.assembly_id);
                      const asm = assemblyById.get(aid);
                      return (
                        <tr key={`inlay-${aid}`}>
                          <td className="floor2-inlay-col-wip">
                            {asm ? (
                              <WarehouseFloor2WipThumbnail
                                assembly={asm}
                                imageKind="component"
                                canEdit={canManage}
                                onUpdated={handleAssemblyImageUpdated}
                                onError={(msg) => setError(msg)}
                                compactLabel="Variant"
                              />
                            ) : '—'}
                          </td>
                          <td><strong>{asm?.name || aid}</strong></td>
                          <td className="floor2-inlay-col-sku">{asm?.family_sku || '—'}</td>
                          <td className="floor2-inlay-col-stock">{renderStockEditor(aid, row.quantity)}</td>
                          {canManage ? (
                            <td>
                              <button
                                type="button"
                                className="kitwe-btn-secondary kitwe-btn-compact kitwe-btn-danger"
                                disabled={busyId === `del-${aid}`}
                                onClick={() => handleDeleteFloor2Product(aid)}
                              >
                                {busyId === `del-${aid}` ? '…' : 'Delete'}
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
