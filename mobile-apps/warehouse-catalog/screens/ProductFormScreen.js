import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView as ModalScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import WarehouseCatalogFormScroll from '../shared/WarehouseCatalogFormScroll';
import {
  formatWarehouseMobileApiError,
  warehouseMobileRequest,
} from '../shared/warehouseMobileApi';
import { useWarehouseCatalog } from '../shared/WarehouseCatalogContext';
import {
  fetchWarehouseCatalogCached,
  getWarehouseCatalogCache,
  mergeAssemblyIntoCatalog,
  qtyPatchFromMobileQuantityResponse,
} from '../shared/warehouseCatalogStore';
import {
  expandWarehouseSkuMatchKeys,
  isExactPacketSkuScan,
  isWarehousePacketCartonSku,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  normalizeWarehouseWedgeScanInput,
  resolvePacketFromScan,
} from '../shared/warehouseScanResolver';
import { analyzeAssemblyPacketBom } from '../shared/warehouseCatalogProductCompleteness';
import { returnToCatalogListScreen } from '../shared/warehouseCatalogNavigation';
import { theme } from '../shared/theme';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { LABEL_NAME_MEMORY_KIND } from '../shared/warehouseLabelOcrName';
import { rememberLabelName } from '../shared/warehouseLabelNameMemory';
import { catalogStockMaps } from '../shared/warehouseCatalogStockMaps';
import GenerateRandomSkuButton from '../shared/GenerateRandomSkuButton';
import { formButtonStyles } from '../shared/formButtonStyles';
import {
  finishedUnitsFromBoxCount,
  formatWarehouseBoxAndUnitStock,
} from '../shared/warehouseUnitsPerCarton';
import CatalogProductPhotoCaptureModal, {
  CatalogProductPhotoField,
} from '../shared/CatalogProductPhotoCapture';
import { prepareCatalogPhotoForUpload } from '../shared/prepareCatalogPhotoUpload';
import { attachCatalogProductPhotoWithAi } from '../shared/catalogPhotoApi';
import { resolveWarehouseCategoryNameFromList } from '../shared/warehouseCategoryLookup';

const INVENTORY_FINISHED = 'finished';
const INVENTORY_PACKETS = 'packets';

export default function ProductFormScreen({ route, navigation }) {
  const prefill = route.params?.prefill || {};
  const editAssemblyId = route.params?.editAssemblyId
    ? String(route.params.editAssemblyId)
    : '';
  const bomEditMode = Boolean(editAssemblyId);
  const editFromComplete = Boolean(route.params?.editFromComplete);
  const existing = Boolean(route.params?.existing && prefill.id);
  const [catalog, setCatalog] = useState(route.params?.catalogSnapshot || null);
  const [name, setName] = useState(prefill.name || '');
  const [turkishName, setTurkishName] = useState('');
  const [unitsPerCarton, setUnitsPerCarton] = useState('1');
  const [familySku, setFamilySku] = useState(prefill.family_sku || '');
  const [finishedOnly, setFinishedOnly] = useState(false);
  const [packetCount, setPacketCount] = useState(prefill.packet_count || '');
  const [categoryId, setCategoryId] = useState(prefill.category_id || '');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [hasColorVariants, setHasColorVariants] = useState(false);
  const [colorIds, setColorIds] = useState([]);
  const [colorDraft, setColorDraft] = useState('');
  const [packetLinks, setPacketLinks] = useState([]);
  const [packetSearch, setPacketSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [skuGenBusy, setSkuGenBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryAddBusy, setCategoryAddBusy] = useState(false);
  const [finishedQtyPrompt, setFinishedQtyPrompt] = useState(null);
  const [finishedQtyValue, setFinishedQtyValue] = useState('0');
  const [finishedQtySaving, setFinishedQtySaving] = useState(false);
  const [productPhoto, setProductPhoto] = useState(null);
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false);
  const productPhotoRef = useRef(null);
  productPhotoRef.current = productPhoto;
  const skuInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const turkishNameInputRef = useRef(null);
  const packetSearchInputRef = useRef(null);
  const scrollRef = useRef(null);
  const packetSearchSectionY = useRef(0);
  const packetSearchRef = useRef('');
  const packetSearchPrevLenRef = useRef(0);
  const bomHydratedRef = useRef(false);
  const initialSkuFocusRef = useRef(false);
  const familySkuRef = useRef(familySku);
  familySkuRef.current = familySku;
  const packetLinksRef = useRef(packetLinks);
  packetLinksRef.current = packetLinks;
  const {
    keepFocusAfterSubmit: keepSkuKeyboard,
    wrapOnBlur: wrapSkuBlur,
    stripScanTerminator: stripSkuTerminator,
  } = useKeepSoftKeyboardOnScanSubmit(skuInputRef);
  const {
    keepFocusAfterSubmit: keepPacketSearchKeyboard,
    wrapOnBlur: wrapPacketSearchBlur,
    stripScanTerminator: stripPacketSearchTerminator,
  } = useKeepSoftKeyboardOnScanSubmit(packetSearchInputRef);

  const warehouseLocationId = useMemo(
    () => catalog?.warehouseLocationId
      || route.params?.warehouseLocationId
      || route.params?.catalogSnapshot?.warehouseLocationId
      || null,
    [catalog, route.params?.warehouseLocationId, route.params?.catalogSnapshot],
  );
  const warehouseLocationName = useMemo(
    () => catalog?.warehouseLocationName
      || route.params?.catalogSnapshot?.warehouseLocationName
      || 'Warehouse',
    [catalog, route.params?.catalogSnapshot],
  );

  const focusSku = useCallback(() => {
    setTimeout(() => skuInputRef.current?.focus?.(), 50);
  }, []);

  const { refresh: refreshGlobalCatalog, patchCatalog, applyCatalog } = useWarehouseCatalog();

  const refreshCatalog = useCallback(async () => {
    try {
      const data = await fetchWarehouseCatalogCached({ force: false, fullPackets: true });
      setCatalog(data);
    } catch {
      /* keep last catalog if refresh fails */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshGlobalCatalog({ background: true, fullPackets: true }).catch(() => {});
      if (!catalog) refreshCatalog();
      if (!existing && !bomEditMode && !initialSkuFocusRef.current) {
        initialSkuFocusRef.current = true;
        focusSku();
      }
    }, [bomEditMode, catalog, existing, focusSku, refreshCatalog, refreshGlobalCatalog]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!bomEditMode || bomHydratedRef.current || !editAssemblyId || !catalog?.assemblies) return;
      const assembly = (catalog.assemblies || []).find(
        (a) => String(a.id) === editAssemblyId,
      );
      if (!assembly) {
        bomHydratedRef.current = true;
        return;
      }
      setName(assembly.name || '');
      setFamilySku(assembly.family_sku || '');
      setCategoryId(assembly.category_id || '');
      setPacketCount(assembly.packet_count != null ? String(assembly.packet_count) : '');
      setFinishedOnly(false);
      setHasColorVariants(Boolean(assembly.has_color_variants));
      const colorRows = (catalog.assemblyColors || []).filter(
        (row) => String(row.assembly_id) === editAssemblyId,
      );
      setColorIds(colorRows.map((row) => row.color_id).filter(Boolean));
      const links = (catalog.assemblyPackets || [])
        .filter((row) => String(row.assembly_id) === editAssemblyId)
        .map((row) => ({
          packet_id: row.packet_id,
          qty_per_unit: Math.max(1, Number(row.qty_per_unit) || 1),
        }));
      setPacketLinks(links);
      bomHydratedRef.current = true;
    }, [bomEditMode, catalog, editAssemblyId]),
  );

  const categories = catalog?.categories || [];
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => String(a.name || '').localeCompare(
      String(b.name || ''),
      undefined,
      { sensitivity: 'base' },
    )),
    [categories],
  );
  const selectedCategoryLabel = useMemo(() => {
    if (!categoryId) return 'Select category';
    const row = sortedCategories.find((c) => String(c.id) === String(categoryId));
    if (row?.name) return row.name;
    const resolved = resolveWarehouseCategoryNameFromList(categoryId, categories);
    return resolved || 'Select category';
  }, [categories, categoryId, sortedCategories]);
  const colors = catalog?.colors || [];
  const packets = catalog?.packets || [];

  const packetAssignedToProduct = useMemo(() => {
    const assigned = new Set();
    (catalog?.assemblyPackets || []).forEach((row) => {
      if (row?.packet_id) assigned.add(String(row.packet_id));
    });
    (packets || []).forEach((p) => {
      if (p?.assembly_id) assigned.add(String(p.id));
    });
    return assigned;
  }, [catalog?.assemblyPackets, packets]);

  const title = useMemo(() => {
    if (bomEditMode) return editFromComplete ? 'Edit packet BOM' : 'Complete packet BOM';
    if (existing) return 'Product (known SKU)';
    return 'New product';
  }, [bomEditMode, editFromComplete, existing]);

  const showPacketBomFields = (!existing || bomEditMode) && !finishedOnly;

  const linkedColorNames = useMemo(() => {
    const map = new Map(colors.map((c) => [String(c.id), c.name]));
    return colorIds.map((id) => map.get(String(id)) || id);
  }, [colorIds, colors]);

  const packetSearchResults = useMemo(() => {
    const raw = packetSearch.trim();
    if (!raw) return [];
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));
    const linked = new Set(packetLinks.map((l) => String(l.packet_id)));
    return packets
      .filter((p) => !linked.has(String(p.id)))
      .filter((p) => {
        const nameMatch = String(p.name || '').toLowerCase().includes(raw.toLowerCase());
        if (nameMatch) return true;
        const stored = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(p.sku));
        for (const k of qKeys) {
          if (k && stored.has(k)) return true;
        }
        return String(p.sku || '').toLowerCase().includes(raw.toLowerCase());
      })
      .sort((a, b) => {
        const aAssigned = packetAssignedToProduct.has(String(a.id));
        const bAssigned = packetAssignedToProduct.has(String(b.id));
        if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
        return String(a.sku || '').localeCompare(String(b.sku || ''), undefined, {
          sensitivity: 'base',
        });
      })
      .slice(0, 12);
  }, [packetSearch, packets, packetLinks, packetAssignedToProduct]);

  const normalizeSkuField = () => {
    const normalized = normalizeWarehouseProductSku(familySku);
    if (normalized && normalized !== familySku.trim()) setFamilySku(normalized);
  };

  const addCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || categoryAddBusy) return;
    setCategoryAddBusy(true);
    setError('');
    try {
      const { category } = await warehouseMobileRequest('category-create', { name: trimmed });
      setCatalog((prev) => ({
        ...(prev || {}),
        categories: [...(prev?.categories || []), category].sort((a, b) =>
          String(a.name).localeCompare(String(b.name))),
      }));
      setCategoryId(category.id);
      setNewCategoryName('');
      setCategoryPickerOpen(false);
      setNotice(`Category "${category.name}" added.`);
    } catch (err) {
      setError(err?.message || 'Failed to add category');
    } finally {
      setCategoryAddBusy(false);
    }
  };

  const addColor = async () => {
    const trimmed = colorDraft.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const { color } = await warehouseMobileRequest('color-find-or-create', { name: trimmed });
      setCatalog((prev) => ({
        ...(prev || {}),
        colors: [...(prev?.colors || []).filter((c) => String(c.id) !== String(color.id)), color],
      }));
      if (!colorIds.some((id) => String(id) === String(color.id))) {
        setColorIds((prev) => [...prev, color.id]);
      }
      setColorDraft('');
    } catch (err) {
      setError(err?.message || 'Failed to add color');
    } finally {
      setBusy(false);
    }
  };

  const addPacketLink = useCallback((packet, { clearSearch = false } = {}) => {
    if (!packet?.id) return false;
    const packetId = String(packet.id);
    let added = false;
    setPacketLinks((prev) => {
      if (prev.some((l) => String(l.packet_id) === packetId)) return prev;
      added = true;
      const defaultQty = Math.max(1, Number(packet?.qty_per_unit) || 1);
      return [...prev, { packet_id: packet.id, qty_per_unit: defaultQty }];
    });
    if (!added) return false;
    if (clearSearch) {
      setPacketSearch('');
      packetSearchRef.current = '';
      packetSearchPrevLenRef.current = 0;
    }
    keepPacketSearchKeyboard();
    return true;
  }, [keepPacketSearchKeyboard]);

  const tryAddPacketFromScan = useCallback((scanValue, { allowPrefixMatch = false } = {}) => {
    const normalized = normalizeWarehousePacketScan(scanValue) || String(scanValue || '').trim();
    if (!normalized) return false;
    const linked = new Set(packetLinksRef.current.map((l) => String(l.packet_id)));
    const pool = (packets || []).filter((p) => !linked.has(String(p.id)));
    const match = resolvePacketFromScan(normalized, pool);
    if (!match) {
      setPacketSearch(normalized);
      packetSearchRef.current = normalized;
      return false;
    }
    if (!allowPrefixMatch && !isExactPacketSkuScan(normalized, match)) {
      setPacketSearch(normalized);
      packetSearchRef.current = normalized;
      return false;
    }
    return addPacketLink(match, { clearSearch: true });
  }, [addPacketLink, packets]);

  const uploadPendingProductPhoto = useCallback(async (assemblyId) => {
    const photo = productPhotoRef.current;
    if (!photo?.uri || !assemblyId) return;
    setNotice('AI retouching product photo (white background)…');
    const imageBase64 = await prepareCatalogPhotoForUpload(photo);
    await attachCatalogProductPhotoWithAi({
      assemblyId,
      imageBase64,
      onAttempt: (attempt, max) => {
        setNotice(`AI retouching photo… ${attempt}/${max}`);
      },
    });
    setProductPhoto(null);
    refreshGlobalCatalog({ force: true, background: true }).catch(() => {});
    setNotice('Product photo saved with white catalog background.');
  }, [refreshGlobalCatalog]);

  const handlePacketSearchChange = useCallback((text) => {
    const raw = String(text || '');
    const hadTerminator = /[\r\n\t]/.test(raw) || /[\u0000-\u001F]$/.test(raw);
    let next = stripPacketSearchTerminator(raw).toUpperCase();
    if (!/\s/.test(next)) {
      const wedgeNorm = normalizeWarehouseWedgeScanInput(next, 'packet');
      if (wedgeNorm) next = wedgeNorm;
    }
    const prevLen = packetSearchPrevLenRef.current;
    const burst = next.length >= 8 && next.length - prevLen >= 8;
    packetSearchPrevLenRef.current = next.length;
    packetSearchRef.current = next;
    setPacketSearch(next);
    if (hadTerminator || burst) {
      tryAddPacketFromScan(next, { allowPrefixMatch: true });
      keepPacketSearchKeyboard();
    }
  }, [keepPacketSearchKeyboard, stripPacketSearchTerminator, tryAddPacketFromScan]);

  const scrollPacketSearchIntoView = useCallback(() => {
    setTimeout(() => {
      const y = Math.max(0, packetSearchSectionY.current - 12);
      scrollRef.current?.scrollTo?.({ y, animated: true });
    }, 120);
  }, []);

  const onProductSkuSubmit = () => {
    normalizeSkuField();
    keepSkuKeyboard();
  };

  const onGenerateSku = async () => {
    if (existing) return;
    setSkuGenBusy(true);
    setError('');
    try {
      const { sku: generated } = await warehouseMobileRequest('generate-unique-sku', {});
      if (generated) {
        setFamilySku(String(generated).toUpperCase());
        setNotice('Random SKU generated — still editable before save.');
      }
    } catch (err) {
      setError(err?.message || 'Could not generate SKU.');
    } finally {
      setSkuGenBusy(false);
      keepSkuKeyboard();
    }
  };

  const onPacketSearchSubmit = () => {
    const value = packetSearchRef.current || packetSearch;
    if (tryAddPacketFromScan(value, { allowPrefixMatch: true })) return;
    keepPacketSearchKeyboard();
  };

  const onSave = async () => {
    if (existing && !bomEditMode) {
      setNotice('Edit on mobile is Phase 2 — open web warehouse for changes.');
      return;
    }
    if (!warehouseLocationId) {
      setError(
        'Warehouse location could not be resolved. Open Products on the web once to confirm catalog loads, then retry.',
      );
      return;
    }
    const normalizedSku = normalizeWarehouseProductSku(familySku);
    if (!normalizedSku) {
      setError('Product SKU is required.');
      return;
    }
    if (!finishedOnly && packetLinks.length === 0) {
      setError('Link at least one packet, or turn on finished-only mode.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        name: name.trim(),
        family_sku: normalizedSku,
        category_id: categoryId || null,
        packet_count: finishedOnly ? null : Number(packetCount),
        inventory_mode: finishedOnly ? INVENTORY_FINISHED : INVENTORY_PACKETS,
        has_color_variants: hasColorVariants,
        color_ids: hasColorVariants ? colorIds : [],
        location_ids: [],
        warehouse_location_id: warehouseLocationId,
        packet_links: finishedOnly ? [] : packetLinks,
        turkish_name: turkishName.trim() || null,
        units_per_carton: finishedOnly ? unitsPerCarton : '1',
      };
      if (bomEditMode) {
        payload.id = editAssemblyId;
      }
      const saveResult = await warehouseMobileRequest('assembly-save', payload);
      if (turkishName.trim()) {
        rememberLabelName({
          sku: normalizedSku,
          kind: LABEL_NAME_MEMORY_KIND.PRODUCT_TURKISH,
          name: turkishName.trim(),
        }).catch(() => {});
      }
      if (saveResult?.assembly) {
        const merged = mergeAssemblyIntoCatalog(getWarehouseCatalogCache(), saveResult.assembly);
        if (merged) applyCatalog(merged);
      }
      refreshGlobalCatalog({ force: true, background: true }).catch(() => {});
      const createdAssemblyId = saveResult?.assembly?.id
        ? String(saveResult.assembly.id)
        : '';
      const photoAssemblyId = bomEditMode ? editAssemblyId : createdAssemblyId;
      if (finishedOnly && !bomEditMode && createdAssemblyId) {
        const unitsPerBox = Math.max(1, Math.floor(Number(unitsPerCarton) || 1));
        setFinishedQtyValue('0');
        setFinishedQtyPrompt({
          assemblyId: createdAssemblyId,
          productName: name.trim() || normalizedSku,
          unitsPerBox,
        });
        setNotice(
          unitsPerBox > 1
            ? 'Product saved. Enter how many boxes are on hand.'
            : 'Product saved. Enter warehouse on-hand qty.',
        );
        if (photoAssemblyId && productPhotoRef.current?.uri) {
          uploadPendingProductPhoto(photoAssemblyId).catch((photoErr) => {
            setError(formatWarehouseMobileApiError(photoErr?.message, 'Product saved but photo upload failed.'));
          });
        }
        return;
      }
      if (photoAssemblyId && productPhotoRef.current?.uri) {
        try {
          await uploadPendingProductPhoto(photoAssemblyId);
        } catch (photoErr) {
          throw photoErr;
        }
      }
      const navigateAfterSave = (listScreen) => {
        try {
          returnToCatalogListScreen(navigation, listScreen);
        } catch {
          navigation.goBack();
        }
      };
      if (bomEditMode) {
        const bom = analyzeAssemblyPacketBom(Number(packetCount), packetLinks.map((link) => {
          const p = packets.find((x) => String(x.id) === String(link.packet_id));
          return { qty_per_unit: link.qty_per_unit, ...p };
        }));
        const target = bom.isComplete ? 'WarehouseProducts' : 'WarehouseIncompleteProducts';
        setNotice(bom.isComplete ? 'BOM complete — product moved to Products.' : 'Packet links saved.');
        setTimeout(() => navigateAfterSave(target), 600);
      } else {
        setNotice('Product created.');
        setTimeout(() => navigateAfterSave('WarehouseProducts'), 600);
      }
    } catch (err) {
      setError(formatWarehouseMobileApiError(err?.message, 'Save failed.'));
    } finally {
      setBusy(false);
    }
  };

  const dismissFinishedQtyPrompt = useCallback((listScreen = 'WarehouseProducts') => {
    setFinishedQtyPrompt(null);
    try {
      returnToCatalogListScreen(navigation, listScreen);
    } catch {
      navigation.goBack();
    }
  }, [navigation]);

  const submitFinishedQtyPrompt = useCallback(async () => {
    if (!finishedQtyPrompt?.assemblyId || !warehouseLocationId) {
      dismissFinishedQtyPrompt();
      return;
    }
    const unitsPerBox = Math.max(1, Math.floor(Number(finishedQtyPrompt.unitsPerBox) || 1));
    const entered = Math.max(0, Math.floor(Number(finishedQtyValue) || 0));
    const qty = unitsPerBox > 1
      ? finishedUnitsFromBoxCount(entered, unitsPerBox)
      : entered;
    setFinishedQtySaving(true);
    setError('');
    const assemblyKey = String(finishedQtyPrompt.assemblyId);

    const applySavedQtyPatch = (apiResult) => {
      const patch = qtyPatchFromMobileQuantityResponse(apiResult, assemblyKey, qty);
      patchCatalog(patch);
      return patch;
    };

    const reconcileQtyOnCatalog = async (expectedQty, lastPatch) => {
      try {
        await refreshGlobalCatalog({ force: true, background: true });
      } catch {
        return;
      }
      const cached = getWarehouseCatalogCache();
      const shown = Math.max(0, Math.floor(Number(cached?.assemblyWarehouseQty?.[assemblyKey] ?? 0)));
      if (shown < expectedQty) {
        patchCatalog(lastPatch || { assemblyWarehouseQty: { [assemblyKey]: expectedQty } });
      }
    };

    try {
      const result = await warehouseMobileRequest('assembly-product-quantity-set', {
        assembly_id: finishedQtyPrompt.assemblyId,
        warehouse_location_id: warehouseLocationId,
        quantity: qty,
      });
      const patch = applySavedQtyPatch(result);
      setFinishedQtyPrompt(null);
      try {
        returnToCatalogListScreen(navigation, 'WarehouseProducts');
      } catch {
        navigation.goBack();
      }
      reconcileQtyOnCatalog(qty, patch);
    } catch (err) {
      const msg = formatWarehouseMobileApiError(err?.message, 'Could not save quantity.');
      const maybeGateway = err?.gateway
        || /deployment|temporarily unavailable|gateway|timeout/i.test(msg);
      if (maybeGateway) {
        try {
          const data = await fetchWarehouseCatalogCached({ force: true });
          const qtyMap = catalogStockMaps(data).assemblyWarehouseQty;
          const got = Math.max(0, Math.floor(Number(
            qtyMap[String(finishedQtyPrompt.assemblyId)] ?? 0,
          )));
          if (got === qty) {
            const patch = applySavedQtyPatch({ assembly_id: assemblyKey, quantity: qty, assemblyWarehouseQty: { [assemblyKey]: qty } });
            setFinishedQtyPrompt(null);
            setNotice('Quantity saved (confirmed in catalog).');
            try {
              returnToCatalogListScreen(navigation, 'WarehouseProducts');
            } catch {
              navigation.goBack();
            }
            reconcileQtyOnCatalog(qty, patch);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setError(msg);
    } finally {
      setFinishedQtySaving(false);
    }
  }, [
    dismissFinishedQtyPrompt,
    finishedQtyPrompt,
    finishedQtyValue,
    navigation,
    patchCatalog,
    refreshGlobalCatalog,
    warehouseLocationId,
  ]);

  return (
    <>
    <WarehouseCatalogFormScroll scrollRef={scrollRef} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>
        Tap the camera icon to add a product photo — on save, AI clears it up and adds a white catalog background.
      </Text>
      {!existing && !bomEditMode ? (
        <CatalogProductPhotoField
          photoUri={productPhoto?.uri}
          onOpenCamera={() => setPhotoCameraOpen(true)}
          onClear={() => setProductPhoto(null)}
          disabled={busy}
        />
      ) : null}
      {!existing && !bomEditMode ? (
        <>
          <View style={styles.rowSwitch}>
            <Text style={styles.label}>Finished units only — no packet BOM</Text>
            <Switch value={finishedOnly} onValueChange={setFinishedOnly} />
          </View>
          <Text style={styles.hint}>
            {finishedOnly
              ? 'Pre-boxed sellable units only. Link packets on Warehouse Packets if you build from cartons.'
              : 'Link warehouse packets below: set total packets and qty per product (e.g. 2 of the same carton).'}
          </Text>
        </>
      ) : null}
      {bomEditMode ? (
        <View style={styles.bomHeader}>
          <Text style={styles.bomProductName} numberOfLines={2}>{name}</Text>
          <Text style={styles.bomProductSku} numberOfLines={1}>{familySku}</Text>
        </View>
      ) : (
        <>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            inputRef={nameInputRef}
            returnKeyType="next"
            onSubmitEditing={() => turkishNameInputRef.current?.focus?.()}
          />
          <Field
            label="Turkish name"
            value={turkishName}
            onChangeText={setTurkishName}
            inputRef={turkishNameInputRef}
            placeholder="Optional — saved with the product"
            returnKeyType="next"
            onSubmitEditing={focusSku}
          />
          <Text style={styles.fieldHint}>Shown on the web warehouse product form and label scan suggestions.</Text>
          {finishedOnly ? (
            <Field
              label="Qty per box (units in one carton)"
              value={unitsPerCarton}
              onChangeText={setUnitsPerCarton}
              keyboardType="number-pad"
              placeholder="e.g. 2"
            />
          ) : null}
          {finishedOnly ? (
            <Text style={styles.fieldHint}>
              Example: 2 chairs in one sellable box → enter 2 here. After save you enter how many boxes are on hand (e.g. 3 boxes → 6 units on web and app).
            </Text>
          ) : null}
          {!existing ? (
            <GenerateRandomSkuButton onPress={onGenerateSku} busy={skuGenBusy} disabled={busy} />
          ) : null}
          <Field
            label="SKU (finished product)"
            value={familySku}
            editable={!existing}
            mono
            onBlur={wrapSkuBlur(normalizeSkuField)}
            inputRef={skuInputRef}
            returnKeyType="done"
            onChangeText={wedgeAwareTextChange(setFamilySku, {
              stripScanTerminator: stripSkuTerminator,
              keepFocusAfterSubmit: keepSkuKeyboard,
              transform: (v) => v.toUpperCase(),
              onWedgeComplete: (v) => {
                const normalized = normalizeWarehouseProductSku(v);
                if (normalized) setFamilySku(normalized);
              },
            })}
            onSubmitEditing={() => {
              normalizeSkuField();
              onProductSkuSubmit();
            }}
          />
        </>
      )}
      {showPacketBomFields && (
        <Field
          label="Total packets"
          value={packetCount}
          onChangeText={setPacketCount}
          keyboardType="number-pad"
        />
      )}
      {!bomEditMode ? (
      <>
      <Text style={styles.label}>Category</Text>
      <Pressable
        style={styles.select}
        onPress={() => setCategoryPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Choose category"
      >
        <Text style={styles.selectText}>{selectedCategoryLabel}</Text>
        <Text style={styles.selectChevron}>▾</Text>
      </Pressable>
      <Modal
        visible={categoryPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryPickerOpen(false)}>
          <View style={styles.pickerSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>Category (A–Z)</Text>
            <ModalScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              <Pressable
                style={styles.pickerRow}
                onPress={() => {
                  setCategoryId('');
                  setCategoryPickerOpen(false);
                }}
              >
                <Text style={styles.pickerRowText}>— None —</Text>
              </Pressable>
              {sortedCategories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[
                    styles.pickerRow,
                    String(categoryId) === String(c.id) && styles.pickerRowActive,
                  ]}
                  onPress={() => {
                    setCategoryId(c.id);
                    setCategoryPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>{c.name}</Text>
                </Pressable>
              ))}
            </ModalScrollView>
            <Text style={styles.pickerSectionLabel}>Add new category</Text>
            <View style={styles.inlineAdd}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Category name"
                placeholderTextColor="#64748b"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                blurOnSubmit={false}
                showSoftInputOnFocus
                onSubmitEditing={addCategory}
                editable={!categoryAddBusy}
              />
              <Pressable
                style={[
                  formButtonStyles.outline,
                  formButtonStyles.outlineAccent,
                  categoryAddBusy && formButtonStyles.disabled,
                ]}
                onPress={addCategory}
                disabled={categoryAddBusy || !newCategoryName.trim()}
              >
                <Text style={[formButtonStyles.outlineText, formButtonStyles.outlineTextAccent]}>
                  {categoryAddBusy ? '…' : 'Add'}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
      <Text style={styles.fieldHint}>
        Tap Category to pick one, or add a new name in the picker.
      </Text>
      <View style={styles.rowSwitch}>
        <Text style={styles.label}>Variant colors</Text>
        <Switch value={hasColorVariants} onValueChange={setHasColorVariants} />
      </View>
      {hasColorVariants ? (
        <>
          <View style={styles.inlineAdd}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Color name"
              placeholderTextColor="#64748b"
              value={colorDraft}
              onChangeText={setColorDraft}
              blurOnSubmit={false}
              showSoftInputOnFocus
            />
            <Pressable style={styles.smallBtn} onPress={addColor} disabled={busy}>
              <Text style={styles.smallBtnText}>Add</Text>
            </Pressable>
          </View>
          {linkedColorNames.length ? (
            <Text style={styles.hint}>Colors: {linkedColorNames.join(', ')}</Text>
          ) : null}
        </>
      ) : null}
      </>
      ) : null}
      {showPacketBomFields && (
        <View
          collapsable={false}
          onLayout={(e) => {
            packetSearchSectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.label}>Packets that build this product</Text>
          <Text style={styles.hint}>
            Scan a packet barcode to add it instantly. Type a name or SKU to search and tap a row.
          </Text>
          <TextInput
            ref={packetSearchInputRef}
            style={styles.input}
            placeholder="Scan packet SKU or type to search…"
            placeholderTextColor="#64748b"
            value={packetSearch}
            onChangeText={handlePacketSearchChange}
            autoCapitalize="characters"
            blurOnSubmit={false}
            showSoftInputOnFocus
            returnKeyType="done"
            onSubmitEditing={onPacketSearchSubmit}
            onBlur={wrapPacketSearchBlur()}
            onFocus={scrollPacketSearchIntoView}
          />
          {packetSearchResults.map((p) => {
            const assignedElsewhere = packetAssignedToProduct.has(String(p.id));
            return (
              <Pressable
                key={p.id}
                style={styles.pickRow}
                onPress={() => addPacketLink(p)}
              >
                <Text style={styles.pickSku}>{p.sku}</Text>
                <Text style={styles.pickName} numberOfLines={2}>
                  {p.name}
                  {assignedElsewhere ? ' · linked to another product' : ''}
                </Text>
              </Pressable>
            );
          })}
          {packetLinks.map((link) => {
            const p = packets.find((x) => String(x.id) === String(link.packet_id));
            return (
              <View key={link.packet_id} style={styles.linkedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickSku}>{p?.sku || link.packet_id}</Text>
                  <Text style={styles.pickName} numberOfLines={1}>{p?.name}</Text>
                </View>
                <Text style={styles.qtyLabel}>Qty</Text>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  blurOnSubmit={false}
                  showSoftInputOnFocus
                  value={String(link.qty_per_unit)}
                  onChangeText={(v) => {
                    const qty = Math.max(1, Math.floor(Number(v) || 1));
                    setPacketLinks((prev) => prev.map((l) => (
                      String(l.packet_id) === String(link.packet_id)
                        ? { ...l, qty_per_unit: qty }
                        : l
                    )));
                  }}
                />
                <Pressable
                  onPress={() => setPacketLinks((prev) =>
                    prev.filter((l) => String(l.packet_id) !== String(link.packet_id)))}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {(!existing || bomEditMode) && (
        <Pressable
          style={[formButtonStyles.primary, styles.saveBtn, busy && formButtonStyles.disabled]}
          onPress={onSave}
          disabled={busy}
        >
          <Text style={formButtonStyles.primaryText}>
            {busy ? 'Saving…' : (bomEditMode ? 'Save packet BOM' : 'Create product')}
          </Text>
        </Pressable>
      )}
    </WarehouseCatalogFormScroll>
    <Modal
      visible={Boolean(finishedQtyPrompt)}
      transparent
      animationType="fade"
      onRequestClose={() => dismissFinishedQtyPrompt()}
    >
      <KeyboardAvoidingView
        style={styles.finishedQtyBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.finishedQtyCard}>
          <Text style={styles.finishedQtyTitle}>
            {(finishedQtyPrompt?.unitsPerBox ?? 1) > 1
              ? 'Boxes on hand'
              : 'Warehouse finished qty'}
          </Text>
          <Text style={styles.finishedQtyHint}>
            {finishedQtyPrompt?.productName
              ? `${finishedQtyPrompt.productName} — `
              : ''}
            {(finishedQtyPrompt?.unitsPerBox ?? 1) > 1
              ? `How many full boxes are on hand at ${warehouseLocationName}? (${finishedQtyPrompt.unitsPerBox} units per box.)`
              : `How many finished units are on hand at ${warehouseLocationName}?`}
          </Text>
          <TextInput
            style={styles.finishedQtyInput}
            value={finishedQtyValue}
            onChangeText={setFinishedQtyValue}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#64748b"
            autoFocus
          />
          {(finishedQtyPrompt?.unitsPerBox ?? 1) > 1 ? (
            <Text style={styles.finishedQtyPreview}>
              {formatWarehouseBoxAndUnitStock(
                finishedUnitsFromBoxCount(finishedQtyValue, finishedQtyPrompt.unitsPerBox),
                finishedQtyPrompt.unitsPerBox,
              ).text}
            </Text>
          ) : null}
          <Pressable
            style={[formButtonStyles.primary, finishedQtySaving && formButtonStyles.disabled]}
            onPress={submitFinishedQtyPrompt}
            disabled={finishedQtySaving}
          >
            <Text style={formButtonStyles.primaryText}>
              {finishedQtySaving ? 'Saving…' : 'Save & go to list'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.finishedQtySkip}
            onPress={() => dismissFinishedQtyPrompt()}
            disabled={finishedQtySaving}
          >
            <Text style={styles.finishedQtySkipText}>Skip for now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <CatalogProductPhotoCaptureModal
      visible={photoCameraOpen}
      onCancel={() => setPhotoCameraOpen(false)}
      onCaptured={(photo) => {
        setPhotoCameraOpen(false);
        setProductPhoto(photo);
        setNotice('Photo ready — save the product to run AI retouch.');
      }}
    />
    </>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType,
  mono,
  onBlur,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  placeholder,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, !editable && styles.inputDisabled, mono && styles.mono]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        autoCapitalize={mono ? 'none' : 'sentences'}
        autoComplete="off"
        blurOnSubmit={false}
        showSoftInputOnFocus
        onBlur={onBlur}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: theme.bg, flexGrow: 1 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  bomHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  bomProductName: { color: theme.text, fontSize: 17, fontWeight: '600' },
  bomProductSku: { color: theme.textMuted, fontSize: 14, marginTop: 4, fontFamily: 'monospace' },
  field: { marginBottom: 14 },
  label: { color: theme.textMuted, marginBottom: 6, flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: theme.text,
    marginBottom: 8,
  },
  mono: { fontFamily: 'monospace' },
  inputDisabled: { opacity: 0.7 },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  fieldHint: {
    color: theme.textDim,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 12,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 8,
    backgroundColor: '#1e293b',
  },
  selectText: { color: theme.text, fontSize: 15, flex: 1 },
  selectChevron: { color: theme.textMuted, fontSize: 16, marginLeft: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerSheet: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '70%',
    paddingVertical: 12,
  },
  pickerTitle: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pickerList: { maxHeight: 280 },
  pickerSectionLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  pickerRowActive: { backgroundColor: '#0c4a6e' },
  pickerRowText: { color: theme.text, fontSize: 16 },
  inlineAdd: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  smallBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  smallBtnText: { color: '#f8fafc', fontWeight: '600' },
  hint: { color: theme.textMuted, marginBottom: 12, fontSize: 13, lineHeight: 18 },
  pickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  pickSku: { color: '#38bdf8', fontFamily: 'monospace', width: 110, fontSize: 11 },
  pickName: { color: '#e2e8f0', flex: 1, fontSize: 13 },
  linkedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  qtyLabel: { color: theme.textMuted, fontSize: 12 },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: theme.text,
    width: 48,
    textAlign: 'center',
  },
  remove: { color: theme.danger, fontSize: 13, fontWeight: '600' },
  saveBtn: { marginTop: 8 },
  error: { color: theme.danger, marginTop: 8, fontSize: 13 },
  notice: { color: theme.success, marginTop: 8, fontSize: 13 },
  labelScanBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  labelScanBtnText: { color: '#7dd3fc', fontWeight: '600', fontSize: 13 },
  finishedQtyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    padding: 24,
  },
  finishedQtyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  finishedQtyTitle: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  finishedQtyHint: { color: theme.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  finishedQtyPreview: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  finishedQtyInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: theme.text,
    fontSize: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  finishedQtySkip: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  finishedQtySkipText: { color: '#94a3b8', fontSize: 14 },
});
