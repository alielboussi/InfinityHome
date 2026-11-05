import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
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
}) {
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
  const [qtyDraftById, setQtyDraftById] = useState({});
  const [stockEditById, setStockEditById] = useState({});
  const [expandedSetId, setExpandedSetId] = useState('');
  const [busyId, setBusyId] = useState('');

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
      const missingIds = [
        ...new Set([
          ...runRows.map((r) => r.assembly_id),
          ...stockRows.map((s) => s.assembly_id),
        ].filter((id) => id && !baseMap.has(String(id)))),
      ];
      if (missingIds.length) {
        const { data } = await db.from('warehouse_assemblies').select('id, name, family_sku').in('id', missingIds);
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

  const candidateRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (candidates || []).filter(
      (c) => String(c.name || '').toLowerCase().includes(q)
        || String(c.family_sku || '').toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const matchingSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (warehouseSetCandidates || []).filter((set) => {
      const setHay = `${set.family_sku || ''} ${set.name || ''}`.toLowerCase();
      if (setHay.includes(q)) return true;
      return (set.components || []).some(
        (c) => String(c.name || '').toLowerCase().includes(q)
          || String(c.family_sku || '').toLowerCase().includes(q),
      );
    });
  }, [warehouseSetCandidates, search]);

  const resolveQtyForId = (id) => {
    const raw = qtyDraftById[String(id)];
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  };

  const setQtyDraft = (id, val) => {
    setQtyDraftById((prev) => ({
      ...prev,
      [String(id)]: val,
    }));
  };

  const handleAddProduct = async (assemblyId, overrideQty = null) => {
    const id = String(assemblyId || '').trim();
    if (!id) return;
    const qty = overrideQty !== null
      ? Math.max(1, Math.floor(Number(overrideQty) || 1))
      : resolveQtyForId(id);
    setBusyId(id);
    setError('');
    try {
      await postAddFloor2Product(id, qty);
      setSearch('');
      setExpandedSetId('');
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to add product to Warehouse Floor 2');
    } finally {
      setBusyId('');
    }
  };

  const handleAddSetComponents = async (set) => {
    const comps = Array.isArray(set?.components) ? set.components : [];
    if (!comps.length) return;
    const setId = String(set.id);
    const setMultiplier = resolveQtyForId(`set-${setId}`);
    setBusyId(`batch-${setId}`);
    setError('');
    try {
      await Promise.all(
        comps
          .filter((comp) => String(comp.id || '').trim())
          .map((comp) => {
            const compId = String(comp.id).trim();
            const perSet = Math.max(1, Math.floor(Number(comp.quantity) || 1));
            return postAddFloor2Product(compId, perSet * setMultiplier);
          }),
      );
      setSearch('');
      setExpandedSetId('');
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to add set components to Warehouse Floor 2');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>{pageTitle}</h1>
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
            placeholder="Search Warehouse Floor 1 product or set to add to Floor 2…"
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

      {search.trim() ? (
        <div className="kitwe-catalog-card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Add from Warehouse Floor 1</h2>
          {candidateRows.length === 0 && matchingSets.length === 0 ? (
            <p className="kitwe-empty-hint">No matching Warehouse Floor 1 products or sets.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {matchingSets.map((set) => {
                const setOpen = expandedSetId === set.id;
                const compIds = (set.components || []).map((c) => c.id);
                const setDraftKey = `set-${set.id}`;
                return (
                  <li
                    key={`set-${set.id}`}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid var(--br-border, #e2e8f0)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        <strong>{set.name}</strong>{' '}
                        <span style={{ color: '#64748b' }}>({set.family_sku})</span>{' '}
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#0369a1',
                            marginLeft: 6,
                          }}
                        >
                          Set · {(set.components || []).length} component(s)
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={qtyDraftById[setDraftKey] ?? 1}
                          onChange={(e) => setQtyDraft(setDraftKey, e.target.value)}
                          style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          aria-label={`Quantity for ${set.name}`}
                        />
                        <button
                          type="button"
                          className="kitwe-btn"
                          onClick={() => setExpandedSetId(setOpen ? '' : set.id)}
                        >
                          {setOpen ? 'Hide components' : 'Components'}
                        </button>
                        <button
                          type="button"
                          className="kitwe-btn kitwe-btn-primary"
                          disabled={busyId === `batch-${set.id}` || compIds.length === 0}
                          onClick={() => handleAddSetComponents(set)}
                        >
                          Add all components to Floor 2
                        </button>
                      </span>
                    </div>
                    {setOpen ? (
                      <ul style={{ listStyle: 'none', padding: '10px 0 0 12px', margin: 0 }}>
                        {(set.components || []).map((comp) => {
                          const currentFloor2 = floor2QtyByAssembly.get(String(comp.id)) || 0;
                          return (
                            <li
                              key={`${set.id}-${comp.id}`}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 0',
                                gap: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              <span>
                                {comp.name}{' '}
                                <span style={{ color: '#64748b' }}>({comp.family_sku})</span>
                                {comp.quantity > 1 ? (
                                  <span style={{ color: '#64748b', fontSize: 13 }}> ×{comp.quantity} in set</span>
                                ) : null}
                                {currentFloor2 > 0 ? (
                                  <span style={{ color: '#0369a1', fontSize: 13, marginLeft: 8 }}>
                                    (On Floor 2: {currentFloor2})
                                  </span>
                                ) : null}
                              </span>
                              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={qtyDraftById[String(comp.id)] ?? (comp.quantity || 1)}
                                  onChange={(e) => setQtyDraft(comp.id, e.target.value)}
                                  style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                  aria-label={`Quantity for ${comp.name}`}
                                />
                                <button
                                  type="button"
                                  className="kitwe-btn kitwe-btn-primary"
                                  disabled={busyId === String(comp.id)}
                                  onClick={() => handleAddProduct(
                                    comp.id,
                                    qtyDraftById[String(comp.id)] ?? (comp.quantity || 1),
                                  )}
                                >
                                  Add to Floor 2
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
              {candidateRows.map((c) => {
                const currentFloor2 = floor2QtyByAssembly.get(String(c.id)) || 0;
                return (
                  <li
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--br-border, #e2e8f0)',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <strong>{c.name}</strong>{' '}
                      <span style={{ color: '#64748b' }}>({c.family_sku})</span>
                      {currentFloor2 > 0 ? (
                        <span style={{ color: '#0369a1', fontSize: 13, marginLeft: 8 }}>
                          (On Floor 2: {currentFloor2})
                        </span>
                      ) : null}
                    </span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={qtyDraftById[String(c.id)] ?? 1}
                        onChange={(e) => setQtyDraft(c.id, e.target.value)}
                        style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        aria-label={`Quantity for ${c.name}`}
                      />
                      <button
                        type="button"
                        className="kitwe-btn kitwe-btn-primary"
                        disabled={busyId === String(c.id)}
                        onClick={() => handleAddProduct(c.id)}
                      >
                        Add to Floor 2
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {loading ? <p>Loading…</p> : null}

      {floor2Stock.length > 0 ? (
        <div className="kitwe-catalog-table-wrap" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, margin: '8px 0 12px', padding: '0 10px' }}>Current Unfinished Stock on Floor 2</h2>
          <table className="kitwe-catalog-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Stock on hand (Floor 2)</th>
              </tr>
            </thead>
            <tbody>
              {floor2Stock.map((row) => {
                const aid = String(row.assembly_id);
                const asm = assemblyById.get(aid);
                const draftVal = stockEditById[aid] !== undefined ? stockEditById[aid] : row.quantity;
                const isSaving = busyId === `stock-${aid}`;
                return (
                  <tr key={`stock-${aid}`}>
                    <td><strong>{asm?.name || aid}</strong></td>
                    <td>{asm?.family_sku || '—'}</td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="kitwe-catalog-table-wrap">
        <table className="kitwe-catalog-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Stock on hand</th>
              <th>Run Qty</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Materials</th>
            </tr>
          </thead>
          <tbody>
            {runs.length ? runs.map((run) => {
              const aid = String(run.assembly_id || '');
              const asm = assemblyById.get(aid);
              const matCount = Array.isArray(run.materials) ? run.materials.length : 0;
              const currentStock = floor2QtyByAssembly.get(aid) ?? 0;
              const draftVal = stockEditById[aid] !== undefined ? stockEditById[aid] : currentStock;
              const isSaving = busyId === `stock-${aid}`;
              return (
                <tr key={run.id}>
                  <td>{asm?.name || run.assembly_id}</td>
                  <td>{asm?.family_sku || '—'}</td>
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="kitwe-cell-input"
                        style={{ width: 72, textAlign: 'center' }}
                        value={draftVal}
                        disabled={isSaving || !aid}
                        onChange={(e) => setStockEditById((prev) => ({ ...prev, [aid]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveStockOnHand(aid);
                        }}
                        aria-label={`Stock on hand for ${asm?.name || aid}`}
                      />
                      <button
                        type="button"
                        className="kitwe-btn-secondary kitwe-btn-compact"
                        disabled={isSaving || !aid}
                        onClick={() => handleSaveStockOnHand(aid)}
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                    </div>
                  </td>
                  <td>{run.product_qty ?? '—'}</td>
                  <td>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
                  <td>{run.completed_at ? new Date(run.completed_at).toLocaleString() : 'In progress'}</td>
                  <td>{matCount ? `${matCount} line${matCount === 1 ? '' : 's'}` : '—'}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={7} className="kitwe-empty-hint">No floor production runs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
