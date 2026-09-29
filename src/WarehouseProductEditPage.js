import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import WarehouseColorChip from './components/WarehouseColorChip';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import {
  fetchWarehouseCatalog,
  findOrCreateWarehouseColor,
  saveWarehouseAssembly,
  showroomLocations,
  WAREHOUSE_INVENTORY_MODE,
} from './services/warehouseCatalog';
import {
  analyzeAssemblyPacketBom,
  normalizeWarehouseColorKey,
} from './utils/warehouseAssemblyMath';
import {
  buildPacketAssemblyAssignments,
  normalizeAssemblyPacketRows,
} from './utils/warehouseAssemblyPacketPool';

const KITWE_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const LOCKED_SHOWROOM_LOCATION_IDS = [KITWE_LOCATION_ID, LUSAKA_LOCATION_ID];

const emptyProductForm = {
  name: '',
  family_sku: '',
  category_id: '',
  packet_count: '',
  location_ids: [...LOCKED_SHOWROOM_LOCATION_IDS],
  packet_links: [],
  has_color_variants: false,
  color_ids: [],
  inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
};

export default function WarehouseProductEditPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const isNew = !productId;
  const canManage = useMemo(() => canManageCatalog(getCurrentUser()), []);
  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_assembly_locations',
    'warehouse_assembly_colors',
    'warehouse_assembly_packets',
    'warehouse_colors',
    'categories',
    'locations',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [packets, setPackets] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [assemblyLocations, setAssemblyLocations] = useState([]);
  const [assemblyColors, setAssemblyColors] = useState([]);
  const [variantColors, setVariantColors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [saving, setSaving] = useState(false);
  const [packetPickSearch, setPacketPickSearch] = useState('');
  const [colorDraft, setColorDraft] = useState('');
  const [colorPickBusy, setColorPickBusy] = useState(false);
  const [formReady, setFormReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog();
      setAssemblies(data.assemblies || []);
      setPackets(data.packets);
      setAssemblyPacketRows(data.assemblyPackets || []);
      setAssemblyLocations(data.assemblyLocations);
      setAssemblyColors(data.assemblyColors);
      setVariantColors(data.colors);
      setCategories(data.categories);
      setLocations(data.locations);
      setWarehouseLocationId(data.warehouseLocationId);
      if (!data.warehouseLocationId) {
        setError('No Warehouse location found. Add a location named "Warehouse".');
      }
      if (!isNew) {
        const row = (data.assemblies || []).find((a) => String(a.id) === String(productId));
        if (!row) {
          setError('Product not found.');
          setFormReady(false);
        } else {
          const locIds = (data.assemblyLocations || [])
            .filter((r) => String(r.assembly_id) === String(row.id))
            .map((r) => r.location_id);
          const mergedLinks = normalizeAssemblyPacketRows(data.assemblyPackets, data.packets);
          const packetLinks = mergedLinks
            .filter((link) => String(link.assembly_id) === String(row.id))
            .map((link) => ({
              packet_id: link.packet_id,
              qty_per_unit: Math.max(1, Number(link.qty_per_unit) || 1),
            }));
          const colorIds = (data.assemblyColors || [])
            .filter((r) => String(r.assembly_id) === String(row.id))
            .map((r) => r.color_id);
          setProductForm({
            name: row.name || '',
            family_sku: row.family_sku || '',
            category_id: row.category_id || '',
            packet_count: row.packet_count == null || row.packet_count === ''
              ? ''
              : String(row.packet_count),
            location_ids: locIds,
            packet_links: packetLinks,
            has_color_variants: Boolean(row.has_color_variants),
            color_ids: colorIds,
            inventory_mode: row.inventory_mode === WAREHOUSE_INVENTORY_MODE.PACKETS
              ? WAREHOUSE_INVENTORY_MODE.PACKETS
              : WAREHOUSE_INVENTORY_MODE.FINISHED,
          });
          setFormReady(true);
        }
      } else {
        setProductForm(emptyProductForm);
        setFormReady(true);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [isNew, productId]);

  useEffect(() => {
    if (!canManage) {
      navigate('/warehouse-products', { replace: true });
      return;
    }
    load();
  }, [canManage, load, navigate, rtTick]);

  const sellLocations = useMemo(() => {
    const showroom = showroomLocations(locations, warehouseLocationId);
    const locked = LOCKED_SHOWROOM_LOCATION_IDS.map((id) => {
      const row = (locations || []).find((l) => String(l.id) === String(id));
      return row || { id, name: String(id) === KITWE_LOCATION_ID ? 'Kitwe' : 'Lusaka' };
    });
    const lockedIds = new Set(LOCKED_SHOWROOM_LOCATION_IDS.map(String));
    const extra = showroom.filter((loc) => !lockedIds.has(String(loc.id)));
    return [...locked, ...extra];
  }, [locations, warehouseLocationId]);

  const editingProductId = isNew ? null : productId;

  const toggleProductLocation = (locationId, checked) => {
    if (LOCKED_SHOWROOM_LOCATION_IDS.some((id) => String(id) === String(locationId))) {
      return;
    }
    setProductForm((f) => ({
      ...f,
      location_ids: checked
        ? [...f.location_ids, locationId]
        : f.location_ids.filter((id) => String(id) !== String(locationId)),
    }));
  };

  const linkedPacketIds = useMemo(
    () => new Set((productForm.packet_links || []).map((l) => String(l.packet_id))),
    [productForm.packet_links],
  );

  const packetAssignmentsByPacketId = useMemo(
    () => buildPacketAssemblyAssignments(assemblyPacketRows, packets, assemblies),
    [assemblyPacketRows, packets, assemblies],
  );

  const packetPickSearchBuckets = useMemo(() => {
    const q = packetPickSearch.trim().toLowerCase();
    if (!q) return { addable: [], shared: [], alreadyLinked: [] };
    const matches = (packets || []).filter(
      (p) => String(p.sku || '').toLowerCase().includes(q)
        || String(p.name || '').toLowerCase().includes(q),
    );
    const addable = [];
    const shared = [];
    const alreadyLinked = [];
    const pid = editingProductId ? String(editingProductId) : null;
    matches.forEach((p) => {
      if (linkedPacketIds.has(String(p.id))) {
        alreadyLinked.push(p);
        return;
      }
      const owners = (packetAssignmentsByPacketId.get(String(p.id)) || [])
        .filter((a) => !pid || String(a.id) !== pid);
      if (owners.length) shared.push({ packet: p, owners });
      else addable.push(p);
    });
    return {
      addable: addable.slice(0, 12),
      shared: shared.slice(0, 8),
      alreadyLinked: alreadyLinked.slice(0, 4),
    };
  }, [packetPickSearch, packets, editingProductId, linkedPacketIds, packetAssignmentsByPacketId]);

  const packetPickSearchResults = packetPickSearchBuckets.addable;

  const linkedPacketsForForm = useMemo(() => {
    const byId = new Map((packets || []).map((p) => [String(p.id), p]));
    return (productForm.packet_links || [])
      .map((link) => {
        const packet = byId.get(String(link.packet_id));
        if (!packet) return null;
        return {
          link,
          packet,
          qty_per_unit: Math.max(1, Number(link.qty_per_unit) || 1),
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.packet.packet_number) - Number(b.packet.packet_number));
  }, [packets, productForm.packet_links]);

  const productFormBomPreview = useMemo(() => {
    const required = Number(productForm.packet_count);
    if (!Number.isFinite(required) || required < 1) return null;
    const selected = linkedPacketsForForm.map((row) => ({
      ...row.packet,
      qty_per_unit: row.qty_per_unit,
    }));
    return analyzeAssemblyPacketBom(required, selected);
  }, [linkedPacketsForForm, productForm.packet_count]);

  const addPacketToProduct = (id) => {
    const packetId = String(id);
    if (!packetId || linkedPacketIds.has(packetId)) return;
    setProductForm((f) => ({
      ...f,
      packet_links: [...(f.packet_links || []), { packet_id: packetId, qty_per_unit: 1 }],
    }));
  };

  const removePacketFromProduct = (packetId) => {
    setProductForm((f) => ({
      ...f,
      packet_links: (f.packet_links || []).filter((l) => String(l.packet_id) !== String(packetId)),
    }));
  };

  const setLinkedPacketQty = (packetId, rawQty) => {
    const qty = Math.max(1, Number(rawQty) || 1);
    setProductForm((f) => ({
      ...f,
      packet_links: (f.packet_links || []).map((l) => (
        String(l.packet_id) === String(packetId) ? { ...l, qty_per_unit: qty } : l
      )),
    }));
  };

  const colorCatalogById = useMemo(
    () => new Map((variantColors || []).map((c) => [String(c.id), c])),
    [variantColors],
  );

  const linkedProductColors = useMemo(
    () => (productForm.color_ids || [])
      .map((id) => colorCatalogById.get(String(id)))
      .filter(Boolean),
    [productForm.color_ids, colorCatalogById],
  );

  const linkedProductColorIds = useMemo(
    () => new Set((productForm.color_ids || []).map((id) => String(id))),
    [productForm.color_ids],
  );

  const colorDraftSuggestions = useMemo(() => {
    const q = colorDraft.trim().toLowerCase();
    if (!q) return [];
    return (variantColors || [])
      .filter((c) => String(c.name || '').toLowerCase().includes(q))
      .filter((c) => !linkedProductColorIds.has(String(c.id)))
      .slice(0, 10);
  }, [colorDraft, variantColors, linkedProductColorIds]);

  const exactColorDraftMatch = useMemo(() => {
    const key = normalizeWarehouseColorKey(colorDraft);
    if (!key) return null;
    return (variantColors || []).find(
      (c) => normalizeWarehouseColorKey(c.name) === key
        || normalizeWarehouseColorKey(c.name_key) === key,
    ) || null;
  }, [colorDraft, variantColors]);

  const addColorIdToProduct = (colorId) => {
    const id = String(colorId);
    if (!id || linkedProductColorIds.has(id)) return;
    setProductForm((f) => ({
      ...f,
      has_color_variants: true,
      color_ids: [...(f.color_ids || []), id],
    }));
    setColorDraft('');
  };

  const removeColorFromProduct = (colorId) => {
    setProductForm((f) => ({
      ...f,
      color_ids: (f.color_ids || []).filter((id) => String(id) !== String(colorId)),
    }));
  };

  const commitColorDraft = async () => {
    const trimmed = colorDraft.trim();
    if (!trimmed || colorPickBusy) return;
    setColorPickBusy(true);
    setError('');
    try {
      const existing = exactColorDraftMatch
        || (variantColors || []).find(
          (c) => normalizeWarehouseColorKey(c.name) === normalizeWarehouseColorKey(trimmed),
        );
      const color = existing || await findOrCreateWarehouseColor(trimmed);
      if (!existing) {
        setVariantColors((prev) => [...(prev || []), color].sort(
          (a, b) => String(a.name).localeCompare(String(b.name)),
        ));
      }
      addColorIdToProduct(color.id);
    } catch (err) {
      setError(err?.message || 'Could not add color');
    } finally {
      setColorPickBusy(false);
    }
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured — cannot link packets. Check Locations settings.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const locationIds = [
        ...new Set([
          ...LOCKED_SHOWROOM_LOCATION_IDS.map(String),
          ...(productForm.location_ids || []).map(String),
        ]),
      ];
      await saveWarehouseAssembly(
        {
          ...productForm,
          location_ids: locationIds,
          warehouse_location_id: warehouseLocationId,
        },
        { id: editingProductId },
      );
      navigate('/warehouse-products');
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const productFormFinishedOnly = productForm.inventory_mode === WAREHOUSE_INVENTORY_MODE.FINISHED;

  if (!canManage) return null;

  return (
    <div className="products-container warehouse-products-page" style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard
          to="/warehouse-products"
          title="Back to warehouse products"
          ariaLabel="Back to warehouse products"
        />
        <h1 className="products-title" style={{ margin: 0 }}>{isNew ? 'New product' : 'Edit product'}</h1>
      </div>
      {error ? <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div> : null}
      {loading || !formReady ? <p>Loading…</p> : (
<form onSubmit={handleSaveProduct} className="product-form warehouse-form-panel">
          <h3 className="warehouse-form-title">
            <span className="warehouse-kind-badge warehouse-kind-badge--product">Product</span>
            {isNew ? 'New product' : 'Edit product'}
          </h3>
          <div className="warehouse-field">
            <label htmlFor="wh-product-name">Name</label>
            <input
              id="wh-product-name"
              required
              placeholder="e.g. Venon Orta Sehpa"
              value={productForm.name}
              onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="warehouse-field">
            <label htmlFor="wh-product-sku">SKU (assembled product)</label>
            <input
              id="wh-product-sku"
              required
              placeholder="e.g. 22VEM3300COCZ"
              value={productForm.family_sku}
              onChange={(e) => setProductForm((f) => ({ ...f, family_sku: e.target.value }))}
              style={{ fontFamily: 'monospace' }}
            />
          </div>
          <div className="warehouse-field warehouse-field--inventory-mode">
            <label className="warehouse-variant-colors-toggle">
              <input
                type="checkbox"
                className="warehouse-variant-colors-checkbox"
                checked={productFormFinishedOnly}
                onChange={(e) => setProductForm((f) => ({
                  ...f,
                  inventory_mode: e.target.checked
                    ? WAREHOUSE_INVENTORY_MODE.FINISHED
                    : WAREHOUSE_INVENTORY_MODE.PACKETS,
                }))}
              />
              <span>Finished units only — no packet BOM yet</span>
            </label>
            <p className="warehouse-field-hint">
              Use for showroom stock already assembled when carton SKUs are unknown. Set finished qty per location after saving (expand the product). Add packets later and switch to carton tracking when ready.
            </p>
          </div>
          {!productFormFinishedOnly && (
            <div className="warehouse-field">
              <label htmlFor="wh-product-packet-count">Total packets</label>
              <input
                id="wh-product-packet-count"
                required
                type="number"
                min="1"
                placeholder="e.g. 4 — boxes needed for one product"
                value={productForm.packet_count}
                onChange={(e) => setProductForm((f) => ({ ...f, packet_count: e.target.value }))}
              />
              <p className="warehouse-field-hint">
                Total cartons per finished unit (label “TOTAL PACKAGE QUANTITY”, e.g. 7). Must equal the sum of qty per product on all linked packet lines.
              </p>
            </div>
          )}
          <div className="warehouse-field">
            <label htmlFor="wh-product-category">Category</label>
            <select
              id="wh-product-category"
              value={productForm.category_id}
              onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="warehouse-field product-form-locations-section">
            <label>Locations (where this product appears)</label>
            <div className="locations-checkbox-group">
              {sellLocations.map((loc) => {
                const isLocked = LOCKED_SHOWROOM_LOCATION_IDS.some((id) => String(id) === String(loc.id));
                const checked = isLocked
                  || productForm.location_ids.some((id) => String(id) === String(loc.id));
                return (
                  <label key={loc.id}>
                    <input
                      type="checkbox"
                      className="locations-checkbox-input"
                      checked={checked}
                      disabled={isLocked}
                      onChange={(e) => toggleProductLocation(loc.id, e.target.checked)}
                    />
                    <span>{loc.name}{isLocked ? ' (always)' : ''}</span>
                  </label>
                );
              })}
            </div>
            <p className="warehouse-field-hint">
              {productFormFinishedOnly
                ? 'Check each showroom where this product is sold — then set finished on-hand per location on the product list.'
                : 'Warehouse stock is tracked on packets; showrooms use finished qty from packet transfers when BOM is complete.'}
            </p>
          </div>
          <div className="warehouse-field warehouse-field--variant-colors">
            <label className="warehouse-variant-colors-toggle">
              <input
                type="checkbox"
                className="warehouse-variant-colors-checkbox"
                checked={Boolean(productForm.has_color_variants)}
                onChange={(e) => setProductForm((f) => ({
                  ...f,
                  has_color_variants: e.target.checked,
                  color_ids: e.target.checked ? f.color_ids : [],
                }))}
              />
              <span>This product has variant colors</span>
            </label>
            {productForm.has_color_variants ? (
              <>
                <label htmlFor="wh-color-pick" className="warehouse-color-pick-label">Variant colors</label>
                <div className="warehouse-color-pick-row">
                  <input
                    id="wh-color-pick"
                    type="text"
                    className="warehouse-color-pick-input"
                    placeholder="Type color (e.g. Mavi, Grey) — Enter to add"
                    value={colorDraft}
                    onChange={(e) => setColorDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitColorDraft();
                      }
                    }}
                    autoComplete="off"
                    list="wh-color-suggestions"
                    disabled={colorPickBusy}
                  />
                  <button
                    type="button"
                    className="product-form-btn product-form-btn--secondary warehouse-color-pick-add"
                    onClick={() => commitColorDraft()}
                    disabled={colorPickBusy || !colorDraft.trim()}
                  >
                    {colorPickBusy ? '…' : exactColorDraftMatch ? 'Add' : 'Add new'}
                  </button>
                </div>
                <datalist id="wh-color-suggestions">
                  {colorDraftSuggestions.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                {colorDraft.trim() && exactColorDraftMatch && !linkedProductColorIds.has(String(exactColorDraftMatch.id)) ? (
                  <p className="warehouse-field-hint">
                    Matches existing color <strong>{exactColorDraftMatch.name}</strong> — press Enter or Add.
                  </p>
                ) : null}
                {colorDraft.trim() && !exactColorDraftMatch ? (
                  <p className="warehouse-field-hint">
                    New color <strong>{colorDraft.trim()}</strong> will be created when you add it.
                  </p>
                ) : null}
                {colorDraftSuggestions.length > 0 ? (
                  <ul className="warehouse-color-suggestions">
                    {colorDraftSuggestions.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="warehouse-color-suggestion-btn"
                          onClick={() => addColorIdToProduct(c.id)}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {linkedProductColors.length > 0 ? (
                  <div className="warehouse-color-chips">
                    {linkedProductColors.map((c) => (
                      <WarehouseColorChip
                        key={c.id}
                        name={c.name}
                        onRemove={() => removeColorFromProduct(c.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="warehouse-field-hint" style={{ marginTop: 8 }}>
                    Add at least one color variant for this product.
                  </p>
                )}
              </>
            ) : null}
          </div>
          <div className="warehouse-field warehouse-field--packet-links">
            <label htmlFor="wh-packet-pick-search">Packets that build this product</label>
            {productFormFinishedOnly ? (
              <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
                Optional for now. When cartons arrive, create packets, link them here, set total packets, and turn off finished-only mode.
              </p>
            ) : null}
            <input
              id="wh-packet-pick-search"
              type="search"
              className="warehouse-packet-pick-search"
              placeholder="Search by packet SKU or name to add…"
              value={packetPickSearch}
              onChange={(e) => setPacketPickSearch(e.target.value)}
              autoComplete="off"
            />
            {packetPickSearch.trim()
              && packetPickSearchResults.length === 0
              && packetPickSearchBuckets.shared.length === 0
              && packetPickSearchBuckets.alreadyLinked.length === 0 ? (
                <p className="warehouse-field-hint">No packets match this search.</p>
              ) : null}
            {packetPickSearchResults.length > 0 ? (
              <ul className="warehouse-packet-pick-results">
                {packetPickSearchResults.map((packet) => (
                  <li key={packet.id}>
                    <div className="warehouse-packet-pick-results__text">
                      <code>{packet.sku}</code>
                      <span className="warehouse-packet-pick-results__name">{packet.name}</span>
                      <span className="warehouse-field-hint">#{packet.packet_number}</span>
                    </div>
                    <button
                      type="button"
                      className="product-form-btn product-form-btn--secondary warehouse-packet-pick-add"
                      onClick={() => addPacketToProduct(packet.id)}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {packetPickSearchBuckets.shared.length > 0 ? (
              <ul className="warehouse-packet-pick-results">
                {packetPickSearchBuckets.shared.map(({ packet, owners }) => (
                  <li key={packet.id}>
                    <div className="warehouse-packet-pick-results__text">
                      <code>{packet.sku}</code>
                      <span className="warehouse-packet-pick-results__name">{packet.name}</span>
                      <span className="warehouse-field-hint">
                        Also used on{' '}
                        {owners.map((o) => o.name).join(', ')}
                        . Shared warehouse stock is split automatically from qty per product.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="product-form-btn product-form-btn--secondary warehouse-packet-pick-add"
                      onClick={() => addPacketToProduct(packet.id)}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {packetPickSearchBuckets.alreadyLinked.length > 0 ? (
              <p className="warehouse-field-hint">
                Already linked on this product:{' '}
                {packetPickSearchBuckets.alreadyLinked.map((p) => p.sku).join(', ')}
              </p>
            ) : null}
            {linkedPacketsForForm.length === 0 ? (
              <p className="warehouse-field-hint" style={{ marginTop: 8 }}>
                {productFormFinishedOnly
                  ? 'No packets linked — you can save without them.'
                  : 'No packets linked yet. Create packets first, then search above to add them.'}
              </p>
            ) : (
              <div className="warehouse-packet-linked-list">
                <div className="warehouse-packet-linked-header">
                  <span>Packet</span>
                  <span>Qty / product</span>
                  <span />
                </div>
                {linkedPacketsForForm.map(({ packet, qty_per_unit }) => (
                  <div key={packet.id} className="warehouse-packet-linked-row">
                    <div className="warehouse-packet-linked-row__info">
                      <code>{packet.sku}</code>
                      <span>{packet.name}</span>
                      <span className="warehouse-field-hint">packet #{packet.packet_number}</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="warehouse-packet-qty-input"
                      value={qty_per_unit}
                      onChange={(e) => setLinkedPacketQty(packet.id, e.target.value)}
                      aria-label={`Qty per product for ${packet.sku}`}
                    />
                    <button
                      type="button"
                      className="product-form-btn product-form-btn--secondary warehouse-packet-linked-remove"
                      onClick={() => removePacketFromProduct(packet.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!productFormFinishedOnly && productFormBomPreview && (
              <p className="warehouse-field-hint" style={{ marginTop: 8 }}>
                {productFormBomPreview.isComplete
                  ? `BOM complete: ${productFormBomPreview.required} cartons per finished unit (${productFormBomPreview.linked} packet line(s), sum of qty per product).`
                  : `${productFormBomPreview.cartonsPerUnit} of ${productFormBomPreview.required} cartons per unit (${productFormBomPreview.linked} packet line(s)). Raise qty per product or link more packets until the total is ${productFormBomPreview.required}. Finished units stay 0 until then.`}
              </p>
            )}
            {!productFormFinishedOnly && linkedPacketsForForm.length > 0 ? (
              <p className="warehouse-field-hint" style={{ marginTop: 8 }}>
                <strong>Qty / product</strong> is cartons of that SKU per finished unit. If several products share one packet SKU, complete units are calculated from the communal pool (each round uses the sum of qty per product on all linked products); any cartons left over stay as excess warehouse stock.
              </p>
            ) : null}
          </div>
          <div className="warehouse-form-actions">
            <button type="submit" className="product-form-btn product-form-btn--primary" disabled={saving || !warehouseLocationId}>
              {saving ? 'Saving…' : 'Save product'}
            </button>
            <button type="button" className="product-form-btn product-form-btn--secondary" onClick={() => navigate('/warehouse-products')}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
