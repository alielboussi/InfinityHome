import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { resolveCarpentryWarehouseLocations } from './constants/carpentryWarehouses';
import { useMaterialUomOptions } from './hooks/useMaterialUomOptions';
import { fetchCarpentryCatalog } from './services/carpentryCatalogApi';
import {
  fetchUpholsteryCatalog,
  postUpholsteryCatalog,
} from './services/upholsteryCatalogApi';

const emptyMaterial = () => ({
  material_assembly_id: '',
  quantity: 1,
  uom: '',
  warehouse_location_id: '',
});

export default function UpholsteryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [warehouseSetCandidates, setWarehouseSetCandidates] = useState([]);
  const [upholsteryProducts, setUpholsteryProducts] = useState([]);
  const [carpentryProducts, setCarpentryProducts] = useState([]);
  const [storeroomMaterials, setStoreroomMaterials] = useState([]);
  const [carpentryLocations, setCarpentryLocations] = useState([]);
  const [materialDrafts, setMaterialDrafts] = useState({});
  const [expandedId, setExpandedId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [expandedSetId, setExpandedSetId] = useState('');

  const { options: uomOptions, defaultUom } = useMaterialUomOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: locs }, catalog, carpentry] = await Promise.all([
        db.from('locations').select('id, name').order('name'),
        fetchUpholsteryCatalog(),
        fetchCarpentryCatalog().catch(() => ({ carpentryProducts: [] })),
      ]);
      setCarpentryLocations(resolveCarpentryWarehouseLocations(locs || []));
      setCandidates(catalog.candidates || []);
      setWarehouseSetCandidates(catalog.setCandidates || []);
      setStoreroomMaterials(catalog.storeroomMaterials || []);
      setUpholsteryProducts(catalog.upholsteryProducts || []);
      setCarpentryProducts(carpentry.carpentryProducts || []);
      const drafts = {};
      (catalog.upholsteryProducts || []).forEach((p) => {
        drafts[p.id] = (p.materials || []).length
          ? p.materials.map((m) => ({ ...m, warehouse_location_id: m.warehouse_location_id || '' }))
          : [emptyMaterial()];
      });
      setMaterialDrafts(drafts);
    } catch (err) {
      setError(err?.message || 'Failed to load Upholstery catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const carpentryById = useMemo(
    () => new Map((carpentryProducts || []).map((p) => [String(p.id), p])),
    [carpentryProducts],
  );

  const selectedProductIds = useMemo(
    () => new Set(upholsteryProducts.map((p) => String(p.id))),
    [upholsteryProducts],
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

  const materialOptions = useMemo(
    () => (storeroomMaterials || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [storeroomMaterials],
  );

  const addProducts = async (assemblyIds) => {
    const ids = [...new Set((assemblyIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return;
    setBusyId(`batch-${ids[0]}`);
    setError('');
    try {
      for (const assemblyId of ids) {
        if (selectedProductIds.has(assemblyId)) continue;
        await postUpholsteryCatalog({ op: 'save-product', assembly_id: assemblyId, selected: true });
      }
      setSearch('');
      setExpandedSetId('');
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to add products');
    } finally {
      setBusyId('');
    }
  };

  const addProduct = async (assemblyId) => {
    setBusyId(String(assemblyId));
    setError('');
    try {
      await postUpholsteryCatalog({ op: 'save-product', assembly_id: assemblyId, selected: true });
      setSearch('');
      setExpandedSetId('');
      await load();
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
      await postUpholsteryCatalog({ op: 'save-product', assembly_id: assemblyId, selected: false });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to remove product');
    } finally {
      setBusyId('');
    }
  };

  const saveRawLink = async (finishedId, rawAssemblyId) => {
    setBusyId(`raw-${finishedId}`);
    setError('');
    try {
      await postUpholsteryCatalog({
        op: 'save-raw-link',
        assembly_id: finishedId,
        raw_assembly_id: rawAssemblyId || '',
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to save raw product link');
    } finally {
      setBusyId('');
    }
  };

  const saveMaterials = async (assemblyId) => {
    setBusyId(`mat-${assemblyId}`);
    setError('');
    try {
      const lines = (materialDrafts[assemblyId] || []).filter(
        (l) => String(l.material_assembly_id || '').trim(),
      );
      await postUpholsteryCatalog({
        op: 'save-materials',
        assembly_id: assemblyId,
        materials: lines,
      });
      await load();
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
      if (patch.material_assembly_id && !patch.uom) {
        const mat = materialOptions.find((m) => String(m.id) === String(patch.material_assembly_id));
        if (mat?.default_uom) next.uom = mat.default_uom;
        else if (defaultUom && !next.uom) next.uom = defaultUom;
      }
      lines[index] = next;
      return { ...prev, [productId]: lines };
    });
  };

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>Upholstery</h1>
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        Add finished products from <strong>Warehouse Floor 1</strong> (
        <code>/warehouse-products</code>
        ). Sets cannot be added as a whole — search a set, open
        {' '}
        <strong>Components</strong>
        , then add each line individually. Link each row to a <strong>raw carpentry product</strong>
        on Floor 2. Define <strong>storeroom BOM</strong> (fabric, foam, etc.) per finished product; upholstery manufacture
        deducts those materials from Storerooms 1–3 plus raw from Floor 2, then credits Floor 1 for Send Delivery.
      </p>
      {carpentryLocations.length < 3 ? (
        <p style={{ color: '#b45309', marginBottom: 12 }}>
          Run <code>node scripts/seedCarpentryWarehouseLocations.js</code> for Storeroom 1–3 locations.
        </p>
      ) : null}
      {!loading && !storeroomMaterials.length ? (
        <p style={{ color: '#b45309', marginBottom: 12 }}>
          No storeroom stock yet — create UOMs and materials on Storeroom 1–3 before defining upholstery BOM lines.
        </p>
      ) : null}
      {!loading && !uomOptions.length ? (
        <p style={{ color: '#b45309', marginBottom: 12 }}>
          Add units of measure on <strong>Materials → Units of measure</strong> before saving BOM lines.
        </p>
      ) : null}

      <div className="carpentry-add-search-wrap">
        <input
          className="kitwe-search-input carpentry-add-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU or name to add a finished product…"
          aria-expanded={Boolean(search.trim())}
          aria-controls="upholstery-add-dropdown"
          autoComplete="off"
        />
        {search.trim() ? (
          <ul id="upholstery-add-dropdown" className="carpentry-add-dropdown" role="listbox">
            {matchingSets.map((set) => {
              const open = expandedSetId === String(set.id);
              const missing = (set.components || []).filter((c) => !selectedProductIds.has(String(c.id)));
              const setBusy = String(busyId).startsWith('batch-') || busyId === String(set.id);
              return (
                <li key={`set-${set.id}`} className="carpentry-add-dropdown__item upholstery-add-set" role="presentation">
                  <div className="carpentry-add-dropdown__item" role="option">
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
              <li key={row.id} className="carpentry-add-dropdown__item" role="option">
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

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      <h2 style={{ fontSize: '1.1rem', marginTop: 24 }}>Upholstery catalog</h2>
      <div className="kitwe-catalog-table-wrap">
        <table className="kitwe-catalog-table">
          <thead>
            <tr>
              <th>Finished SKU</th>
              <th>Finished name</th>
              <th>Raw carpentry product</th>
              <th className="col-actions">Materials</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {upholsteryProducts.length ? upholsteryProducts.map((row) => {
              const rawId = String(row.raw_assembly_id || '');
              const raw = rawId ? carpentryById.get(rawId) : null;
              const open = expandedId === row.id;
              const lines = materialDrafts[row.id] || [emptyMaterial()];
              return (
                <React.Fragment key={row.id}>
                  <tr>
                    <td>{row.family_sku || '—'}</td>
                    <td>{row.name}</td>
                    <td>
                      <select
                        className="kitwe-search-input"
                        style={{ maxWidth: 320, width: '100%' }}
                        value={rawId}
                        disabled={busyId === `raw-${row.id}`}
                        onChange={(e) => saveRawLink(row.id, e.target.value)}
                      >
                        <option value="">— Select raw product —</option>
                        {(carpentryProducts || []).map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            {cp.family_sku || '—'}
                            {' · '}
                            {cp.name}
                          </option>
                        ))}
                      </select>
                      {raw ? (
                        <div style={{ fontSize: 12, color: 'var(--kitwe-muted, #64748b)', marginTop: 4 }}>
                          Linked: {raw.family_sku} — {raw.name}
                        </div>
                      ) : null}
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="kitwe-btn-secondary kitwe-btn-compact"
                        onClick={() => setExpandedId(open ? '' : row.id)}
                      >
                        {open ? 'Close' : 'Edit BOM'}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="kitwe-btn-compact"
                        disabled={busyId === row.id}
                        onClick={() => removeProduct(row.id)}
                      >
                        {busyId === row.id ? '…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--kitwe-panel-bg, #f8fafc)', padding: 16 }}>
                        <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--kitwe-muted)' }}>
                          Storeroom materials per unit of finished product (deducted on upholstery manufacture).
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
                            <select
                              className="kitwe-form-control"
                              value={line.uom || ''}
                              onChange={(e) => updateMaterialLine(row.id, index, { uom: e.target.value })}
                            >
                              <option value="">UOM…</option>
                              {uomOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <select
                              className="kitwe-form-control"
                              value={line.warehouse_location_id || ''}
                              onChange={(e) => updateMaterialLine(row.id, index, { warehouse_location_id: e.target.value })}
                            >
                              <option value="">Any storeroom (1→2→3)</option>
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
                <td colSpan={5} className="kitwe-empty-hint">
                  No upholstery products yet — search above to add from Warehouse Floor 1.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
