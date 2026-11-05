import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import './kitwe-catalog-page.css';
import { resolveCarpentryWarehouseLocations } from './constants/carpentryWarehouses';
import { useMaterialUomOptions } from './hooks/useMaterialUomOptions';
import {
  fetchCarpentryCatalog,
  getCachedCarpentryCatalog,
  postCarpentryCatalog,
} from './services/carpentryCatalogApi';
import {
  applyStoreroomMaterialUomToLine,
  labelForMaterialUom,
  uomFromStoreroomMaterial,
} from './utils/storeroomBomLineUom';
import CategoryRemainingChecklist from './components/CategoryRemainingChecklist';

const emptyMaterial = () => ({
  material_assembly_id: '',
  quantity: 1,
  uom: '',
  warehouse_location_id: '',
});

function buildDraftsForProducts(products) {
  const drafts = {};
  (products || []).forEach((p) => {
    drafts[p.id] = (p.materials || []).length
      ? p.materials.map((m) => ({ ...m, warehouse_location_id: m.warehouse_location_id || '' }))
      : [emptyMaterial()];
  });
  return drafts;
}

export default function CarpentryPage() {
  const initialCached = useMemo(() => getCachedCarpentryCatalog(), []);
  const [loading, setLoading] = useState(!initialCached);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState(() => initialCached?.candidates || []);
  const [warehouseSetCandidates, setWarehouseSetCandidates] = useState(() => initialCached?.setCandidates || []);
  const [categories, setCategories] = useState(() => initialCached?.categories || []);
  const [storeroomMaterials, setStoreroomMaterials] = useState(() => initialCached?.storeroomMaterials || []);
  const [carpentryProducts, setCarpentryProducts] = useState(() => initialCached?.carpentryProducts || []);
  const [expandedId, setExpandedId] = useState('');
  const [expandedSetId, setExpandedSetId] = useState('');
  const [materialDrafts, setMaterialDrafts] = useState(() => buildDraftsForProducts(initialCached?.carpentryProducts));
  const [carpentryLocations, setCarpentryLocations] = useState(
    () => resolveCarpentryWarehouseLocations(initialCached?.locations || []),
  );
  const [busyId, setBusyId] = useState('');

  const { options: uomOptions } = useMaterialUomOptions();

  const applyCatalogSnapshot = useCallback((catalog) => {
    if (!catalog) return;
    setCarpentryLocations(resolveCarpentryWarehouseLocations(catalog.locations || []));
    setCategories(
      (catalog.categories || [])
        .map((c) => ({ id: String(c.id), name: String(c.name || '').trim() }))
        .filter((c) => c.name),
    );
    setCandidates(catalog.candidates || []);
    setWarehouseSetCandidates(catalog.setCandidates || []);
    setStoreroomMaterials(catalog.storeroomMaterials || []);
    setCarpentryProducts(catalog.carpentryProducts || []);
    setMaterialDrafts(buildDraftsForProducts(catalog.carpentryProducts));
  }, []);

  const load = useCallback(async ({ forceFresh = false } = {}) => {
    const cached = !forceFresh ? getCachedCarpentryCatalog() : null;
    if (cached) {
      applyCatalogSnapshot(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const catalog = await fetchCarpentryCatalog({ forceFresh });
      applyCatalogSnapshot(catalog);
    } catch (err) {
      setError(err?.message || 'Failed to load Carpentry catalog');
    } finally {
      setLoading(false);
    }
  }, [applyCatalogSnapshot]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProductIds = useMemo(
    () => new Set(carpentryProducts.map((p) => String(p.id))),
    [carpentryProducts],
  );

  const candidateRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (candidates || [])
      .filter((c) => !selectedProductIds.has(String(c.id)))
      .filter((c) => String(c.name || '').toLowerCase().includes(q)
        || String(c.family_sku || '').toLowerCase().includes(q));
  }, [candidates, selectedProductIds, search]);

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

  const catalogRows = useMemo(() => carpentryProducts || [], [carpentryProducts]);

  const materialOptions = useMemo(
    () => (storeroomMaterials || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [storeroomMaterials],
  );

  const addProducts = async (assemblyIds) => {
    const ids = [...new Set((assemblyIds || []).map((id) => String(id)).filter(Boolean))]
      .filter((id) => !selectedProductIds.has(id));
    if (!ids.length) return;
    setBusyId(`batch-${ids[0]}`);
    setError('');
    try {
      await Promise.all(
        ids.map((assemblyId) => postCarpentryCatalog({ op: 'save-product', assembly_id: assemblyId, selected: true })),
      );
      setSearch('');
      setExpandedSetId('');
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to add products');
      throw err;
    } finally {
      setBusyId('');
    }
  };

  const addProduct = async (assemblyId) => {
    setBusyId(String(assemblyId));
    setError('');
    try {
      await postCarpentryCatalog({ op: 'save-product', assembly_id: assemblyId, selected: true });
      setSearch('');
      setExpandedSetId('');
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to add product');
    } finally {
      setBusyId('');
    }
  };

  const removeProduct = async (assemblyId) => {
    setBusyId(assemblyId);
    setError('');
    try {
      await postCarpentryCatalog({ op: 'save-product', assembly_id: assemblyId, selected: false });
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to remove product');
    } finally {
      setBusyId('');
    }
  };

  const saveMaterials = async (assemblyId) => {
    setBusyId(`mat-${assemblyId}`);
    setError('');
    try {
      const lines = (materialDrafts[assemblyId] || [])
        .filter((l) => String(l.material_assembly_id || '').trim())
        .map((l) => applyStoreroomMaterialUomToLine(l, materialOptions));
      await postCarpentryCatalog({
        op: 'save-materials',
        assembly_id: assemblyId,
        materials: lines,
      });
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to save materials');
    } finally {
      setBusyId('');
    }
  };

  const updateMaterialLine = (productId, index, patch) => {
    setMaterialDrafts((prev) => {
      const lines = [...(prev[productId] || [emptyMaterial()])];
      const next = { ...lines[index], ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'material_assembly_id')) {
        next.uom = uomFromStoreroomMaterial(materialOptions, patch.material_assembly_id);
      }
      lines[index] = next;
      return { ...prev, [productId]: lines };
    });
  };

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>Carpentry</h1>
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        Choose warehouse products from <strong>Warehouse Floor 1</strong> (
        <code>/warehouse-products</code>
        {' '}
        catalog). The carpentry app manufactures from this list; output WIP goes to{' '}
        <strong>Warehouse Floor 2</strong> only. Sets are added via their components — search a set, open{' '}
        <strong>Components</strong>
        ). Define BOM materials from <strong>Storeroom 1–3</strong> (shared with upholstery); manufacturing deducts storeroom qty.
      </p>
      {carpentryLocations.length < 3 ? (
        <p style={{ color: '#b45309', marginBottom: 12 }}>
          Run <code>node scripts/seedCarpentryWarehouseLocations.js</code> to create Carpentry Warehouse 1–3 in Inventory locations.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="carpentry-add-search-wrap" style={{ marginBottom: 0, flex: '1 1 340px' }}>
          <input
            className="kitwe-search-input carpentry-add-search-input"
            style={{ width: '100%', maxWidth: 520, minWidth: 340 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU or name to add a product…"
            autoComplete="off"
          />
          {search.trim() ? (
            <ul id="carpentry-add-dropdown" className="carpentry-add-dropdown">
              {matchingSets.map((set) => {
                const open = expandedSetId === String(set.id);
                const missing = (set.components || []).filter((c) => !selectedProductIds.has(String(c.id)));
                const setBusy = String(busyId).startsWith('batch-') || busyId === String(set.id);
                return (
                  <li key={`set-${set.id}`} className="carpentry-add-dropdown__item upholstery-add-set" role="presentation">
                    <div className="carpentry-add-dropdown__item">
                      <div className="carpentry-add-dropdown__meta">
                        <span className="carpentry-add-dropdown__sku">{set.family_sku || '—'}</span>
                        <span className="carpentry-add-dropdown__name">
                          {set.name}
                          {' '}
                          <span className="warehouse-kind-badge warehouse-kind-badge--set">Set</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="kitwe-btn-compact"
                        disabled={setBusy}
                        onClick={() => setExpandedSetId(open ? '' : String(set.id))}
                      >
                        {open ? 'Hide' : 'Components'}
                      </button>
                    </div>
                    {open ? (
                      <ul className="upholstery-set-component-list">
                        {missing.length ? (
                          <li className="upholstery-set-component-list__actions">
                            <button
                              type="button"
                              className="kitwe-btn-create-set kitwe-btn-compact"
                              disabled={setBusy}
                              onClick={() => addProducts(missing.map((c) => c.id))}
                            >
                              Add all missing ({missing.length})
                            </button>
                          </li>
                        ) : null}
                        {(set.components || []).map((comp) => {
                          const inCatalog = selectedProductIds.has(String(comp.id));
                          return (
                            <li key={comp.id} className="carpentry-add-dropdown__item upholstery-set-component-list__row">
                              <div className="carpentry-add-dropdown__meta">
                                <span className="carpentry-add-dropdown__sku">{comp.family_sku || '—'}</span>
                                <span className="carpentry-add-dropdown__name">
                                  {comp.qty_per_set > 1 ? `${comp.qty_per_set}× ` : ''}
                                  {comp.name}
                                </span>
                              </div>
                              {inCatalog ? (
                                <span className="upholstery-set-component-list__added">In catalog</span>
                              ) : (
                                <button
                                  type="button"
                                  className="kitwe-btn-create-set kitwe-btn-compact"
                                  disabled={busyId === String(comp.id) || setBusy}
                                  onClick={() => addProduct(comp.id)}
                                >
                                  {busyId === String(comp.id) ? '…' : 'Add'}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
              {candidateRows.length ? candidateRows.slice(0, 40).map((row) => (
                <li key={row.id} className="carpentry-add-dropdown__item">
                  <div className="carpentry-add-dropdown__meta">
                    <span className="carpentry-add-dropdown__sku">{row.family_sku || '—'}</span>
                    <span className="carpentry-add-dropdown__name">{row.name}</span>
                  </div>
                  <button
                    type="button"
                    className="kitwe-btn-create-set kitwe-btn-compact"
                    disabled={busyId === String(row.id)}
                    onClick={() => addProduct(row.id)}
                  >
                    {busyId === String(row.id) ? '…' : 'Add'}
                  </button>
                </li>
              )) : null}
              {!candidateRows.length && !matchingSets.length ? (
                <li className="carpentry-add-dropdown__empty">No matching warehouse products or sets.</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div style={{ flex: '1 1 340px' }}>
          <CategoryRemainingChecklist
            categories={categories}
            candidates={candidates}
            setCandidates={warehouseSetCandidates}
            existingProductIds={selectedProductIds}
            busy={Boolean(busyId)}
            selectPlaceholder="Select category to add remaining…"
            addButtonLabel="Add selected to Carpentry"
            onAddSelected={(ids) => addProducts(ids)}
          />
        </div>
      </div>

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      <h2 style={{ fontSize: '1.1rem', marginTop: 24 }}>Carpentry catalog (workshop view)</h2>
      <div className="kitwe-catalog-table-wrap">
        <table className="kitwe-catalog-table">
          <thead>
            <tr>
              <th className="col-sku">SKU</th>
              <th className="col-product">Product</th>
              <th className="col-actions">Materials</th>
            </tr>
          </thead>
          <tbody>
            {catalogRows.length ? catalogRows.map((row) => {
              const open = expandedId === row.id;
              const lines = materialDrafts[row.id] || [emptyMaterial()];
              return (
                <React.Fragment key={row.id}>
                  <tr>
                    <td className="col-sku">{row.family_sku || '—'}</td>
                    <td className="col-product"><strong>{row.name}</strong></td>
                    <td className="col-actions">
                      <div className="kitwe-row-actions">
                        <button
                          type="button"
                          className="kitwe-btn-secondary kitwe-btn-compact"
                          onClick={() => setExpandedId(open ? '' : row.id)}
                        >
                          {open ? 'Close' : 'Edit BOM'}
                        </button>
                        <button
                          type="button"
                          className="kitwe-btn-secondary kitwe-btn-compact"
                          disabled={busyId === row.id}
                          onClick={() => removeProduct(row.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={3} style={{ background: 'var(--kitwe-panel-bg, #f8fafc)', padding: 16 }}>
                        <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--kitwe-muted)' }}>
                          Materials per unit — pick storeroom materials (create on each storeroom page).
                        </p>
                        {lines.map((line, index) => (
                          <div key={index} className="kitwe-component-row">
                            <select
                              className="kitwe-form-control kitwe-form-control--product"
                              value={line.material_assembly_id}
                              onChange={(e) => updateMaterialLine(row.id, index, { material_assembly_id: e.target.value })}
                            >
                              <option value="">Material…</option>
                              {materialOptions.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                  {' '}
                                  (
                                  {m.family_sku || 'SKU'}
                                  ·
                                  {' '}
                                  {m.default_uom || 'no UOM'}
                                  ·
                                  {' '}
                                  {m.storeroom_qty}
                                  {' '}
                                  in storerooms)
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="kitwe-form-control kitwe-form-control--qty"
                              value={line.quantity}
                              onChange={(e) => updateMaterialLine(row.id, index, { quantity: e.target.value })}
                            />
                            <input
                              type="text"
                              className="kitwe-form-control"
                              readOnly
                              tabIndex={-1}
                              value={labelForMaterialUom(
                                uomFromStoreroomMaterial(materialOptions, line.material_assembly_id)
                                  || line.uom,
                                uomOptions,
                              )}
                              title="Unit of measure from the storeroom material"
                              placeholder="Pick material…"
                            />
                            <select
                              className="kitwe-form-control"
                              value={line.warehouse_location_id || ''}
                              onChange={(e) => updateMaterialLine(row.id, index, { warehouse_location_id: e.target.value })}
                            >
                              <option value="">Any warehouse (1→2→3)</option>
                              {carpentryLocations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="kitwe-btn-secondary"
                              onClick={() => setMaterialDrafts((prev) => ({
                                ...prev,
                                [row.id]: (prev[row.id] || []).filter((_, i) => i !== index),
                              }))}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <div className="kitwe-create-form-actions">
                          <button
                            type="button"
                            className="kitwe-btn-secondary"
                            onClick={() => setMaterialDrafts((prev) => ({
                              ...prev,
                              [row.id]: [...(prev[row.id] || []), emptyMaterial()],
                            }))}
                          >
                            Add material
                          </button>
                          <button
                            type="button"
                            className="kitwe-btn-create-set"
                            disabled={busyId === `mat-${row.id}`}
                            onClick={() => saveMaterials(row.id)}
                          >
                            {busyId === `mat-${row.id}` ? 'Saving…' : 'Save materials'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            }) : (
              <tr>
                <td colSpan={3} className="kitwe-empty-hint">No carpentry products yet — search above to add from Warehouse Floor 1.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
