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
import {
  catalogProductsAsFlatGroups,
  filterCatalogProductsForSearch,
} from './utils/catalogProductFlatGroups';
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

export default function CarpentryPage({ embedInHub = false } = {}) {
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
    load({ forceFresh: true });
  }, [load]);

  const selectedProductIds = useMemo(
    () => new Set(carpentryProducts.map((p) => String(p.id))),
    [carpentryProducts],
  );

  const catalogFamilyGroups = useMemo(
    () => catalogProductsAsFlatGroups(filterCatalogProductsForSearch(carpentryProducts, search)),
    [carpentryProducts, search],
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
      await load({ forceFresh: true });
    } catch (err) {
      setError(err?.message || 'Failed to add product');
    } finally {
      setBusyId('');
    }
  };

  const removeProduct = async (assemblyId) => {
    const targetId = String(assemblyId);
    const prevCarpentry = carpentryProducts;
    setError('');
    setCarpentryProducts((prev) => prev.filter((p) => String(p.id) !== targetId));
    setBusyId(targetId);
    try {
      await postCarpentryCatalog({ op: 'save-product', assembly_id: targetId, selected: false });
      load({ forceFresh: true });
    } catch (err) {
      setCarpentryProducts(prevCarpentry);
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
                        bomHint="Storeroom materials per unit (deduct on the workshop job via the wrench — manufacture only adds Floor 2 WIP)."
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
      {!embedInHub ? <BackToDashboard /> : null}
      {!embedInHub ? <h1 style={{ marginTop: 16 }}>Carpentry</h1> : null}
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
            placeholder="Search SKU or name to filter catalog…"
            autoComplete="off"
          />
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

      {!loading && search.trim() && catalogFamilyGroups.length === 0 && carpentryProducts.length > 0 ? (
        <p className="kitwe-empty-hint" style={{ marginTop: 8 }}>
          No catalog products match your search.
        </p>
      ) : (
        <KitweCatalogFamilyGrid
          title="Carpentry catalog"
          groups={catalogFamilyGroups}
          imageLookup={catalogImageLookup}
          inlayFamilyKey={inlayFamilyKey}
          onInlayFamilyKeyChange={setInlayFamilyKey}
          emptyHint="No carpentry products yet — search above to add from Warehouse Floor 1."
          inlayIntro="Edit BOM materials or remove variants from the carpentry workshop catalog."
          renderInlayContent={renderCatalogInlay}
          detailColumnLabel="BOM"
          renderRowMeta={(row) => {
            const n = (row.materials || []).length;
            return `${n} material line${n === 1 ? '' : 's'}`;
          }}
        />
      )}
    </div>
  );
}
