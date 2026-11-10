import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import WarehouseAssemblyInlineName from './components/WarehouseAssemblyInlineName';
import WarehouseAssemblyInlineSku from './components/WarehouseAssemblyInlineSku';
import WarehouseAssemblyInlineSpecs from './components/WarehouseAssemblyInlineSpecs';
import WarehouseAssemblyThumbnail from './components/WarehouseAssemblyThumbnail';
import WarehouseCatalogViewToggle from './components/WarehouseCatalogViewToggle';
import WarehouseCatalogCreateActions from './components/WarehouseCatalogCreateActions';
import WarehouseCatalogListPager, {
  WAREHOUSE_CATALOG_PAGE_SIZE,
  paginateList,
} from './components/WarehouseCatalogListPager';
import WarehouseColorChip from './components/WarehouseColorChip';
import { canManageCatalog, getCurrentUser } from './accessControl';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import useDebouncedValue from './hooks/useDebouncedValue';
import {
  deleteWarehouseAssembly,
  deleteWarehousePacket,
  invalidateWarehouseCatalogCache,
  setWarehouseAssemblyProductQuantity,
  setWarehouseSetQuantityFromRecipe,
  setWarehousePacketQuantity,
} from './services/warehouseCatalog';
import { useWarehouseCatalogQuery, WAREHOUSE_CATALOG_QUERY_KEY } from './hooks/useWarehouseCatalogQuery';
import { completeUnitsAtLocation } from './services/warehouseTransfer';
import {
  analyzeAssemblyPacketBom,
  assemblyDerivesWarehouseStockFromPackets,
  assemblyUsesPacketBom,
  packetBomBottleneck,
} from './utils/warehouseAssemblyMath';
import { buildPacketsByAssembly } from './utils/warehouseAssemblyPacketPool';
import { isWarehouseSetAssembly, computeWarehouseFactorySetBuildableQty, buildWarehouseAssemblyLeftoverQtyMap, formatWarehouseSetStockCount } from './utils/warehouseSetMath';
import { collectSetComponentAssemblyIds } from './utils/warehouseSetItems';
import {
  assemblyUsesFinishedBoxReceiving,
  assemblyUnitsPerCarton,
  boxCountFromFinishedUnits,
  finishedUnitsFromBoxCount,
  formatWarehouseBoxAndUnitStock,
} from './utils/warehouseUnitsPerCarton';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseCatalogSearchQuery,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from './utils/warehouseScanResolver';
import {
  isCompleteCatalogProduct,
  isIncompletePacketBomProduct,
  isUncategorizedWarehouseProduct,
} from './utils/warehouseCatalogProductCompleteness';
import WarehouseProductionLabelPrintDialog, {
  WarehouseLabelPrintIconButton,
} from './components/WarehouseProductionLabelPrintDialog';
import WarehouseAssemblyCategoryDialog from './components/WarehouseAssemblyCategoryDialog';
import { useAuthProfileMobileGrant } from './hooks/useAuthProfileMobileGrant';
import { isWarehouseCatalogAddProductAllowed, isWarehouseCatalogLabelPrintAllowed } from './mobile/mobileAccessManifest';
import { formatWarehouseProductionLabelColor } from './utils/warehouseProductionLabelColor';
import { printWarehouseProductionLabel } from './services/warehouseProductionApi';
import { resolveWarehouseLabelPrintPlan, assemblyUsesWarehouseBoxLabels } from './utils/warehouseBulkLabelPrint';
import { WarehouseBulkLabelSelectCheckbox } from './components/WarehouseCatalogBulkLabelToolbar';
import WarehouseCatalogListChrome from './components/WarehouseCatalogListChrome';
import WarehouseCatalogBulkLabelDialog from './components/WarehouseCatalogBulkLabelDialog';
import { buildWarehouseBulkLabelDialogRows } from './utils/warehouseBulkLabelPrint';
import WarehouseSalesStoragePanel from './components/WarehouseSalesStoragePanel';
import { warehouseCatalogViewFromPath } from './utils/routeSuspenseKey';
import { expandWarehouseSetItemsRows } from './utils/warehouseSetItems';
import { WAREHOUSE_FACTORY_LOCATION_ID } from './constants/warehouseShowroomLocations';

export default function WarehouseProductsPage({ embedInHub = false } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const catalogView = warehouseCatalogViewFromPath(location.pathname, location.search);
  const isIncompleteView = catalogView === 'incomplete';
  const isUncategorizedView = catalogView === 'uncategorized';
  const isSetsView = catalogView === 'sets';
  const isSalesStorageView = catalogView === 'sales-storage';
  const sessionUser = useMemo(() => getCurrentUser(), []);
  const canManage = useMemo(() => canManageCatalog(sessionUser), [sessionUser]);
  const { grant } = useAuthProfileMobileGrant();
  const canAddProduct = canManage || isWarehouseCatalogAddProductAllowed(grant);
  const canPrintLabels = canManage || isWarehouseCatalogLabelPrintAllowed(grant);
  const rtTick = useRealtimeRefresh([
    'warehouse_assemblies',
    'warehouse_packets',
    'warehouse_packet_inventory',
    'warehouse_assembly_colors',
    'warehouse_assembly_inventory',
    'warehouse_assembly_packets',
    'warehouse_colors',
    'categories',
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [packets, setPackets] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [assemblyColors, setAssemblyColors] = useState([]);
  const [assemblyInventory, setAssemblyInventory] = useState([]);
  const [assemblyPacketRows, setAssemblyPacketRows] = useState([]);
  const [variantColors, setVariantColors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 160);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [labelPrintItem, setLabelPrintItem] = useState(null);
  const [categoryDialogAssembly, setCategoryDialogAssembly] = useState(null);
  const [bulkLabelSelected, setBulkLabelSelected] = useState(() => new Set());
  const [bulkLabelBusy, setBulkLabelBusy] = useState(false);
  const [bulkLabelDialogOpen, setBulkLabelDialogOpen] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [stockEditAssemblyId, setStockEditAssemblyId] = useState('');
  const [stockQtyDraftById, setStockQtyDraftById] = useState({});
  const [setItems, setSetItems] = useState([]);
  const hasCatalogRef = useRef(false);

  const applyCatalog = useCallback((data) => {
    setAssemblies(data.assemblies);
    setPackets(data.packets);
    setInventory(data.inventory);
    setAssemblyColors(data.assemblyColors);
    setAssemblyInventory(data.assemblyInventory);
    setAssemblyPacketRows(data.assemblyPackets || []);
    setVariantColors(data.colors);
    setCategories(data.categories);
    setSetItems(data.setItems || []);
    setWarehouseLocationId(data.warehouseLocationId);
    setWarehouseLocationName(data.warehouseLocationName);
    if (!data.warehouseLocationId) {
      setError('Warehouse location could not be resolved for this catalog.');
    }
  }, []);

  const {
    data: catalogData,
    error: catalogError,
    isLoading: catalogLoading,
    dataUpdatedAt,
  } = useWarehouseCatalogQuery();

  useEffect(() => {
    if (!catalogData) return;
    applyCatalog(catalogData);
    hasCatalogRef.current = true;
    setLoading(false);
  }, [catalogData, applyCatalog, dataUpdatedAt]);

  useEffect(() => {
    if (catalogError) {
      setError(catalogError?.message || 'Failed to load warehouse catalog');
      setLoading(false);
    }
  }, [catalogError]);

  useEffect(() => {
    if (!hasCatalogRef.current && catalogLoading) {
      setLoading(true);
    }
  }, [catalogLoading]);

  useEffect(() => {
    if (!rtTick) return;
    invalidateWarehouseCatalogCache();
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_CATALOG_QUERY_KEY });
  }, [rtTick, queryClient]);

  const refreshCatalog = useCallback(async () => {
    invalidateWarehouseCatalogCache();
    await queryClient.invalidateQueries({ queryKey: WAREHOUSE_CATALOG_QUERY_KEY });
  }, [queryClient]);

  const categoryName = useMemo(() => {
    const map = new Map((categories || []).map((c) => [String(c.id), c.name]));
    return (id) => map.get(String(id)) || '—';
  }, [categories]);

  const sortedCategories = useMemo(
    () => [...(categories || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [categories],
  );

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(assemblyPacketRows, packets),
    [assemblyPacketRows, packets],
  );

  const inventoryByPacketId = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((row) => {
      if (warehouseLocationId && String(row.location_id) !== String(warehouseLocationId)) return;
      map.set(String(row.packet_id), Number(row.quantity) || 0);
    });
    return map;
  }, [inventory, warehouseLocationId]);

  const assemblyInventoryByAssembly = useMemo(() => {
    const out = new Map();
    (assemblyInventory || []).forEach((row) => {
      const key = String(row.assembly_id);
      if (!out.has(key)) out.set(key, new Map());
      out.get(key).set(String(row.location_id), Number(row.quantity) || 0);
    });
    return out;
  }, [assemblyInventory]);

  const stockForAssemblyAtLocation = useCallback((assembly, locId, stockMap) => {
    const pktList = packetsByAssembly.get(String(assembly.id)) || [];
    const invMap = assemblyInventoryByAssembly.get(String(assembly.id));
    const usePacketMath = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
    if (usePacketMath) {
      return completeUnitsAtLocation(pktList, inventory, locId, assembly.packet_count, {
        assemblyId: assembly.id,
        assemblyPacketRows,
        catalogPackets: packets,
      });
    }
    if (assemblyUsesFinishedBoxReceiving(assembly, pktList)) {
      const packet = pktList[0];
      const onHand = (inventory || []).find(
        (row) => String(row.packet_id) === String(packet.id)
          && String(row.location_id) === String(locId),
      );
      const boxes = Number(onHand?.quantity) || 0;
      return finishedUnitsFromBoxCount(boxes, assemblyUnitsPerCarton(assembly));
    }
    return invMap?.get(String(locId)) ?? 0;
  }, [
    assemblyInventoryByAssembly,
    assemblyPacketRows,
    inventory,
    packets,
    packetsByAssembly,
  ]);

  const warehouseSetStockContext = useMemo(() => {
    const empty = {
      qtyById: new Map(),
      leftoverById: new Map(),
      setComponentIds: new Set(),
    };
    if (!warehouseLocationId) return empty;

    const qtyById = new Map();
    const componentQty = new Map();

    const qtyForAssembly = (assembly) => {
      const id = String(assembly.id);
      if (componentQty.has(id)) return componentQty.get(id);
      if (isWarehouseSetAssembly(assembly)) {
        componentQty.set(id, 0);
        return 0;
      }
      const qty = stockForAssemblyAtLocation(assembly, warehouseLocationId);
      componentQty.set(id, qty);
      return qty;
    };

    (assemblies || []).forEach((a) => {
      if (!isWarehouseSetAssembly(a)) qtyForAssembly(a);
    });

    (assemblies || []).forEach((assembly) => {
      const id = String(assembly.id);
      let qty;
      if (isWarehouseSetAssembly(assembly)) {
        qty = computeWarehouseFactorySetBuildableQty(
          assembly.id,
          setItems,
          (componentId) => {
            const comp = (assemblies || []).find((row) => String(row.id) === String(componentId));
            return comp ? qtyForAssembly(comp) : 0;
          },
        );
      } else {
        qty = qtyForAssembly(assembly);
      }
      qtyById.set(id, qty);
    });

    const qtyRecord = Object.fromEntries(qtyById);
    const leftoverRecord = buildWarehouseAssemblyLeftoverQtyMap(qtyRecord, setItems, assemblies);
    const leftoverById = new Map(Object.entries(leftoverRecord));

    return {
      qtyById,
      leftoverById,
      setComponentIds: collectSetComponentAssemblyIds(setItems),
    };
  }, [
    assemblies,
    setItems,
    stockForAssemblyAtLocation,
    warehouseLocationId,
  ]);

  const assemblyMatchesCatalogSearch = useCallback((assembly, raw) => {
    if (!raw) return true;
    const qLower = raw.toLowerCase();
    const qProductKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    const qPacketKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));
    const pktList = packetsByAssembly.get(String(assembly.id)) || [];
    const cat = categoryName(assembly.category_id).toLowerCase();

    const keysOverlap = (storedSku, queryKeys, normalizer) => {
      const storedKeys = expandWarehouseSkuMatchKeys(normalizer(storedSku));
      for (const k of queryKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    };

    if (String(assembly.name || '').toLowerCase().includes(qLower)) return true;
    if (cat.includes(qLower)) return true;
    if (String(assembly.family_sku || '').toLowerCase().includes(qLower)) return true;
    if (keysOverlap(assembly.family_sku, qProductKeys, normalizeWarehouseProductSku)) return true;
    return pktList.some(
      (p) => String(p.name || '').toLowerCase().includes(qLower)
        || String(p.sku || '').toLowerCase().includes(qLower)
        || keysOverlap(p.sku, qPacketKeys, normalizeWarehousePacketScan),
    );
  }, [packetsByAssembly, categoryName]);

  const warehouseCatalogProducts = useMemo(() => {
    if (isSetsView) {
      return (assemblies || []).filter((a) => isWarehouseSetAssembly(a));
    }
    const base = (assemblies || []).filter((a) => !isWarehouseSetAssembly(a));
    return base.filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      if (isIncompleteView) return isIncompletePacketBomProduct(a, pktList);
      if (isUncategorizedView) return isUncategorizedWarehouseProduct(a, categories);
      return isCompleteCatalogProduct(a, pktList);
    });
  }, [
    assemblies,
    categories,
    isIncompleteView,
    isUncategorizedView,
    isSetsView,
    packetsByAssembly,
  ]);

  /** Physical / buildable qty (labels, packet math) — not set-component leftover. */
  const finishedStockByAssembly = useMemo(() => {
    const out = new Map();
    if (!warehouseLocationId) return out;
    const whKey = String(warehouseLocationId);
    warehouseCatalogProducts.forEach((assembly) => {
      const qty = warehouseSetStockContext.qtyById.get(String(assembly.id)) ?? 0;
      out.set(String(assembly.id), new Map([[whKey, qty]]));
    });
    return out;
  }, [warehouseCatalogProducts, warehouseSetStockContext.qtyById, warehouseLocationId]);

  /** Catalog list qty — full Floor 1 on-hand (set recipe components are normal products). */
  const catalogDisplayStockByAssembly = useMemo(() => {
    const out = new Map();
    if (!warehouseLocationId) return out;
    const whKey = String(warehouseLocationId);
    warehouseCatalogProducts.forEach((assembly) => {
      const id = String(assembly.id);
      const qty = warehouseSetStockContext.qtyById.get(id) ?? 0;
      out.set(id, new Map([[whKey, qty]]));
    });
    return out;
  }, [warehouseCatalogProducts, warehouseSetStockContext.qtyById, warehouseLocationId]);

  const filteredAssemblies = useMemo(() => {
    const raw = debouncedSearch.trim();
    const passesCategory = (a) => (
      !categoryFilter || String(a.category_id || '') === String(categoryFilter)
    );
    const base = warehouseCatalogProducts.filter(passesCategory);

    if (!raw) return base;
    return base.filter((a) => assemblyMatchesCatalogSearch(a, raw));
  }, [assemblyMatchesCatalogSearch, categoryFilter, debouncedSearch, warehouseCatalogProducts]);

  useEffect(() => {
    setListPage(1);
  }, [
    debouncedSearch,
    categoryFilter,
    catalogView,
    isSetsView,
    isIncompleteView,
    isUncategorizedView,
    isSalesStorageView,
  ]);

  const catalogPagination = useMemo(
    () => paginateList(filteredAssemblies, listPage, WAREHOUSE_CATALOG_PAGE_SIZE),
    [filteredAssemblies, listPage],
  );

  const toggleExpanded = (assemblyId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(assemblyId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openLabelPrint = (
    name,
    sku,
    defaultCopies = 1,
    assembly = null,
    assemblyColorRows = null,
    boxUnitsPerCarton = 0,
  ) => {
    const labelName = String(name || '').trim();
    const labelSku = String(sku || '').trim();
    if (!labelName || !labelSku) {
      setError('Name and SKU are required to print a label.');
      return;
    }
    const color = assembly
      ? formatWarehouseProductionLabelColor(assembly, assemblyColorRows || [])
      : '';
    setLabelPrintItem({
      name: labelName,
      sku: labelSku,
      defaultCopies,
      color,
      boxUnitsPerCarton: Math.max(0, Math.floor(Number(boxUnitsPerCarton) || 0)),
    });
  };

  const allFilteredAssemblyIds = useMemo(
    () => new Set(filteredAssemblies.map((a) => String(a.id))),
    [filteredAssemblies],
  );

  const bulkLabelAllPagesSelected = useMemo(() => {
    if (allFilteredAssemblyIds.size === 0) return false;
    return [...allFilteredAssemblyIds].every((id) => bulkLabelSelected.has(id));
  }, [allFilteredAssemblyIds, bulkLabelSelected]);

  const bulkLabelSomePagesSelected = useMemo(() => {
    if (bulkLabelAllPagesSelected) return false;
    return [...allFilteredAssemblyIds].some((id) => bulkLabelSelected.has(id));
  }, [allFilteredAssemblyIds, bulkLabelSelected, bulkLabelAllPagesSelected]);

  const handleBulkLabelSelectAllPages = (checked) => {
    setBulkLabelSelected(checked ? new Set(allFilteredAssemblyIds) : new Set());
  };

  const handleBulkLabelToggleOne = (assemblyId, checked) => {
    const key = String(assemblyId);
    setBulkLabelSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleBulkLabelPrintJobs = async (jobs) => {
    if (!jobs?.length || bulkLabelBusy) return;
    setBulkLabelBusy(true);
    setError('');
    const warnings = [];
    try {
      for (let i = 0; i < jobs.length; i += 1) {
        const job = jobs[i];
        const result = await printWarehouseProductionLabel({
          name: job.name,
          sku: job.sku,
          copies: job.copies,
          color: job.color,
          boxUnitsPerCarton: job.boxUnitsPerCarton,
        });
        const warn = String(result?.labelPrintWarning || '').trim();
        if (warn) warnings.push(`${job.sku}: ${warn}`);
      }
      if (warnings.length) {
        setError(warnings.join(' · '));
      } else {
        setBulkLabelDialogOpen(false);
      }
    } catch (err) {
      setError(err?.message || 'Bulk label print failed.');
    } finally {
      setBulkLabelBusy(false);
    }
  };

  const colorCatalogById = useMemo(
    () => new Map((variantColors || []).map((c) => [String(c.id), c])),
    [variantColors],
  );

  const colorsByAssembly = useMemo(() => {
    const out = new Map();
    (assemblyColors || []).forEach((row) => {
      const key = String(row.assembly_id);
      const color = colorCatalogById.get(String(row.color_id));
      if (!color) return;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(color);
    });
    out.forEach((list) => list.sort((a, b) => String(a.name).localeCompare(String(b.name))));
    return out;
  }, [assemblyColors, colorCatalogById]);

  const bulkLabelDialogRows = useMemo(
    () => buildWarehouseBulkLabelDialogRows(assemblies, {
      warehouseLocationId,
      finishedStockByAssembly,
      colorsByAssembly,
      packetsByAssembly,
      selectedIds: bulkLabelSelected,
    }),
    [
      assemblies,
      warehouseLocationId,
      finishedStockByAssembly,
      colorsByAssembly,
      packetsByAssembly,
      bulkLabelSelected,
    ],
  );

  const handleDeleteProduct = async (row) => {
    if (!canManage) return;
    if (!window.confirm(`Delete product "${row.name}"? This removes all warehouse stock (Floor 1 and Floor 2 WIP) and unlinks packets.`)) return;
    const targetId = String(row.id);
    const prevAssemblies = assemblies;
    setError('');
    setAssemblies((prev) => prev.filter((a) => String(a.id) !== targetId));
    setSaving(true);
    try {
      await deleteWarehouseAssembly(targetId);
      await refreshCatalog();
    } catch (err) {
      setAssemblies(prevAssemblies);
      setError(err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePacket = async (row) => {
    if (!canManage) return;
    if (!window.confirm(`Delete packet ${row.sku}?`)) return;
    setSaving(true);
    try {
      await deleteWarehousePacket(row.id);
      await refreshCatalog();
    } catch (err) {
      setError(err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePacketQtyBlur = async (packet, rawValue) => {
    if (!canManage || !warehouseLocationId) return;
    const qty = Math.max(0, Number(rawValue) || 0);
    try {
      await setWarehousePacketQuantity(packet.id, warehouseLocationId, qty);
      await refreshCatalog();
    } catch (err) {
      setError(err?.message || 'Quantity update failed');
    }
  };

  const openFinishedStockEditor = useCallback((assembly, displayQty) => {
    const id = String(assembly?.id || '');
    if (!id) return;
    setStockEditAssemblyId(id);
    setStockQtyDraftById((prev) => ({ ...prev, [id]: String(Math.max(0, Math.floor(Number(displayQty) || 0))) }));
  }, []);

  const patchAssemblyInventoryQty = useCallback((assemblyId, quantity) => {
    if (!warehouseLocationId) return;
    const loc = String(warehouseLocationId);
    const asmKey = String(assemblyId);
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    setAssemblyInventory((prev) => {
      const rows = (prev || []).map((row) => ({ ...row }));
      const idx = rows.findIndex(
        (row) => String(row.assembly_id) === asmKey && String(row.location_id) === loc,
      );
      if (idx >= 0) rows[idx] = { ...rows[idx], quantity: qty };
      else rows.push({ assembly_id: assemblyId, location_id: warehouseLocationId, quantity: qty });
      return rows;
    });
  }, [warehouseLocationId]);

  const patchAfterSetRecipeSave = useCallback((setId, result) => {
    const built = Math.max(0, Math.floor(Number(result?.component_sets_built) || 0));
    if (!built || !warehouseLocationId) return;
    const loc = String(warehouseLocationId);
    const lines = expandWarehouseSetItemsRows(setItems).filter(
      (row) => String(row.set_assembly_id) === String(setId)
        && String(row.location_id) === String(WAREHOUSE_FACTORY_LOCATION_ID),
    );
    setAssemblyInventory((prev) => {
      const rows = (prev || []).map((row) => ({ ...row }));
      const upsertQty = (assemblyId, quantity) => {
        const asmKey = String(assemblyId);
        const qty = Math.max(0, Math.floor(Number(quantity) || 0));
        const idx = rows.findIndex(
          (row) => String(row.assembly_id) === asmKey && String(row.location_id) === loc,
        );
        if (idx >= 0) rows[idx] = { ...rows[idx], quantity: qty };
        else rows.push({ assembly_id: assemblyId, location_id: warehouseLocationId, quantity: qty });
      };
      upsertQty(setId, result.quantity);
      lines.forEach((line) => {
        const componentId = String(line.component_assembly_id || '').trim();
        if (!componentId) return;
        const perSet = Math.max(1, Number(line.quantity) || 1);
        const deduct = built * perSet;
        const idx = rows.findIndex(
          (row) => String(row.assembly_id) === componentId && String(row.location_id) === loc,
        );
        const current = idx >= 0 ? Math.max(0, Math.floor(Number(rows[idx].quantity) || 0)) : 0;
        upsertQty(componentId, Math.max(0, current - deduct));
      });
      return rows;
    });
  }, [setItems, warehouseLocationId]);

  const handleSaveFinishedAssemblyQty = async (assembly, { warehouseBoxEntry: boxEntry, unitsPerBox: upb }) => {
    if (!canManage || !warehouseLocationId) return;
    const id = String(assembly?.id || '').trim();
    if (!id) return;
    const raw = stockQtyDraftById[id];
    const displayQty = Math.max(0, Math.floor(Number(raw) || 0));
    const finishedUnits = boxEntry ? finishedUnitsFromBoxCount(displayQty, upb) : displayQty;
    setSaving(true);
    setError('');
    try {
      if (isWarehouseSetAssembly(assembly)) {
        const result = await setWarehouseSetQuantityFromRecipe(id, warehouseLocationId, finishedUnits);
        patchAfterSetRecipeSave(id, result);
      } else {
        await setWarehouseAssemblyProductQuantity(id, warehouseLocationId, finishedUnits);
        patchAssemblyInventoryQty(id, finishedUnits);
      }
      setStockEditAssemblyId('');
      setStockQtyDraftById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      void refreshCatalog();
    } catch (err) {
      setError(err?.message || 'Quantity update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAssemblyImageUpdated = useCallback((assemblyId, imageUrl) => {
    setAssemblies((prev) => prev.map((row) => (
      String(row.id) === String(assemblyId) ? { ...row, image_url: imageUrl } : row
    )));
  }, []);

  const handleAssemblyFieldsUpdated = useCallback((assemblyId, patch) => {
    setAssemblies((prev) => prev.map((row) => (
      String(row.id) === String(assemblyId) ? { ...row, ...patch } : row
    )));
  }, []);

  return (
    <>
    <div
      className={`products-container warehouse-products-page${embedInHub ? ' warehouse-products-page--hub' : ''}`}
      style={{ maxWidth: embedInHub ? 1180 : 1100, margin: '0 auto', padding: embedInHub ? '0 16px 20px' : 16 }}
    >
      {error ? (
        <div className="warehouse-catalog-error" role="alert">{error}</div>
      ) : null}

      {!embedInHub ? (
        <div className="page-header-row warehouse-page-header-row">
          <BackToDashboard />
          <h1 className="products-title" style={{ margin: 0 }}>
            {isSalesStorageView
              ? 'Sales Storage (Warehouse)'
              : isIncompleteView
                ? 'Incomplete products (Warehouse)'
                : isUncategorizedView
                  ? 'Uncategorized products (Warehouse)'
                  : isSetsView
                    ? 'Sets (Warehouse)'
                    : 'Warehouse'}
          </h1>
          <div className="warehouse-page-header-row__tools">
            <label className="portal-hub-bar__select-wrap warehouse-page-header-row__view">
              <span className="portal-hub-bar__select-label">View</span>
              <WarehouseCatalogViewToggle />
            </label>
            <WarehouseCatalogCreateActions
              canManage={canManage}
              canAddProduct={canAddProduct}
              hidden={isSalesStorageView}
            />
          </div>
        </div>
      ) : null}

      {isSalesStorageView ? (
        <WarehouseSalesStoragePanel onStockChanged={() => refreshCatalog()} />
      ) : (
        <>
      <div className={`warehouse-catalog-filter-row${embedInHub ? ' warehouse-catalog-filter-row--flat' : ''}`}>
        <input
          className="warehouse-catalog-filter-control warehouse-catalog-search products-search-bar"
          placeholder={isSetsView
            ? 'Search sets (SKU, name)…'
            : 'Search product SKU, packet SKU, name…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v) return;
            const normalized = normalizeWarehouseCatalogSearchQuery(v);
            if (normalized && normalized !== v) setSearch(normalized);
          }}
        />
        <select
          className="warehouse-catalog-filter-control warehouse-catalog-category-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {filteredAssemblies.length === 0 ? (
            <p>
              {isUncategorizedView
                ? 'No uncategorized products — every product has a category assigned.'
                : isIncompleteView
                  ? 'No incomplete products — all packet BOMs match their carton counts.'
                  : isSetsView
                    ? (
                      debouncedSearch.trim()
                        ? 'No matching sets.'
                        : (
                          <>
                            No sets yet.{' '}
                            {canAddProduct ? (
                              <Link to="/warehouse-products/new?kind=set">Create a set</Link>
                            ) : (
                              'Ask a catalog manager to create one.'
                            )}
                            {' '}
                            Use View → Products for seater units and other set recipe lines.
                          </>
                        )
                    )
                    : (
                    <>
                      No products yet. Create packets on{' '}
                      <Link to="/warehouse-products/packets">Packets (Warehouse)</Link>
                      , then add a product and link them.
                    </>
                  )}
            </p>
          ) : null}

          <WarehouseCatalogListPager
            page={catalogPagination.page}
            pageCount={catalogPagination.pageCount}
            total={catalogPagination.total}
            onPageChange={setListPage}
            itemLabel="products"
          />

          {canPrintLabels && filteredAssemblies.length > 0 ? (
            <WarehouseCatalogListChrome
              selectAllChecked={bulkLabelAllPagesSelected}
              selectAllIndeterminate={bulkLabelSomePagesSelected}
              onSelectAll={handleBulkLabelSelectAllPages}
              selectedCount={bulkLabelSelected.size}
              onBulkPrintClick={() => setBulkLabelDialogOpen(true)}
              bulkBusy={bulkLabelBusy}
              disabled={!warehouseLocationId}
              showFunnel={!isSalesStorageView}
            />
          ) : null}

          <div className="warehouse-assembly-card-list">
            {catalogPagination.items.map((assembly) => {
              const pktList = packetsByAssembly.get(String(assembly.id)) || [];
              const stockByLoc = catalogDisplayStockByAssembly.get(String(assembly.id)) || new Map();
              const complete = stockByLoc.get(String(warehouseLocationId)) ?? 0;
              const isOpen = expanded.has(String(assembly.id));
              const totalPackets = Number(assembly.packet_count) || 0;
              const bom = analyzeAssemblyPacketBom(totalPackets, pktList);
              const assemblyColorsList = colorsByAssembly.get(String(assembly.id)) || [];
              const usePacketStock = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
              const useFinishedBoxReceiving = assemblyUsesFinishedBoxReceiving(assembly, pktList);
              const unitsPerBox = assemblyUnitsPerCarton(assembly);
              const stockDisplay = isWarehouseSetAssembly(assembly)
                ? formatWarehouseSetStockCount(complete)
                : unitsPerBox > 1 && !usePacketStock
                  ? formatWarehouseBoxAndUnitStock(complete, unitsPerBox).text
                  : String(complete);
              const warehousePacketOnHand = usePacketStock
                ? pktList.reduce((sum, p) => sum + (inventoryByPacketId.get(String(p.id)) ?? 0), 0)
                : 0;
              const poolOpts = {
                assemblyId: assembly.id,
                assemblyPacketRows,
                catalogPackets: packets,
              };
              const warehouseBottleneck = usePacketStock
                ? packetBomBottleneck(pktList, inventoryByPacketId, poolOpts)
                : null;
              const warehouseOnHand = stockByLoc.get(String(warehouseLocationId)) ?? 0;
              const warehouseBoxEntry = unitsPerBox > 1 && warehouseLocationId;
              const warehouseDisplayQty = warehouseBoxEntry
                ? boxCountFromFinishedUnits(warehouseOnHand, unitsPerBox)
                : warehouseOnHand;
              const labelPlan = resolveWarehouseLabelPrintPlan(
                assembly,
                warehouseLocationId,
                finishedStockByAssembly,
                pktList,
              );
              const labelCopiesAtWarehouse = labelPlan?.copies ?? 0;
              const boxUnitsForLabel = assemblyUsesWarehouseBoxLabels(assembly, pktList)
                ? unitsPerBox
                : 0;
              return (
                <div key={assembly.id} className="warehouse-assembly-card">
                  <div
                    className={`warehouse-assembly-card__header${
                      canPrintLabels ? ' warehouse-assembly-card__header--bulk' : ''
                    }`}
                  >
                    {canPrintLabels ? (
                      <WarehouseBulkLabelSelectCheckbox
                        assemblyId={assembly.id}
                        checked={bulkLabelSelected.has(String(assembly.id))}
                        copies={labelCopiesAtWarehouse}
                        disabled={bulkLabelBusy}
                        onChange={handleBulkLabelToggleOne}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="warehouse-assembly-card__expand"
                      onClick={() => toggleExpanded(assembly.id)}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse packets' : 'Show packets'}
                    >
                      <span className="warehouse-assembly-card__expand-icon" aria-hidden />
                    </button>
                    <WarehouseAssemblyThumbnail
                      assembly={assembly}
                      canEdit={canManage}
                      onUpdated={handleAssemblyImageUpdated}
                      onError={(msg) => setError(msg)}
                    />
                    <div className="warehouse-assembly-card__main">
                      <div className="warehouse-assembly-card__title-row">
                        <span className={`warehouse-kind-badge warehouse-kind-badge--${isWarehouseSetAssembly(assembly) ? 'set' : 'product'}`}>
                          {isWarehouseSetAssembly(assembly) ? 'Set' : 'Product'}
                        </span>
                        <WarehouseAssemblyInlineName
                          assembly={assembly}
                          canEdit={canManage}
                          onUpdated={handleAssemblyFieldsUpdated}
                          onError={(msg) => setError(msg)}
                        />
                      </div>
                      <div className="warehouse-assembly-card__meta">
                        <WarehouseAssemblyInlineSku
                          assembly={assembly}
                          canEdit={canManage}
                          onUpdated={handleAssemblyFieldsUpdated}
                          onError={(msg) => setError(msg)}
                        />
                        <span>
                          {assemblyUsesPacketBom(assembly)
                            ? (totalPackets
                              ? (bom.isComplete
                                ? `${bom.cartonsPerUnit}/${totalPackets} cartons per unit · BOM complete`
                                : `${bom.cartonsPerUnit}/${totalPackets} cartons (${bom.linked} packet line(s)) · BOM incomplete`)
                              : 'Set total packets on product')
                            : (useFinishedBoxReceiving
                              ? `${unitsPerBox} units per box · enter stock on linked box packet`
                              : (unitsPerBox > 1
                                ? `${unitsPerBox} finished units per box · enter boxes at Warehouse below`
                                : 'Finished stock only (no packet BOM)'))}
                        </span>
                        <span>
                          Category:{' '}
                          {canManage ? (
                            <button
                              type="button"
                              className="warehouse-assembly-card__category-link"
                              onClick={() => setCategoryDialogAssembly(assembly)}
                            >
                              {categoryName(assembly.category_id)}
                            </button>
                          ) : (
                            categoryName(assembly.category_id)
                          )}
                        </span>
                      </div>
                      <WarehouseAssemblyInlineSpecs
                        assembly={assembly}
                        canEdit={canManage}
                        onUpdated={handleAssemblyFieldsUpdated}
                        onError={(msg) => setError(msg)}
                      />
                      {assemblyColorsList.length > 0 ? (
                        <div className="warehouse-assembly-card__colors">
                          {assemblyColorsList.map((c) => (
                            <WarehouseColorChip key={c.id} name={c.name} className="warehouse-color-chip--compact" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="warehouse-assembly-card__stock">
                      <div className="warehouse-assembly-card__stock-label">
                        {usePacketStock
                          ? `Complete units @ ${warehouseLocationName}`
                          : `Finished @ ${warehouseLocationName}`}
                      </div>
                      <strong
                        className={`warehouse-assembly-card__stock-qty${
                          complete > 0 ? ' warehouse-assembly-card__stock-qty--positive' : ''
                        }`}
                      >
                        {stockDisplay}
                      </strong>
                      {canManage && !usePacketStock && !useFinishedBoxReceiving && warehouseLocationId ? (
                        stockEditAssemblyId === String(assembly.id) ? (
                          <div className="floor2-stock-editor" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className="kitwe-cell-input"
                              style={{ width: 84, textAlign: 'center' }}
                              value={stockQtyDraftById[String(assembly.id)] ?? ''}
                              disabled={saving}
                              onChange={(e) => setStockQtyDraftById((prev) => ({
                                ...prev,
                                [String(assembly.id)]: e.target.value,
                              }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveFinishedAssemblyQty(assembly, {
                                    warehouseBoxEntry,
                                    unitsPerBox,
                                  });
                                }
                              }}
                              aria-label={`Set qty for ${assembly.name}`}
                            />
                            <button
                              type="button"
                              className="kitwe-btn kitwe-btn-primary kitwe-btn-compact"
                              disabled={saving}
                              onClick={() => handleSaveFinishedAssemblyQty(assembly, {
                                warehouseBoxEntry,
                                unitsPerBox,
                              })}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="kitwe-btn kitwe-btn-secondary kitwe-btn-compact"
                              disabled={saving}
                              onClick={() => {
                                setStockEditAssemblyId('');
                                setStockQtyDraftById((prev) => {
                                  const next = { ...prev };
                                  delete next[String(assembly.id)];
                                  return next;
                                });
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="kitwe-btn kitwe-btn-primary kitwe-btn-compact"
                            style={{ marginTop: 10 }}
                            onClick={() => openFinishedStockEditor(
                              assembly,
                              warehouseBoxEntry ? warehouseDisplayQty : warehouseOnHand,
                            )}
                          >
                            Change qty
                          </button>
                        )
                      ) : null}
                      {usePacketStock && complete === 0 ? (
                        <p className="warehouse-assembly-card__stock-hint">
                          {warehousePacketOnHand === 0
                            ? 'BOM is set — expand and enter on-hand qty on each packet at warehouse.'
                            : warehouseBottleneck
                              ? `Limiting packet: ${warehouseBottleneck.packet.sku} — on hand ${warehouseBottleneck.onHand}, need ${warehouseBottleneck.need} per unit (save product after changing qty per product).`
                              : 'Not enough on one or more packets to build 1 unit.'}
                        </p>
                      ) : null}
                    </div>
                    {canPrintLabels ? (
                      <div className="warehouse-assembly-card__actions">
                        <div className="warehouse-assembly-card__actions-row">
                          <WarehouseLabelPrintIconButton
                            onClick={() => openLabelPrint(
                              assembly.name,
                              assembly.family_sku,
                              Math.max(1, labelCopiesAtWarehouse),
                              assembly,
                              assemblyColorsList,
                              boxUnitsForLabel,
                            )}
                          />
                          {canManage ? (
                            <button
                              type="button"
                              className="warehouse-card-btn"
                              style={{ flex: 1 }}
                              onClick={() => navigate(`/warehouse-products/${assembly.id}/edit`)}
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            className="warehouse-card-btn warehouse-card-btn--danger"
                            onClick={() => handleDeleteProduct(assembly)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ) : canManage ? (
                      <div className="warehouse-assembly-card__actions">
                        <div className="warehouse-assembly-card__actions-row">
                          <button
                            type="button"
                            className="warehouse-card-btn"
                            style={{ flex: 1 }}
                            onClick={() => navigate(`/warehouse-products/${assembly.id}/edit`)}
                          >
                            Edit
                          </button>
                        </div>
                        <button
                          type="button"
                          className="warehouse-card-btn warehouse-card-btn--danger"
                          onClick={() => handleDeleteProduct(assembly)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {isOpen && useFinishedBoxReceiving && pktList.length === 1 && (
                    <div className="warehouse-finished-box-stock-panel">
                      <p className="warehouse-field-hint" style={{ padding: '8px 12px', margin: 0 }}>
                        Enter <strong>boxes</strong> on the packet line below. Finished units = boxes × {unitsPerBox}.
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ background: '#0f172a' }}>
                            <th style={{ padding: 8, textAlign: 'left' }}>Box packet</th>
                            <th style={{ padding: 8, textAlign: 'right' }}>Boxes on hand</th>
                            <th style={{ padding: 8, textAlign: 'right' }}>Finished units</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pktList.map((packet) => {
                            const boxes = inventoryByPacketId.get(String(packet.id)) ?? 0;
                            const units = finishedUnitsFromBoxCount(boxes, unitsPerBox);
                            return (
                              <tr key={packet.id}>
                                <td style={{ padding: 8 }}>
                                  <code>{packet.sku}</code> {packet.name}
                                </td>
                                <td style={{ padding: 8, textAlign: 'right' }}>
                                  {canManage ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      className="warehouse-qty-input"
                                      defaultValue={boxes}
                                      key={`box-${packet.id}-${boxes}`}
                                      onBlur={(e) => handlePacketQtyBlur(packet, e.target.value)}
                                      style={{ width: 72, textAlign: 'right' }}
                                    />
                                  ) : (
                                    boxes
                                  )}
                                </td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{units}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {isOpen && !usePacketStock && !useFinishedBoxReceiving && warehouseLocationId && (
                    <table className="warehouse-finished-stock-table">
                      <thead>
                        <tr>
                          <th>{warehouseLocationName}</th>
                          <th style={{ textAlign: 'right' }}>
                            {unitsPerBox > 1 ? 'Cartons on hand' : 'Finished on hand'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            {unitsPerBox > 1 ? (
                              <span className="warehouse-field-hint">
                                ×{unitsPerBox} units per carton
                              </span>
                            ) : (
                              warehouseLocationName
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {canManage ? (
                              <div className="floor2-stock-editor" style={{ justifyContent: 'flex-end' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="kitwe-cell-input"
                                  style={{ width: 84, textAlign: 'center' }}
                                  value={
                                    stockQtyDraftById[String(assembly.id)]
                                    ?? String(warehouseBoxEntry ? warehouseDisplayQty : warehouseOnHand)
                                  }
                                  disabled={saving}
                                  onChange={(e) => setStockQtyDraftById((prev) => ({
                                    ...prev,
                                    [String(assembly.id)]: e.target.value,
                                  }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveFinishedAssemblyQty(assembly, {
                                        warehouseBoxEntry,
                                        unitsPerBox,
                                      });
                                    }
                                  }}
                                  aria-label={`Finished on hand for ${assembly.name}`}
                                />
                                <button
                                  type="button"
                                  className="kitwe-btn kitwe-btn-primary kitwe-btn-compact"
                                  disabled={saving}
                                  onClick={() => handleSaveFinishedAssemblyQty(assembly, {
                                    warehouseBoxEntry,
                                    unitsPerBox,
                                  })}
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <strong
                                className={`warehouse-assembly-card__stock-qty${
                                  warehouseOnHand > 0 ? ' warehouse-assembly-card__stock-qty--positive' : ''
                                }`}
                              >
                                {warehouseBoxEntry
                                  ? `${warehouseDisplayQty} boxes (${warehouseOnHand} units)`
                                  : isWarehouseSetAssembly(assembly)
                                    ? formatWarehouseSetStockCount(warehouseOnHand)
                                    : warehouseOnHand}
                              </strong>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  {isOpen && usePacketStock && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: '#0f172a' }}>
                          <th style={{ padding: 8, textAlign: 'left' }}>Kind</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>Pkt</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>SKU</th>
                          <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>On hand ({warehouseLocationName})</th>
                          {canManage && <th style={{ padding: 8 }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pktList.length === 0 ? (
                          <tr>
                            <td colSpan={canManage ? 6 : 5} style={{ padding: 12, textAlign: 'center' }}>
                              No packets linked — edit product to attach packets.
                            </td>
                          </tr>
                        ) : pktList.map((packet) => {
                          const onHand = inventoryByPacketId.get(String(packet.id)) ?? 0;
                          const isBottleneck = pktList.length > 0 && complete > 0
                            && onHand === Math.min(...pktList.map((p) => inventoryByPacketId.get(String(p.id)) ?? 0));
                          return (
                            <tr key={packet.id}>
                              <td style={{ padding: 8 }}>
                                <span className="warehouse-kind-badge warehouse-kind-badge--packet">Packet</span>
                              </td>
                              <td style={{ padding: 8 }}>
                                {totalPackets
                                ? `${String(packet.packet_number).padStart(2, '0')}/${totalPackets}`
                                : `#${packet.packet_number}`}
                              </td>
                              <td style={{ padding: 8, fontFamily: 'monospace', fontSize: '0.8rem' }}>{packet.sku}</td>
                              <td style={{ padding: 8 }}>{packet.name}</td>
                              <td style={{ padding: 8, textAlign: 'right' }}>
                                {canManage ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="warehouse-qty-input"
                                    defaultValue={onHand}
                                    key={`${packet.id}-${onHand}`}
                                    onBlur={(e) => handlePacketQtyBlur(packet, e.target.value)}
                                    style={{
                                      width: 72,
                                      textAlign: 'right',
                                      borderColor: isBottleneck ? '#fbbf24' : undefined,
                                    }}
                                  />
                                ) : (
                                  <span style={{ color: isBottleneck ? '#fbbf24' : undefined }}>{onHand}</span>
                                )}
                              </td>
                              {canManage && (
                                <td style={{ padding: 8 }}>
                                  <WarehouseLabelPrintIconButton
                                    onClick={() => openLabelPrint(
                                      packet.name,
                                      packet.sku,
                                      Math.max(1, labelCopiesAtWarehouse),
                                      assembly,
                                      assemblyColorsList,
                                      boxUnitsForLabel,
                                    )}
                                  />
                                  {' '}
                                  <button type="button" onClick={() => navigate(`/warehouse-products/packets/${packet.id}/edit`)}>Edit</button>
                                  {' '}
                                  <button type="button" onClick={() => handleDeletePacket(packet)}>Delete</button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          <WarehouseCatalogListPager
            page={catalogPagination.page}
            pageCount={catalogPagination.pageCount}
            total={catalogPagination.total}
            onPageChange={setListPage}
            itemLabel="products"
          />
        </>
      )}
        </>
      )}

    </div>
    <WarehouseProductionLabelPrintDialog
      open={Boolean(labelPrintItem)}
      item={labelPrintItem}
      onClose={() => setLabelPrintItem(null)}
    />
    <WarehouseCatalogBulkLabelDialog
      open={bulkLabelDialogOpen}
      rows={bulkLabelDialogRows}
      busy={bulkLabelBusy}
      onClose={() => setBulkLabelDialogOpen(false)}
      onPrint={handleBulkLabelPrintJobs}
    />
    <WarehouseAssemblyCategoryDialog
      open={Boolean(categoryDialogAssembly)}
      assembly={categoryDialogAssembly}
      categories={categories}
      onClose={() => setCategoryDialogAssembly(null)}
      onCategoriesChange={setCategories}
      onUpdated={handleAssemblyFieldsUpdated}
      onError={(msg) => setError(msg)}
    />
    </>
  );
}
