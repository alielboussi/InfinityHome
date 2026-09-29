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

const emptyProductForm = {
  name: '',
  family_sku: '',
  category_id: '',
  packet_count: '',
  location_ids: [],
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
    'warehouse_colors',
    'categories',
    'locations',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [packets, setPackets] = useState([]);
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
      setPackets(data.packets);
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
          const packetLinks = (data.packets || [])
            .filter((p) => String(p.assembly_id) === String(row.id))
            .map((p) => ({
              packet_id: p.id,
              qty_per_unit: Math.max(1, Number(p.qty_per_unit) || 1),
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

  const sellLocations = useMemo(
    () => showroomLocations(locations, warehouseLocationId),
    [locations, warehouseLocationId],
  );

  const editingProductId = isNew ? null : productId;

  const toggleProductLocation = (locationId, checked) => {
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

  const packetsAddableToProduct = useMemo(() => {
    const pid = editingProductId ? String(editingProductId) : null;
    return (packets || []).filter((p) => {
      if (linkedPacketIds.has(String(p.id))) return false;
      if (!p.assembly_id) return true;
      if (pid && String(p.assembly_id) === pid) return true;
      return false;
    });
  }, [packets, editingProductId, linkedPacketIds]);

  const packetPickSearchResults = useMemo(() => {
    const q = packetPickSearch.trim().toLowerCase();
    if (!q) return [];
    return packetsAddableToProduct
      .filter(
        (p) => String(p.sku || '').toLowerCase().includes(q)
          || String(p.name || '').toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [packetPickSearch, packetsAddableToProduct]);

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
    setPacketPickSearch('');
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
      await saveWarehouseAssembly(
        {
          ...productForm,
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
