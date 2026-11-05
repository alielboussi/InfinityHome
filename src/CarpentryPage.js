import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import './kitwe-catalog-page.css';
import { resolveCarpentryWarehouseLocations } from './constants/carpentryWarehouses';
import { useMaterialUomOptions } from './hooks/useMaterialUomOptions';
import {
  fetchCarpentryCatalog,
  postCarpentryCatalog,
} from './services/carpentryCatalogApi';
import { getCachedCarpentryCatalog } from './utils/productionPortalCatalogCache';
import {
  applyStoreroomMaterialUomToLine,
  uomFromStoreroomMaterial,
} from './utils/storeroomBomLineUom';
import CategoryRemainingChecklist from './components/CategoryRemainingChecklist';
import { groupKitweCatalogByFamilyBase } from './utils/groupKitweCatalogByFamilyBase';
import { buildKitweCrossPortalImageLookup } from './utils/kitweCatalogFamilyCardImage';
import KitweCatalogFamilyGrid from './components/KitweCatalogFamilyGrid';
import CatalogProductBomEditor from './components/CatalogProductBomEditor';

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
  const [upholsteryProducts, setUpholsteryProducts] = useState(() => initialCached?.upholsteryProducts || []);
  const [expandedId, setExpandedId] = useState('');
  const [inlayFamilyKey, setInlayFamilyKey] = useState('');
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
    setUpholsteryProducts(catalog.upholsteryProducts || []);
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

  const catalogFamilyGroups = useMemo(
    () => groupKitweCatalogByFamilyBase(carpentryProducts),
    [carpentryProducts],
  );

  const catalogImageLookup = useMemo(
    () => buildKitweCrossPortalImageLookup(carpentryProducts, upholsteryProducts),
    [carpentryProducts, upholsteryProducts],
  );

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

  const renderCatalogInlay = (group) => (
    <div className="floor2-inlay-panel__table-wrap">
      <table className="kitwe-catalog-table kitwe-catalog-table--upholstery">
        <thead>
          <tr>
            <th style={{ width: '18%' }}>SKU</th>
            <th style={{ width: '46%' }}>Product</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(group.items || []).map((row) => {
            const open = expandedId === row.id;
            const lines = materialDrafts[row.id] || [emptyMaterial()];
            return (
              <React.Fragment key={row.id}>
                <tr>
                  <td className="col-sku">{row.family_sku || '—'}</td>
                  <td><strong>{row.name}</strong></td>
                  <td className="col-actions">
                    <div className="kitwe-row-actions">
                      <button
                        type="button"
                        className="kitwe-btn-secondary kitwe-btn-compact"
                        onClick={() => setExpandedId(open ? '' : row.id)}
                      >
                        {open ? 'Close BOM' : `Edit BOM (${(row.materials || []).length})`}
                      </button>
                      <button
                        type="button"
                        className="kitwe-btn-secondary kitwe-btn-compact kitwe-btn-danger"
                        disabled={busyId === row.id}
                        onClick={() => removeProduct(row.id)}
                      >
                        {busyId === row.id ? '…' : 'Remove'}
                      </button>
                    </div>
                  </td>
                </tr>
                {open ? (
                  <tr>
                    <td colSpan={3} style={{ background: 'var(--kitwe-panel-bg, #f8fafc)', padding: 16 }}>
                      <CatalogProductBomEditor
                        row={row}
                        lines={lines}
                        materialOptions={materialOptions}
                        uomOptions={uomOptions}
                        storeroomLocations={carpentryLocations}
                        busyId={busyId}
                        bomHint="Storeroom materials per unit of product (deducted on carpentry manufacture)."
                        onUpdateLine={(index, patch) => updateMaterialLine(row.id, index, patch)}
                        onRemoveLine={(index) => setMaterialDrafts((prev) => ({
                          ...prev,
                          [row.id]: (prev[row.id] || []).filter((_, i) => i !== index),
                        }))}
                        onAddLine={() => setMaterialDrafts((prev) => ({
                          ...prev,
                          [row.id]: [...(prev[row.id] || []), emptyMaterial()],
                        }))}
                        onSave={() => saveMaterials(row.id)}
                      />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>Carpentry</h1>
      {carpentryLocations.length < 3 ? (
        <p style={{ color: '#b45309', marginBottom: 12 }}>
          Run <code>node scripts/seedCarpentryWarehouseLocations.js</code> for Storeroom 1–3 locations.
        </p>
      ) : null}

      <div className="kitwe-catalog-add-toolbar kitwe-catalog-add-toolbar--inline-row">
        <div className="carpentry-add-search-wrap kitwe-catalog-add-toolbar__search">
          <input
            className="kitwe-search-input carpentry-add-search-input"
            style={{ width: '100%' }}
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

        <CategoryRemainingChecklist
          toolbarInline
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

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      <KitweCatalogFamilyGrid
        title="Carpentry catalog"
        groups={catalogFamilyGroups}
        imageLookup={catalogImageLookup}
        inlayFamilyKey={inlayFamilyKey}
        onInlayFamilyKeyChange={setInlayFamilyKey}
        emptyHint="No carpentry products yet — search above to add from Warehouse Floor 1."
        inlayIntro="Edit BOM materials or remove variants from the carpentry workshop catalog."
        renderInlayContent={renderCatalogInlay}
      />
    </div>
  );
}
