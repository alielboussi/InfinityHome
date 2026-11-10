import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import db from './dataClient';
import './kitwe-catalog-page.css';
import { CARPENTRY_WAREHOUSE_NAMES, storeroomLabelForWarehouseIndex } from './constants/carpentryWarehouses';
import { parseStoreroomMaterialMeta } from './utils/productionPortalCatalog';
import { generateRandomWarehouseSku16, WAREHOUSE_RANDOM_SKU_LENGTH } from './utils/warehouseRandomSku';
import { useMaterialUomOptions } from './hooks/useMaterialUomOptions';
import { labelFromMaterialUomCode } from './constants/carpentryUom';
import {
  postStoreroomCreate,
  postStoreroomDeleteStock,
  postStoreroomLookupSku,
  postStoreroomSetStock,
  postStoreroomUpdateMaterial,
} from './services/carpentryCatalogApi';
import { normalizeWarehouseProductSku } from './utils/warehouseScanResolver';

function isStoreroomMaterialAssembly(assembly) {
  return assembly?.metadata?.storeroom?.is_storeroom_material === true;
}

export default function CarpentryWarehouseStockPage({ warehouseIndexOverride, embedInHub = false } = {}) {
  const { index } = useParams();
  const warehouseIndex = warehouseIndexOverride != null ? Number(warehouseIndexOverride) : Number(index);
  const indexValid = Number.isFinite(warehouseIndex) && warehouseIndex >= 1 && warehouseIndex <= 3;
  const locationName = indexValid ? CARPENTRY_WAREHOUSE_NAMES[warehouseIndex - 1] : '';
  const pageTitle = storeroomLabelForWarehouseIndex(warehouseIndex) || locationName;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationId, setLocationId] = useState('');
  const [rows, setRows] = useState([]);
  const [materialName, setMaterialName] = useState('');
  const [materialSku, setMaterialSku] = useState(() => generateRandomWarehouseSku16());
  const [createQty, setCreateQty] = useState('1');
  const [createUom, setCreateUom] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [stockBusyId, setStockBusyId] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [stockPickId, setStockPickId] = useState('');
  const [stockPickQty, setStockPickQty] = useState('1');
  const [stockSearchRows, setStockSearchRows] = useState([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState(null);
  const [notice, setNotice] = useState('');
  const [skuLinkHint, setSkuLinkHint] = useState('');
  const [skuLookupBusy, setSkuLookupBusy] = useState(false);

  const { options: uomOptions, defaultUom, loading: uomLoading } = useMaterialUomOptions();

  useEffect(() => {
    if (defaultUom && !createUom) setCreateUom(defaultUom);
  }, [defaultUom, createUom]);

  const load = useCallback(async () => {
    if (!indexValid || !locationName) return;
    setLoading(true);
    setError('');
    try {
      const { data: locs, error: locErr } = await db.from('locations').select('id, name');
      if (locErr) throw new Error(locErr.message || 'Failed to load locations');
      const loc = (locs || []).find((l) => String(l.name || '').trim() === locationName);
      if (!loc?.id) {
        setError(`Location "${locationName}" not found. Run node scripts/seedCarpentryWarehouseLocations.js`);
        setRows([]);
        return;
      }
      setLocationId(String(loc.id));
      const { data: inv, error: invErr } = await db
        .from('warehouse_assembly_inventory')
        .select('assembly_id, quantity')
        .eq('location_id', loc.id);
      if (invErr) throw new Error(invErr.message || 'Failed to load stock');
      const invRows = inv || [];
      const ids = [...new Set(invRows.map((r) => r.assembly_id).filter(Boolean))];
      let assemblyById = new Map();
      if (ids.length) {
        const { data: assemblies, error: aErr } = await db
          .from('warehouse_assemblies')
          .select('id, name, family_sku, metadata')
          .in('id', ids);
        if (aErr) throw new Error(aErr.message || 'Failed to load products');
        assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
      }
      const tableRows = invRows
        .map((r) => {
          const asm = assemblyById.get(String(r.assembly_id));
          if (!asm || !isStoreroomMaterialAssembly(asm)) return null;
          const uom = parseStoreroomMaterialMeta(asm).default_uom;
          return {
            assembly_id: r.assembly_id,
            quantity: Number(r.quantity) || 0,
            sku: asm?.family_sku || '—',
            name: asm?.name || r.assembly_id,
            default_uom: uom,
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setRows(tableRows);
      const drafts = {};
      tableRows.forEach((row) => {
        drafts[String(row.assembly_id)] = String(row.quantity);
      });
      setQtyDrafts(drafts);
    } catch (err) {
      setError(err?.message || 'Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [indexValid, locationName]);

  useEffect(() => {
    if (indexValid) load();
  }, [indexValid, load]);

  useEffect(() => {
    const q = stockSearch.trim().toLowerCase();
    if (q.length < 2) {
      setStockSearchRows([]);
      return undefined;
    }
    let cancelled = false;
    setStockSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error: qErr } = await db
          .from('warehouse_assemblies')
          .select('id, name, family_sku, metadata')
          .order('name')
          .limit(500);
        if (qErr) throw new Error(qErr.message || 'Search failed');
        const filtered = (data || [])
          .filter((a) => isStoreroomMaterialAssembly(a))
          .filter((a) => String(a.name || '').toLowerCase().includes(q)
            || String(a.family_sku || '').toLowerCase().includes(q))
          .slice(0, 12);
        if (!cancelled) setStockSearchRows(filtered);
      } catch {
        if (!cancelled) setStockSearchRows([]);
      } finally {
        if (!cancelled) setStockSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stockSearch]);

  const saveRowQty = async (assemblyId) => {
    if (!locationId) return;
    setStockBusyId(String(assemblyId));
    setError('');
    try {
      await postStoreroomSetStock({
        assembly_id: assemblyId,
        location_id: locationId,
        quantity: qtyDrafts[assemblyId],
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to update stock');
    } finally {
      setStockBusyId('');
    }
  };

  const startEditRow = (row) => {
    const id = String(row.assembly_id);
    setNotice('');
    setEditingId(id);
    setEditDraft({
      sku: row.sku === '—' ? '' : String(row.sku || ''),
      name: String(row.name || ''),
      uom: String(row.default_uom || defaultUom || ''),
      qty: String(qtyDrafts[id] ?? row.quantity ?? ''),
    });
  };

  const cancelEditRow = () => {
    setEditingId('');
    setEditDraft(null);
  };

  const saveEditRow = async (row) => {
    if (!locationId || !editDraft) return;
    const id = String(row.assembly_id);
    setStockBusyId(`edit-${id}`);
    setError('');
    setNotice('');
    try {
      const result = await postStoreroomUpdateMaterial({
        assembly_id: id,
        location_id: locationId,
        name: editDraft.name.trim(),
        family_sku: editDraft.sku.trim().toUpperCase(),
        default_uom: editDraft.uom,
        quantity: editDraft.qty,
        apply_to_same_sku: true,
      });
      const count = result?.updated_assembly_ids?.length || 1;
      if (count > 1) {
        setNotice(`Saved. Name, SKU, and UOM were updated on ${count} material records with the same SKU.`);
      }
      cancelEditRow();
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to update material');
    } finally {
      setStockBusyId('');
    }
  };

  const deleteRow = async (row) => {
    if (!locationId) return;
    const id = String(row.assembly_id);
    const label = row.name || row.sku || id;
    if (!window.confirm(
      `Remove "${label}" from ${pageTitle}? The material record stays on file; only stock at this storeroom is cleared.`,
    )) return;
    setStockBusyId(`del-${id}`);
    setError('');
    try {
      await postStoreroomDeleteStock({
        assembly_id: id,
        location_id: locationId,
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to remove material from storeroom');
    } finally {
      setStockBusyId('');
    }
  };

  const submitStockExisting = async (e) => {
    e.preventDefault();
    if (!locationId || !stockPickId) return;
    setStockBusyId(`pick-${stockPickId}`);
    setError('');
    try {
      await postStoreroomSetStock({
        assembly_id: stockPickId,
        location_id: locationId,
        quantity: stockPickQty,
      });
      setStockSearch('');
      setStockPickId('');
      setStockPickQty('1');
      setStockSearchRows([]);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to set stock');
    } finally {
      setStockBusyId('');
    }
  };

  const pickStockMaterial = (assembly) => {
    setStockPickId(String(assembly.id));
    setStockSearch(`${assembly.family_sku || ''} ${assembly.name || ''}`.trim());
    setStockSearchRows([]);
  };

  const regenerateSku = () => {
    setMaterialSku(generateRandomWarehouseSku16());
    setSkuLinkHint('');
  };

  const lookupSkuForCreateForm = useCallback(async (rawSku) => {
    const sku = normalizeWarehouseProductSku(rawSku);
    if (!sku || sku.length < 6) {
      setSkuLinkHint('');
      return;
    }
    setSkuLookupBusy(true);
    try {
      const hit = await postStoreroomLookupSku(sku);
      if (hit?.eligible && hit?.name) {
        setMaterialName(hit.name);
        if (hit.default_uom) setCreateUom((prev) => prev || hit.default_uom);
        setSkuLinkHint(
          `Same SKU as another storeroom — using “${hit.name}”. Saving adds opening qty here only.`,
        );
      } else if (hit?.found && !hit?.eligible) {
        setSkuLinkHint(
          'This SKU belongs to a warehouse product, not a storeroom material. Use a different SKU or add stock via “Stock at this storeroom”.',
        );
      } else {
        setSkuLinkHint('');
      }
    } catch {
      setSkuLinkHint('');
    } finally {
      setSkuLookupBusy(false);
    }
  }, []);

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!locationId || !materialName.trim()) return;
    setCreateBusy(true);
    setError('');
    try {
      const skuTrim = materialSku.trim();
      const result = await postStoreroomCreate({
        name: materialName.trim(),
        location_id: locationId,
        quantity: createQty,
        default_uom: createUom,
        ...(skuTrim ? { family_sku: skuTrim } : { generate_sku: true }),
      });
      if (result?.linked_existing_storeroom_material) {
        setNotice(`Linked existing material “${result.name || materialName}” — stock updated at ${pageTitle}.`);
      }
      setMaterialName('');
      setMaterialSku(generateRandomWarehouseSku16());
      setCreateQty('1');
      setCreateUom(defaultUom || '');
      setSkuLinkHint('');
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to create material');
    } finally {
      setCreateBusy(false);
    }
  };

  const totalQty = useMemo(
    () => rows.reduce((sum, r) => sum + r.quantity, 0),
    [rows],
  );

  const uomLabelByCode = useMemo(() => {
    const map = new Map();
    (uomOptions || []).forEach((opt) => {
      if (opt?.value) map.set(String(opt.value), String(opt.label || opt.value));
    });
    return map;
  }, [uomOptions]);

  const formatUomLabel = (code) => {
    const key = String(code || '').trim();
    if (!key) return '—';
    return uomLabelByCode.get(key) || labelFromMaterialUomCode(key) || key;
  };

  if (!indexValid) {
    return <Navigate to="/warehouse-storerooms?room=1" replace />;
  }

  return (
    <div className="kitwe-catalog-page">
      {!embedInHub ? <BackToDashboard /> : null}
      {!embedInHub ? <h1 style={{ marginTop: 16 }}>{pageTitle}</h1> : null}
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        Create raw materials here (name, SKU, qty, UOM). The same SKU on another storeroom links to the
        existing material and sets stock there (one material record, qty per storeroom). Define UOMs first under
        {' '}
        <strong>Materials → Units of measure</strong>
        . Carpentry and upholstery BOMs use this stock. Adjust on-hand qty in the table below.
      </p>

      <section className="kitwe-create-form" style={{ marginBottom: 24, maxWidth: 720 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Create new material</h2>
        <form onSubmit={submitCreate}>
          <div className="kitwe-component-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="kitwe-form-control kitwe-form-control--product"
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              placeholder="Material name"
              required
              autoComplete="off"
            />
          </div>
          <div className="kitwe-component-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="kitwe-form-control"
              style={{ flex: '1 1 200px', fontFamily: 'monospace' }}
              value={materialSku}
              onChange={(e) => {
                setMaterialSku(e.target.value.toUpperCase());
                setSkuLinkHint('');
              }}
              onBlur={() => lookupSkuForCreateForm(materialSku)}
              placeholder={`SKU (${WAREHOUSE_RANDOM_SKU_LENGTH} chars or manual)`}
              autoComplete="off"
            />
            <button
              type="button"
              className="kitwe-btn-secondary"
              onClick={regenerateSku}
            >
              New random SKU
            </button>
          </div>
          {skuLookupBusy ? (
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--kitwe-muted)' }}>Looking up SKU…</p>
          ) : null}
          {skuLinkHint ? (
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--kitwe-primary, #0d9488)' }}>{skuLinkHint}</p>
          ) : null}
          <div className="kitwe-component-row">
            <input
              type="number"
              min={0}
              step="any"
              className="kitwe-form-control kitwe-form-control--qty"
              value={createQty}
              onChange={(e) => setCreateQty(e.target.value)}
              placeholder="Opening qty at this storeroom"
              required
            />
            <select
              className="kitwe-form-control"
              value={createUom}
              onChange={(e) => setCreateUom(e.target.value)}
              required
              disabled={uomLoading || !uomOptions.length}
            >
              <option value="">{uomLoading ? 'Loading UOM…' : 'Choose UOM…'}</option>
              {uomOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="submit"
              className="kitwe-btn-create-set"
              disabled={createBusy || !locationId || !materialName.trim() || !createUom}
            >
              {createBusy ? 'Creating…' : 'Create material'}
            </button>
          </div>
        </form>
      </section>

      <section className="kitwe-create-form" style={{ marginBottom: 24, maxWidth: 720 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Stock at this storeroom</h2>
        <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--kitwe-muted)' }}>
          Search an existing material (created on any storeroom) and set how much is on hand here.
        </p>
        <form onSubmit={submitStockExisting}>
          <div className="carpentry-add-search-wrap" style={{ marginBottom: 12 }}>
            <input
              className="kitwe-search-input carpentry-add-search-input"
              value={stockSearch}
              onChange={(e) => {
                setStockSearch(e.target.value);
                setStockPickId('');
              }}
              placeholder="Search material SKU or name…"
              autoComplete="off"
            />
            {stockSearch.trim().length >= 2 && !stockPickId ? (
              <ul className="carpentry-add-dropdown" role="listbox">
                {stockSearchLoading ? (
                  <li className="carpentry-add-dropdown__item">Searching…</li>
                ) : stockSearchRows.length ? stockSearchRows.map((a) => (
                  <li key={a.id} role="option" aria-selected={stockPickId === String(a.id)}>
                    <button
                      type="button"
                      className="carpentry-add-dropdown__item"
                      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => pickStockMaterial(a)}
                    >
                      <span className="carpentry-add-dropdown__sku">{a.family_sku || '—'}</span>
                      <span className="carpentry-add-dropdown__name">{a.name}</span>
                    </button>
                  </li>
                )) : (
                  <li className="carpentry-add-dropdown__item">No matching materials.</li>
                )}
              </ul>
            ) : null}
          </div>
          <div className="kitwe-component-row">
            <input
              type="number"
              min={0}
              step="any"
              className="kitwe-form-control kitwe-form-control--qty"
              value={stockPickQty}
              onChange={(e) => setStockPickQty(e.target.value)}
              placeholder="Qty on hand"
              required
            />
            <button
              type="submit"
              className="kitwe-btn-create-set"
              disabled={Boolean(stockBusyId) || !stockPickId || !locationId}
            >
              {stockBusyId.startsWith('pick-') ? 'Saving…' : 'Set stock'}
            </button>
          </div>
        </form>
      </section>

      <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>On hand</h2>
      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}
      {notice ? <p style={{ color: '#22c55e', marginBottom: 12 }}>{notice}</p> : null}
      {!loading && !error ? (
        <p style={{ marginBottom: 12 }}>
          <strong>{rows.length}</strong>
          {' '}
          materials ·
          {' '}
          <strong>{totalQty}</strong>
          {' '}
          units total
        </p>
      ) : null}
      <div className="kitwe-catalog-table-wrap kitwe-catalog-table-wrap--storeroom">
        <table className="kitwe-catalog-table kitwe-catalog-table--storeroom">
          <colgroup>
            <col className="kitwe-col-sku" />
            <col className="kitwe-col-product" />
            <col className="kitwe-col-uom" />
            <col className="kitwe-col-qty" />
            <col className="kitwe-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="col-sku">SKU</th>
              <th className="col-product col-material">Material</th>
              <th className="col-uom">UOM</th>
              <th className="col-qty">Qty on hand</th>
              <th className="col-actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => {
              const id = String(row.assembly_id);
              const busy = stockBusyId === id;
              const isEditing = editingId === id && editDraft;
              const rowLocked = Boolean(stockBusyId) && stockBusyId !== id && !stockBusyId.startsWith(`edit-${id}`);
              return (
                <tr key={row.assembly_id}>
                  <td className="col-sku">
                    {isEditing ? (
                      <input
                        type="text"
                        className="kitwe-form-control"
                        value={editDraft.sku}
                        onChange={(e) => setEditDraft((d) => ({ ...d, sku: e.target.value.toUpperCase() }))}
                        autoComplete="off"
                      />
                    ) : (
                      row.sku
                    )}
                  </td>
                  <td className="col-product col-material">
                    {isEditing ? (
                      <input
                        type="text"
                        className="kitwe-form-control kitwe-form-control--product"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                        autoComplete="off"
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="col-uom">
                    {isEditing ? (
                      <select
                        className="kitwe-form-control"
                        value={editDraft.uom}
                        onChange={(e) => setEditDraft((d) => ({ ...d, uom: e.target.value }))}
                        disabled={uomLoading || !uomOptions.length}
                      >
                        {uomOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      formatUomLabel(row.default_uom)
                    )}
                  </td>
                  <td className="col-qty">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="kitwe-form-control kitwe-form-control--qty"
                        value={editDraft.qty}
                        onChange={(e) => setEditDraft((d) => ({ ...d, qty: e.target.value }))}
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="kitwe-form-control kitwe-form-control--qty"
                        value={qtyDrafts[id] ?? String(row.quantity)}
                        onChange={(e) => setQtyDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                        disabled={Boolean(editingId)}
                      />
                    )}
                  </td>
                  <td className="col-actions">
                    <div className="kitwe-row-actions">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="kitwe-btn-secondary kitwe-btn-compact"
                            disabled={stockBusyId === `edit-${id}`}
                            onClick={() => saveEditRow(row)}
                          >
                            {stockBusyId === `edit-${id}` ? '…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="kitwe-btn-secondary kitwe-btn-compact"
                            disabled={Boolean(stockBusyId)}
                            onClick={cancelEditRow}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="kitwe-btn-secondary kitwe-btn-compact"
                            disabled={busy || rowLocked || Boolean(editingId)}
                            onClick={() => saveRowQty(id)}
                          >
                            {busy ? '…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="kitwe-btn-secondary kitwe-btn-compact"
                            disabled={rowLocked || Boolean(editingId)}
                            onClick={() => startEditRow(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="kitwe-btn-secondary kitwe-btn-compact kitwe-btn-danger"
                            disabled={stockBusyId === `del-${id}` || rowLocked || Boolean(editingId)}
                            onClick={() => deleteRow(row)}
                          >
                            {stockBusyId === `del-${id}` ? '…' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={5} className="kitwe-empty-hint">
                  {loading ? '…' : 'No materials yet — create one above or set stock for an existing material.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
