import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import WarehouseColorChip from './components/WarehouseColorChip';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import {
  fetchWarehouseCatalog,
  findOrCreateWarehouseColor,
  saveWarehouseAssembly,
  setWarehouseAssemblyQuantity,
  setWarehousePacketQuantity,
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
import { isWarehouseProductAssembly } from './utils/warehouseCatalogHierarchy';
import { normalizeWarehouseProductSku } from './utils/warehouseScanResolver';
import {
  boxCountFromFinishedUnits,
  assemblyUnitsPerCarton,
  finishedBoxReceivingPrompt,
  finishedUnitsFromBoxCount,
  shouldPromptWarehouseBoxQtyOnProductSave,
} from './utils/warehouseUnitsPerCarton';

import {
  defaultWarehouseKitShowroomLocationId,
  WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS,
  warehouseCatalogAllowsSetCreate,
} from './constants/warehouseShowroomLocations';
import {
  expandWarehouseSetItemsRows,
  setItemsAssemblyLocationKey,
} from './utils/warehouseSetItems';

const emptyProductForm = {
  name: '',
  turkish_name: '',
  family_sku: '',
  category_id: '',
  packet_count: '',
  packet_links: [],
  has_color_variants: false,
  color_ids: [],
  inventory_mode: WAREHOUSE_INVENTORY_MODE.PACKETS,
  catalog_kind: 'product',
  set_location_id: defaultWarehouseKitShowroomLocationId(),
  set_components: [],
  units_per_carton: '1',
};

export default function WarehouseProductEditPage() {
  const { productId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !productId;
  const allowSetCreate = warehouseCatalogAllowsSetCreate();
  const newKind = allowSetCreate && searchParams.get('kind') === 'set' ? 'set' : 'product';
  const canManage = useMemo(() => canManageCatalog(getCurrentUser()), []);
  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_assembly_colors',
    'warehouse_assembly_packets',
    'warehouse_set_items',
    'warehouse_colors',
    'categories',
    'locations',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [packets, setPackets] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [variantColors, setVariantColors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [packetInventory, setPacketInventory] = useState([]);
  const [assemblyInventory, setAssemblyInventory] = useState([]);
  const [warehouseBoxModal, setWarehouseBoxModal] = useState(null);
  const [warehouseBoxModalSaving, setWarehouseBoxModalSaving] = useState(false);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [saving, setSaving] = useState(false);
  const [packetPickSearch, setPacketPickSearch] = useState('');
  const [colorDraft, setColorDraft] = useState('');
  const [colorPickBusy, setColorPickBusy] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [setComponentsByLocation, setSetComponentsByLocation] = useState({});
  const newProductFormInitializedRef = useRef(false);

  const applyCatalogSnapshot = useCallback((data) => {
    setAssemblies(data.assemblies || []);
    setPackets(data.packets);
    setAssemblyPacketRows(data.assemblyPackets || []);
    setVariantColors(data.colors);
    setCategories(data.categories);
    setLocations(data.locations);
    setWarehouseLocationId(data.warehouseLocationId);
    setWarehouseLocationName(data.warehouseLocationName || 'Warehouse');
    setPacketInventory(data.inventory || []);
    setAssemblyInventory(data.assemblyInventory || []);
    if (!data.warehouseLocationId) {
      setError('No Warehouse location found. Add a location named "Warehouse".');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog();
      applyCatalogSnapshot(data);
      if (!isNew) {
        const row = (data.assemblies || []).find((a) => String(a.id) === String(productId));
        if (!row) {
          setError('Product not found.');
          setFormReady(false);
        } else {
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
          const isSetRow = String(row.item_kind || '').toLowerCase() === 'set';
          const setLines = expandWarehouseSetItemsRows(data.setItems || [])
            .filter((line) => String(line.set_assembly_id) === String(row.id));
          const byLoc = {};
          WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS.forEach((locId) => {
            const key = setItemsAssemblyLocationKey(row.id, locId);
            const lines = setLines
              .filter((line) => String(line.location_id) === String(locId))
              .map((line) => ({
                component_assembly_id: line.component_assembly_id,
                quantity: Math.max(1, Number(line.quantity) || 1),
              }));
            byLoc[key] = lines.length
              ? lines
              : [{ component_assembly_id: '', quantity: 1 }];
          });
          const defaultSetLoc = defaultWarehouseKitShowroomLocationId();
          const setLocKey = setItemsAssemblyLocationKey(row.id, defaultSetLoc);
          setSetComponentsByLocation(byLoc);
          setProductForm({
            name: row.name || '',
            turkish_name: '',
            family_sku: row.family_sku || '',
            category_id: row.category_id || '',
            packet_count: row.packet_count == null || row.packet_count === ''
              ? ''
              : String(row.packet_count),
            packet_links: packetLinks,
            has_color_variants: Boolean(row.has_color_variants),
            color_ids: colorIds,
            inventory_mode: row.inventory_mode === WAREHOUSE_INVENTORY_MODE.PACKETS
              ? WAREHOUSE_INVENTORY_MODE.PACKETS
              : WAREHOUSE_INVENTORY_MODE.FINISHED,
            catalog_kind: isSetRow ? 'set' : 'product',
            set_location_id: defaultSetLoc,
            set_components: byLoc[setLocKey] || [{ component_assembly_id: '', quantity: 1 }],
            units_per_carton: row.units_per_carton == null || row.units_per_carton === ''
              ? '1'
              : String(row.units_per_carton),
          });
          setFormReady(true);
        }
      } else if (!newProductFormInitializedRef.current) {
        const defaultSetLoc = defaultWarehouseKitShowroomLocationId();
        setSetComponentsByLocation({});
        setProductForm({
          ...emptyProductForm,
          catalog_kind: newKind,
          set_location_id: defaultSetLoc,
          set_components: newKind === 'set' ? [{ component_assembly_id: '', quantity: 1 }] : [],
        });
        newProductFormInitializedRef.current = true;
        setFormReady(true);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [applyCatalogSnapshot, isNew, productId, newKind]);

  const refreshCatalogLists = useCallback(async () => {
    try {
      const data = await fetchWarehouseCatalog();
      applyCatalogSnapshot(data);
    } catch {
      /* keep existing lists */
    }
  }, [applyCatalogSnapshot]);

  useEffect(() => {
    newProductFormInitializedRef.current = false;
    setFormReady(false);
  }, [productId, isNew, newKind]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshCatalogLists();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshCatalogLists]);

  useEffect(() => {
    if (!canManage) {
      navigate('/warehouse-products', { replace: true });
      return;
    }
    if (isNew && !allowSetCreate && searchParams.get('kind') === 'set') {
      navigate('/warehouse-products/new', { replace: true });
      return;
    }
    load();
  }, [allowSetCreate, canManage, isNew, load, navigate, rtTick, searchParams]);

  const editingProductId = isNew ? null : productId;

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
    const packet = (packets || []).find((p) => String(p.id) === packetId);
    const defaultQty = Math.max(1, Number(packet?.qty_per_unit) || 1);
    setProductForm((f) => ({
      ...f,
      packet_links: [...(f.packet_links || []), { packet_id: packetId, qty_per_unit: defaultQty }],
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
    const savingSet = productForm.catalog_kind === 'set';
    if (savingSet) {
      if (!WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS.some(
        (id) => String(id) === String(productForm.set_location_id),
      )) {
        setError('Choose Kitwe or Lusaka for this set recipe.');
        return;
      }
      const validLines = (productForm.set_components || []).filter(
        (line) => String(line?.component_assembly_id || '').trim(),
      );
      if (!validLines.length) {
        setError('Add at least one product to this set.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const normalizedSku = normalizeWarehouseProductSku(productForm.family_sku);
      if (!normalizedSku) {
        setError('Product SKU is required.');
        setSaving(false);
        return;
      }
      const { turkish_name: _omitTurkishName, ...formToSave } = productForm;
      const finishedOnly = formToSave.inventory_mode === WAREHOUSE_INVENTORY_MODE.FINISHED;
      const productPayload = {
        ...formToSave,
        units_per_carton: finishedOnly ? formToSave.units_per_carton : '1',
        family_sku: normalizedSku,
        set_location_id: savingSet ? productForm.set_location_id : undefined,
        set_components: savingSet
          ? (productForm.set_components || []).filter((line) => String(line?.component_assembly_id || '').trim())
          : [],
      };
      setProductForm(productPayload);
      const saved = await saveWarehouseAssembly(
        {
          ...productPayload,
          location_ids: savingSet ? (productPayload.location_ids || []) : [],
          warehouse_location_id: warehouseLocationId,
        },
        { id: editingProductId },
      );
      const assemblyId = saved?.id;
      const assemblyLike = {
        inventory_mode: productPayload.inventory_mode,
        units_per_carton: productPayload.units_per_carton,
      };
      const boxPackets = linkedPacketsForForm.map((row) => ({
        ...row.packet,
        qty_per_unit: row.qty_per_unit,
      }));
      const packetBoxPrompt = finishedBoxReceivingPrompt(assemblyLike, boxPackets);
      const showBoxModal = !savingSet
        && warehouseLocationId
        && assemblyId
        && shouldPromptWarehouseBoxQtyOnProductSave(assemblyLike);
      if (showBoxModal) {
        const unitsPerBox = assemblyUnitsPerCarton(assemblyLike);
        let currentBoxes = 0;
        if (packetBoxPrompt?.packet) {
          const invRow = (packetInventory || []).find(
            (row) => String(row.packet_id) === String(packetBoxPrompt.packet.id)
              && String(row.location_id) === String(warehouseLocationId),
          );
          currentBoxes = Math.max(0, Math.floor(Number(invRow?.quantity) || 0));
        } else {
          const asmInv = (assemblyInventory || []).find(
            (row) => String(row.assembly_id) === String(assemblyId)
              && String(row.location_id) === String(warehouseLocationId),
          );
          const units = Math.max(0, Math.floor(Number(asmInv?.quantity) || 0));
          currentBoxes = boxCountFromFinishedUnits(units, unitsPerBox);
        }
        setWarehouseBoxModal({
          productName: productPayload.name,
          assemblyId,
          unitsPerBox,
          boxes: String(currentBoxes),
          saveTarget: packetBoxPrompt?.packet ? 'packet' : 'assembly',
          packet: packetBoxPrompt?.packet || null,
        });
      } else {
        navigate('/warehouse-products');
      }
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const leaveAfterBoxModal = () => {
    setWarehouseBoxModal(null);
    navigate('/warehouse-products');
  };

  const submitWarehouseBoxModal = async () => {
    if (!warehouseBoxModal || !warehouseLocationId) {
      leaveAfterBoxModal();
      return;
    }
    const boxes = Math.max(0, Math.floor(Number(warehouseBoxModal.boxes) || 0));
    setWarehouseBoxModalSaving(true);
    setError('');
    try {
      if (warehouseBoxModal.saveTarget === 'packet' && warehouseBoxModal.packet?.id) {
        await setWarehousePacketQuantity(
          warehouseBoxModal.packet.id,
          warehouseLocationId,
          boxes,
        );
      } else if (warehouseBoxModal.assemblyId) {
        const units = finishedUnitsFromBoxCount(boxes, warehouseBoxModal.unitsPerBox);
        await setWarehouseAssemblyQuantity(
          warehouseBoxModal.assemblyId,
          warehouseLocationId,
          units,
        );
      }
      leaveAfterBoxModal();
    } catch (err) {
      setError(err?.message || 'Failed to save box quantity');
    } finally {
      setWarehouseBoxModalSaving(false);
    }
  };

  const warehouseBoxModalUnits = warehouseBoxModal
    ? finishedUnitsFromBoxCount(warehouseBoxModal.boxes, warehouseBoxModal.unitsPerBox)
    : 0;

  const productFormFinishedOnly = productForm.inventory_mode === WAREHOUSE_INVENTORY_MODE.FINISHED;
  const isSetForm = productForm.catalog_kind === 'set';
  const componentProductOptions = useMemo(
    () => (assemblies || []).filter((a) => {
      if (!isWarehouseProductAssembly(a)) return false;
      if (!isNew && String(a.id) === String(productId)) return false;
      return true;
    }),
    [assemblies, isNew, productId],
  );

  const addSetComponentLine = () => {
    setProductForm((f) => ({
      ...f,
      set_components: [...(f.set_components || []), { component_assembly_id: '', quantity: 1 }],
    }));
  };

  const updateSetComponentLine = (index, patch) => {
    setProductForm((f) => {
      const next = [...(f.set_components || [])];
      next[index] = { ...next[index], ...patch };
      return { ...f, set_components: next };
    });
  };

  const removeSetComponentLine = (index) => {
    setProductForm((f) => ({
      ...f,
      set_components: (f.set_components || []).filter((_, i) => i !== index),
    }));
  };

  const kitShowroomOptions = useMemo(
    () => (locations || []).filter((loc) => WAREHOUSE_KIT_SHOWROOM_LOCATION_IDS.some(
      (id) => String(id) === String(loc.id),
    )),
    [locations],
  );

  const switchSetKitLocation = (nextLocationId) => {
    const prevLocId = productForm.set_location_id;
    const assemblyKey = editingProductId || 'new';
    if (prevLocId) {
      const prevKey = setItemsAssemblyLocationKey(assemblyKey, prevLocId);
      setSetComponentsByLocation((prev) => ({
        ...prev,
        [prevKey]: productForm.set_components || [],
      }));
    }
    const nextKey = setItemsAssemblyLocationKey(assemblyKey, nextLocationId);
    const nextComponents = setComponentsByLocation[nextKey]
      || [{ component_assembly_id: '', quantity: 1 }];
    setProductForm((f) => ({
      ...f,
      set_location_id: nextLocationId,
      set_components: nextComponents,
    }));
  };

  if (!canManage) return null;

  return (
    <div className="products-container warehouse-products-page" style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <h1 className="products-title" style={{ margin: 0 }}>
          {isNew
            ? (isSetForm ? 'New set' : 'New product')
            : (isSetForm ? 'Edit set' : 'Edit product')}
        </h1>
      </div>
      {error ? <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div> : null}
      {loading || !formReady ? <p>Loading…</p> : (
<form onSubmit={handleSaveProduct} className="product-form warehouse-form-panel">
          <h3 className="warehouse-form-title">
            <span className={`warehouse-kind-badge warehouse-kind-badge--${isSetForm ? 'set' : 'product'}`}>
              {isSetForm ? 'Set' : 'Product'}
            </span>
            {isNew
              ? (isSetForm ? 'New set' : 'New product')
              : (isSetForm ? 'Edit set' : 'Edit product')}
          </h3>
          <div className="warehouse-form-grid">
          {isNew && allowSetCreate ? (
            <div className="warehouse-field warehouse-field--catalog-type warehouse-field--span-full">
              <label>Catalog type</label>
              <div className="locations-checkbox-group warehouse-catalog-type-options">
                <label>
                  <input
                    type="checkbox"
                    className="locations-checkbox-input"
                    checked={!isSetForm}
                    onChange={(e) => {
                      if (!e.target.checked) return;
                      setProductForm((f) => ({
                        ...f,
                        catalog_kind: 'product',
                        set_components: [],
                      }));
                    }}
                  />
                  <span>Product (built from packets)</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    className="locations-checkbox-input"
                    checked={isSetForm}
                    onChange={(e) => {
                      if (!e.target.checked) return;
                      setProductForm((f) => ({
                        ...f,
                        catalog_kind: 'set',
                        inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
                        packet_count: '',
                        packet_links: [],
                        set_components: [{ component_assembly_id: '', quantity: 1 }],
                      }));
                    }}
                  />
                  <span>Set (combine finished products)</span>
                </label>
              </div>
            </div>
          ) : null}
          <div className="warehouse-field warehouse-field--stacked-names">
            <div>
              <label htmlFor="wh-product-name">Name</label>
              <input
                id="wh-product-name"
                required
                placeholder="e.g. Venon Orta Sehpa"
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="wh-product-turkish-name">Turkish Name</label>
              <input
                id="wh-product-turkish-name"
                placeholder="e.g. ürün adı (Türkçe)"
                value={productForm.turkish_name}
                onChange={(e) => setProductForm((f) => ({ ...f, turkish_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="warehouse-field">
            <label htmlFor="wh-product-sku">SKU (assembled product)</label>
            <input
              id="wh-product-sku"
              required
              placeholder="e.g. 22VEM3300COCZ"
              value={productForm.family_sku}
              onChange={(e) => setProductForm((f) => ({ ...f, family_sku: e.target.value.toUpperCase() }))}
              onBlur={(e) => {
                const normalized = normalizeWarehouseProductSku(e.target.value);
                if (normalized && normalized !== e.target.value.trim()) {
                  setProductForm((f) => ({ ...f, family_sku: normalized }));
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const normalized = normalizeWarehouseProductSku(e.currentTarget.value);
                if (normalized && normalized !== e.currentTarget.value.trim()) {
                  setProductForm((f) => ({ ...f, family_sku: normalized }));
                }
              }}
              style={{ fontFamily: 'monospace' }}
            />
          </div>
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
          {isSetForm ? (
            <p className="warehouse-field-hint warehouse-field--span-full" style={{ marginTop: 0 }}>
              A set is built from other warehouse products (each with its own packet BOM). Stock is how many complete sets you can assemble from component on-hand — e.g. 1× table + 6× chairs.
            </p>
          ) : (
          <div className="warehouse-field warehouse-field--inventory-mode warehouse-field--span-full">
            <label className="warehouse-variant-colors-toggle">
              <input
                type="checkbox"
                className="warehouse-variant-colors-checkbox"
                checked={productFormFinishedOnly}
                onChange={(e) => {
                  const finished = e.target.checked;
                  setProductForm((f) => ({
                    ...f,
                    inventory_mode: finished
                      ? WAREHOUSE_INVENTORY_MODE.FINISHED
                      : WAREHOUSE_INVENTORY_MODE.PACKETS,
                    units_per_carton: finished ? f.units_per_carton : '1',
                  }));
                }}
              />
              <span>Finished units only — no packet BOM (pre-boxed stock)</span>
            </label>
            <p className="warehouse-field-hint">
              Turn this on only when you receive sellable units already in one carton (e.g. 2 chairs per box). For products built from warehouse packets, leave it <strong>off</strong> and use <strong>Total packets</strong> plus <strong>Qty / product</strong> on each linked packet (e.g. two cartons of the same SKU → total packets <strong>2</strong>, one packet line with qty / product <strong>2</strong>).
            </p>
          </div>
          )}
          {!isSetForm && productFormFinishedOnly && (
            <div className="warehouse-field">
              <label htmlFor="wh-product-units-per-carton">Qty per box (finished units in one carton)</label>
              <input
                id="wh-product-units-per-carton"
                type="number"
                min="1"
                step="1"
                value={productForm.units_per_carton ?? '1'}
                onChange={(e) => setProductForm((f) => ({
                  ...f,
                  units_per_carton: e.target.value,
                }))}
              />
              <p className="warehouse-field-hint">
                Example: 2 dining chairs in one box → enter <strong>2</strong>. Stock shows boxes and units (e.g. 3 boxes · 6 units). Link exactly one box packet with qty/product = 1.
              </p>
            </div>
          )}
          {!isSetForm && !productFormFinishedOnly && (
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
                Total cartons needed for <strong>one</strong> finished unit (e.g. 7 different packets, or <strong>2</strong> of the same packet). Must equal the sum of <strong>Qty / product</strong> on all linked packet lines.
              </p>
            </div>
          )}
          {!isSetForm ? (
          <div
            className={`warehouse-field warehouse-field--variant-colors${
              productForm.has_color_variants ? ' warehouse-field--span-full' : ''
            }`}
          >
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
          ) : null}
          {isSetForm ? (
            <div className="warehouse-field warehouse-field--set-components warehouse-field--span-full">
              <label htmlFor="wh-set-kit-location">Set kitting location</label>
              <select
                id="wh-set-kit-location"
                required
                value={productForm.set_location_id || ''}
                onChange={(e) => switchSetKitLocation(e.target.value)}
              >
                {kitShowroomOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <p className="warehouse-field-hint" style={{ marginTop: 4 }}>
                Product + product = set (showroom kitting only). Packets are never added here — only finished products.
              </p>
              <label>Set components (products)</label>
              <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
                Each line is a warehouse product (built from packets) and how many go into one set at this location.
              </p>
              <div className="warehouse-packet-linked-list">
                <div className="warehouse-packet-linked-header">
                  <span>Product</span>
                  <span>Qty / set</span>
                  <span />
                </div>
                {(productForm.set_components || []).map((line, index) => (
                  <div key={`set-line-${index}`} className="warehouse-packet-linked-row">
                    <select
                      className="warehouse-set-component-select"
                      value={line.component_assembly_id || ''}
                      onChange={(e) => updateSetComponentLine(index, { component_assembly_id: e.target.value })}
                      required
                    >
                      <option value="">Select product…</option>
                      {componentProductOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.family_sku})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="warehouse-packet-qty-input"
                      value={line.quantity}
                      onChange={(e) => updateSetComponentLine(index, {
                        quantity: Math.max(1, Number(e.target.value) || 1),
                      })}
                      aria-label="Quantity per set"
                    />
                    <button
                      type="button"
                      className="product-form-btn product-form-btn--secondary warehouse-packet-linked-remove"
                      onClick={() => removeSetComponentLine(index)}
                      disabled={(productForm.set_components || []).length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="product-form-btn product-form-btn--secondary"
                style={{ marginTop: 8 }}
                onClick={addSetComponentLine}
              >
                Add component
              </button>
            </div>
          ) : (
          <div className="warehouse-field warehouse-field--packet-links warehouse-field--span-full">
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
          )}
          <div className="warehouse-form-actions warehouse-field--span-full">
            <button type="submit" className="product-form-btn product-form-btn--primary" disabled={saving || !warehouseLocationId}>
              {saving ? 'Saving…' : (isSetForm ? 'Save set' : 'Save product')}
            </button>
            <button type="button" className="product-form-btn product-form-btn--secondary" onClick={() => navigate('/warehouse-products')}>Cancel</button>
          </div>
          </div>
        </form>
      )}
      {warehouseBoxModal ? (
        <div
          className="products-adjust-modal-overlay warehouse-box-qty-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="warehouse-box-qty-modal-title"
          onClick={(e) => {
            if (e.target.classList.contains('products-adjust-modal-overlay')) {
              leaveAfterBoxModal();
            }
          }}
        >
          <div className="products-adjust-modal warehouse-box-qty-modal">
            <h2 id="warehouse-box-qty-modal-title" className="products-adjust-modal__title">
              {warehouseBoxModal.unitsPerBox > 1
                ? 'Warehouse boxes on hand'
                : 'Warehouse finished qty'}
            </h2>
            <p className="products-adjust-modal__meta">
              <strong>{warehouseBoxModal.productName}</strong>
              {' — '}
              saved. Enter
              {warehouseBoxModal.unitsPerBox > 1 ? (
                <> how many <strong>cartons</strong> are at {warehouseLocationName}</>
              ) : (
                <> <strong>finished on-hand</strong> at {warehouseLocationName}</>
              )}
              {warehouseBoxModal.packet?.sku ? (
                <>
                  {' '}for box packet <code>{warehouseBoxModal.packet.sku}</code>
                </>
              ) : warehouseBoxModal.unitsPerBox > 1 ? (
                ' (product stock — link a box packet later to track cartons on the packet instead)'
              ) : null}
              .
            </p>
            {warehouseBoxModal.unitsPerBox > 1 ? (
              <p className="warehouse-field-hint" style={{ marginBottom: 12 }}>
                {warehouseBoxModal.unitsPerBox} finished units per box — total units = boxes × {warehouseBoxModal.unitsPerBox}.
              </p>
            ) : null}
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label" htmlFor="wh-warehouse-boxes-on-hand">
                {warehouseBoxModal.unitsPerBox > 1 ? 'Boxes' : 'Units'}
              </label>
              <input
                id="wh-warehouse-boxes-on-hand"
                type="number"
                min="0"
                step="1"
                className="warehouse-qty-input"
                value={warehouseBoxModal.boxes}
                autoFocus
                onChange={(e) => setWarehouseBoxModal((m) => (
                  m ? { ...m, boxes: e.target.value } : m
                ))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitWarehouseBoxModal();
                  }
                }}
                style={{ width: 96, textAlign: 'right' }}
              />
              <span className="warehouse-field-hint">
                = <strong>{warehouseBoxModalUnits}</strong> finished units
              </span>
            </div>
            <div className="warehouse-form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="product-form-btn product-form-btn--primary"
                disabled={warehouseBoxModalSaving}
                onClick={submitWarehouseBoxModal}
              >
                {warehouseBoxModalSaving ? 'Saving…' : 'Save & go to list'}
              </button>
              <button
                type="button"
                className="product-form-btn product-form-btn--secondary"
                disabled={warehouseBoxModalSaving}
                onClick={leaveAfterBoxModal}
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
