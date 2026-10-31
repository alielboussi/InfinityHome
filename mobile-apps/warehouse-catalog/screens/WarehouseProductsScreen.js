import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSharedMobileAccessGrant } from '../shared/MobileAccessGrantContext';
import { isWarehouseCatalogAddProductAllowed, isWarehouseCatalogLabelPrintAllowed, isWarehouseProductFormInsertAllowed } from '../shared/mobileAccessManifest';
import CatalogLabelPrintModal, { CatalogLabelPrintIconButton } from '../shared/CatalogLabelPrintModal';
import CatalogProductPhotoZoomModal from '../shared/CatalogProductPhotoZoomModal';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { useWarehouseCatalog } from '../shared/WarehouseCatalogContext';
import { catalogStockMaps } from '../shared/warehouseCatalogStockMaps';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseCatalogSearchQuery,
  normalizeWarehouseProductSku,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import { wedgeAwareTextChange } from '../shared/useKeepSoftKeyboardOnScanSubmit';
import {
  analyzeAssemblyPacketBom,
  assemblyDerivesWarehouseStockFromPackets,
  isCompleteCatalogProduct,
  isIncompletePacketBomProduct,
  isSetAssembly,
} from '../shared/warehouseCatalogProductCompleteness';
import {
  assemblyUnitsPerCarton,
  formatWarehouseBoxAndUnitStock,
} from '../shared/warehouseUnitsPerCarton';
import { theme } from '../shared/theme';
import {
  buildWarehouseCategoryIndex,
  resolveWarehouseCategoryName,
} from '../shared/warehouseCategoryLookup';

const LIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: true,
};

const UNCATEGORIZED_CATEGORY_KEY = '__none__';

function assemblyCategoryKey(assembly, categoryIndex) {
  const raw = assembly?.category_id;
  if (raw == null || raw === '') return UNCATEGORIZED_CATEGORY_KEY;
  const key = String(raw).trim();
  if (!key) return UNCATEGORIZED_CATEGORY_KEY;
  const resolved = resolveWarehouseCategoryName(key, categoryIndex);
  if (!resolved) return UNCATEGORIZED_CATEGORY_KEY;
  return key;
}

function formatDimensionsLine(assembly) {
  const l = assembly?.dim_length;
  const w = assembly?.dim_width;
  const h = assembly?.dim_height;
  const hasAny = [l, w, h].some((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  if (!hasAny) return '';
  const fmt = (v) => {
    if (v == null || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '—';
  };
  return `Dimensions: ${fmt(l)} × ${fmt(w)} × ${fmt(h)} cm`;
}

function formatVolumeLine(assembly) {
  const l = Number(assembly?.dim_length);
  const w = Number(assembly?.dim_width);
  const h = Number(assembly?.dim_height);
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return '';
  if (l <= 0 || w <= 0 || h <= 0) return '';
  const m3 = (l * w * h) / 1_000_000;
  if (!Number.isFinite(m3)) return '';
  const display = m3.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `Volume (m³): ${display}`;
}

function resolveAssemblyImageUri(assembly) {
  const candidates = [
    assembly?.image_url,
    assembly?.thumbnail_url,
    assembly?.cover_image_url,
    assembly?.photo_url,
  ];
  const hit = candidates.find((v) => v && String(v).trim());
  return hit ? String(hit).trim() : null;
}

function ProductThumbnail({ assembly }) {
  const uri = resolveAssemblyImageUri(assembly);
  if (uri) {
    return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel="" />;
  }
  return (
    <View style={styles.thumbPlaceholder}>
      <Text style={styles.thumbPlaceholderIcon} accessibilityElementsHidden>▦</Text>
      <Text style={styles.thumbPlaceholderText}>Photo</Text>
    </View>
  );
}

export default function WarehouseProductsScreen({ navigation, route }) {
  const catalogMode = route?.name === 'WarehouseIncompleteProducts'
    || route?.params?.catalogMode === 'incomplete'
    ? 'incomplete'
    : 'complete';
  const {
    catalog,
    initialLoading,
    refreshing,
    error: catalogError,
    ensureFresh,
    refresh,
  } = useWarehouseCatalog();
  const grant = useSharedMobileAccessGrant();
  const canAddProduct = isWarehouseCatalogAddProductAllowed(grant);
  const canPrintLabel = isWarehouseCatalogLabelPrintAllowed(grant);
  const [search, setSearch] = useState('');
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => new Set());
  const [photoPreview, setPhotoPreview] = useState(null);
  const [labelPrintItem, setLabelPrintItem] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  useFocusEffect(
    useCallback(() => {
      ensureFresh({ fullPackets: false });
    }, [ensureFresh]),
  );

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(catalog?.assemblyPackets, catalog?.packets),
    [catalog],
  );

  const categoryIndex = useMemo(
    () => buildWarehouseCategoryIndex(catalog?.categories),
    [catalog?.categories],
  );

  const categoryName = useMemo(() => {
    return (id, assembly) => {
      const fromAssembly = String(assembly?.category_name || '').trim();
      if (fromAssembly) return fromAssembly;
      return resolveWarehouseCategoryName(id, categoryIndex);
    };
  }, [categoryIndex]);

  const { assemblyWarehouseQty, packetWarehouseQty } = useMemo(
    () => catalogStockMaps(catalog),
    [catalog],
  );
  const productAssemblies = useMemo(
    () => (catalog?.assemblies || []).filter((a) => {
      if (isSetAssembly(a)) return false;
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      if (catalogMode === 'incomplete') {
        return isIncompletePacketBomProduct(a, pktList);
      }
      return isCompleteCatalogProduct(a, pktList);
    }),
    [catalog?.assemblies, catalogMode, packetsByAssembly],
  );

  const warehouseCategoryOptions = useMemo(() => {
    const counts = new Map();
    productAssemblies.forEach((a) => {
      const key = assemblyCategoryKey(a, categoryIndex);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const options = [...counts.entries()].map(([id, count]) => {
      const name = id === UNCATEGORIZED_CATEGORY_KEY
        ? 'Uncategorized'
        : (categoryName(id) || 'Uncategorized');
      return { id, name, count };
    });
    options.sort((a, b) => {
      if (a.id === UNCATEGORIZED_CATEGORY_KEY) return 1;
      if (b.id === UNCATEGORIZED_CATEGORY_KEY) return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return options;
  }, [productAssemblies, categoryName, categoryIndex]);

  const categoryFilterActive = selectedCategoryIds.size > 0;

  useEffect(() => {
    setSelectedCategoryIds(new Set());
  }, [catalogMode]);

  useEffect(() => {
    const valid = new Set(warehouseCategoryOptions.map((o) => o.id));
    setSelectedCategoryIds((prev) => {
      if (!prev.size) return prev;
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [warehouseCategoryOptions]);

  const toggleCategoryFilterId = (id) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearCategoryFilter = () => setSelectedCategoryIds(new Set());

  const filtered = useMemo(() => {
    let base = productAssemblies;
    if (selectedCategoryIds.size > 0) {
      base = base.filter((a) => selectedCategoryIds.has(assemblyCategoryKey(a, categoryIndex)));
    }
    const raw = search.trim();
    if (!raw) return base;
    const qLower = raw.toLowerCase();
    const qProductKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    const qPacketKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));

    const keysOverlap = (storedSku, queryKeys, normalizer) => {
      const storedKeys = expandWarehouseSkuMatchKeys(normalizer(storedSku));
      for (const k of queryKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    };

    return base.filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      const cat = categoryName(a.category_id, a);
      if (String(a.name || '').toLowerCase().includes(qLower)) return true;
      if (cat.toLowerCase().includes(qLower)) return true;
      if (String(a.family_sku || '').toLowerCase().includes(qLower)) return true;
      if (keysOverlap(a.family_sku, qProductKeys, normalizeWarehouseProductSku)) return true;
      return pktList.some(
        (p) => String(p.name || '').toLowerCase().includes(qLower)
          || String(p.sku || '').toLowerCase().includes(qLower)
          || keysOverlap(p.sku, qPacketKeys, normalizeWarehousePacketScan),
      );
    });
  }, [
    productAssemblies,
    packetsByAssembly,
    search,
    categoryName,
    categoryIndex,
    selectedCategoryIds,
  ]);

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openNewProductForm = () => {
    navigation.navigate('ProductForm', {
      prefill: {},
      existing: false,
      warehouseLocationId: catalog?.warehouseLocationId,
      catalogSnapshot: catalog,
    });
  };

  const formatQty = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return String(Math.max(0, Math.floor(n)));
  };

  const openLabelPrint = (name, sku) => {
    const labelName = String(name || '').trim();
    const labelSku = String(sku || '').trim();
    if (!labelName || !labelSku) return;
    setLabelPrintItem({ name: labelName, sku: labelSku, defaultCopies: 1 });
  };

  const renderPacket = (packet) => {
    const whQty = packetWarehouseQty[String(packet.id)] ?? 0;
    return (
      <View key={packet.id} style={styles.packetRow}>
        <View style={styles.packetRowMain}>
          <Text style={styles.packetSku} numberOfLines={1}>{packet.sku}</Text>
          <Text style={styles.packetName} numberOfLines={2}>{packet.name}</Text>
          <Text style={styles.packetQty}>WH {formatQty(whQty)}</Text>
        </View>
        {canPrintLabel ? (
          <CatalogLabelPrintIconButton
            onPress={() => openLabelPrint(packet.name, packet.sku)}
          />
        ) : null}
      </View>
    );
  };

  const renderItem = ({ item: assembly }) => {
    const id = String(assembly.id);
    const isOpen = expanded.has(id);
    const pktList = packetsByAssembly.get(id) || [];
    const cat = categoryName(assembly.category_id, assembly);
    const finishedQty = assemblyWarehouseQty[id] ?? 0;
    const displayQty = catalogMode === 'incomplete' ? 0 : finishedQty;
    const dimLine = formatDimensionsLine(assembly);
    const volumeLine = formatVolumeLine(assembly);
    const bom = analyzeAssemblyPacketBom(assembly.packet_count, pktList);
    const bomHint = catalogMode === 'incomplete'
      ? (pktList.length === 0
        ? 'No packets linked'
        : `BOM ${bom.cartonsPerUnit}/${bom.required || assembly.packet_count || '?'} cartons`)
      : '';

    const qtyNum = Math.max(0, Math.floor(Number(displayQty) || 0));
    const unitsPerBox = assemblyUnitsPerCarton(assembly);
    const usePacketStock = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
    const showBoxAndUnits = catalogMode === 'complete'
      && unitsPerBox > 1
      && !usePacketStock;
    const qtyDisplayText = showBoxAndUnits
      ? formatWarehouseBoxAndUnitStock(qtyNum, unitsPerBox).text
      : formatQty(displayQty);

    const qtyStyle = catalogMode === 'incomplete'
      ? styles.qtyIncomplete
      : (qtyNum > 0 ? styles.qtyValuePositive : styles.qtyValueZero);
    const imageUri = resolveAssemblyImageUri(assembly);

    return (
      <View style={styles.gridCard}>
        <View style={styles.cardPress}>
          <View style={styles.cardMain}>
          <View style={styles.thumbWrap}>
            <Pressable
              onPress={() => {
                if (imageUri) setPhotoPreview({ uri: imageUri, title: assembly.name });
              }}
              accessibilityLabel={imageUri ? `View photo for ${assembly.name}` : 'No product photo'}
              disabled={!imageUri}
              style={({ pressed }) => [imageUri && pressed && styles.thumbPressablePressed]}
            >
              <ProductThumbnail assembly={assembly} />
              {imageUri ? (
                <View style={styles.thumbZoomBadge} pointerEvents="none">
                  <MaterialCommunityIcons name="magnify-plus-outline" size={16} color="#e2e8f0" />
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={styles.expandFab}
              onPress={() => toggleExpanded(id)}
              hitSlop={8}
              accessibilityLabel={isOpen ? 'Hide packets' : 'Show packets'}
            >
              <Text style={[styles.expandIcon, isOpen && styles.expandIconOpen]}>▶</Text>
            </Pressable>
            {canPrintLabel ? (
              <View style={styles.printFab}>
                <CatalogLabelPrintIconButton
                  onPress={() => openLabelPrint(assembly.name, assembly.family_sku)}
                />
              </View>
            ) : null}
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{assembly.name}</Text>
          <Text style={styles.cardSku} numberOfLines={1}>{assembly.family_sku}</Text>
          <Text style={styles.cardMeta} numberOfLines={2}>
            {cat || '—'}
            {assembly.packet_count ? ` · ${assembly.packet_count} pkt` : ''}
            {bomHint ? ` · ${bomHint}` : ''}
          </Text>
          {dimLine ? (
            <Text style={styles.cardSpec} numberOfLines={2}>{dimLine}</Text>
          ) : null}
          {volumeLine ? (
            <Text style={styles.cardSpec} numberOfLines={1}>{volumeLine}</Text>
          ) : null}
          </View>
          <View style={styles.qtyFooter}>
            <Text
              style={[styles.qtyValue, showBoxAndUnits && styles.qtyValueBoxUnit, qtyStyle]}
              numberOfLines={showBoxAndUnits ? 2 : 1}
            >
              {qtyDisplayText}
            </Text>
          </View>
        </View>
        {isOpen ? (
          <View style={styles.packetList}>
            {pktList.length === 0 ? (
              <Text style={styles.packetEmpty}>No packets linked.</Text>
            ) : (
              pktList.map(renderPacket)
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderTitle}>
          {catalogMode === 'incomplete' ? 'Incomplete Products' : 'Products'}
        </Text>
        <Text style={styles.listHeaderMeta}>
          {filtered.length} item{filtered.length === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Search SKU or name…"
          placeholderTextColor={theme.textDim}
          value={search}
          onChangeText={wedgeAwareTextChange(setSearch, {
            normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'auto'),
          })}
          autoCapitalize="characters"
          autoCorrect={false}
          onBlur={() => {
            const v = search.trim();
            if (!v || /\s/.test(v)) return;
            const normalized = normalizeWarehouseCatalogSearchQuery(v);
            if (normalized && normalized !== v) setSearch(normalized);
          }}
        />
        <Pressable
          style={[styles.filterBtn, categoryFilterActive && styles.filterBtnActive]}
          onPress={() => setCategoryFilterOpen(true)}
          accessibilityLabel={categoryFilterActive
            ? `Category filter active (${selectedCategoryIds.size} selected)`
            : 'Filter by category'}
        >
          <MaterialCommunityIcons
            name="shape-outline"
            size={22}
            color={categoryFilterActive ? '#38bdf8' : '#94a3b8'}
          />
        </Pressable>
        {catalogMode === 'complete' && canAddProduct ? (
          <Pressable
            style={styles.addBtn}
            onPress={openNewProductForm}
            accessibilityLabel="Add new product"
          >
            <Text style={styles.addBtnText}>+</Text>
          </Pressable>
        ) : null}
      </View>

      {catalogError ? (
        <Text style={styles.error}>{catalogError}</Text>
      ) : null}
      {!initialLoading && catalog && !catalog.warehouseLocationId ? (
        <Text style={styles.error}>
          Warehouse location could not be resolved (same rules as web warehouse products). Pull to refresh.
        </Text>
      ) : null}
      {initialLoading && !catalog ? (
        <ActivityIndicator color="#38bdf8" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          key="warehouse-products-grid-2"
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>No products yet. Tap + to add a product.</Text>
          }
          refreshing={refreshing}
          onRefresh={() => refresh({ force: true, background: true })}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          {...LIST_PERF}
        />
      )}

      <Modal
        visible={categoryFilterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryFilterOpen(false)}
      >
        <Pressable style={styles.categoryModalBackdrop} onPress={() => setCategoryFilterOpen(false)}>
          <View style={styles.categoryPickerSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.categoryPickerHeader}>
              <Text style={styles.categoryPickerTitle}>Categories on this list</Text>
              {categoryFilterActive ? (
                <Pressable
                  onPress={clearCategoryFilter}
                  accessibilityRole="button"
                  accessibilityLabel="Clear category filter"
                >
                  <Text style={styles.categoryPickerClear}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.categoryPickerHint}>
              Only categories used by products in this view. Leave none selected to show all.
            </Text>
            {warehouseCategoryOptions.length === 0 ? (
              <Text style={styles.categoryPickerEmpty}>No products to filter yet.</Text>
            ) : (
              <ScrollView style={styles.categoryPickerList} keyboardShouldPersistTaps="handled">
                {warehouseCategoryOptions.map((opt) => {
                  const checked = selectedCategoryIds.has(opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.categoryPickerRow, checked && styles.categoryPickerRowActive]}
                      onPress={() => toggleCategoryFilterId(opt.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${opt.name}, ${opt.count} product${opt.count === 1 ? '' : 's'}`}
                    >
                      <MaterialCommunityIcons
                        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={22}
                        color={checked ? '#38bdf8' : '#64748b'}
                      />
                      <Text style={styles.categoryPickerRowText} numberOfLines={2}>
                        {opt.name}
                      </Text>
                      <Text style={styles.categoryPickerCount}>{opt.count}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable
              style={styles.categoryPickerDone}
              onPress={() => setCategoryFilterOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Done filtering categories"
            >
              <Text style={styles.categoryPickerDoneText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <CatalogProductPhotoZoomModal
        visible={Boolean(photoPreview?.uri)}
        uri={photoPreview?.uri}
        title={photoPreview?.title}
        onClose={() => setPhotoPreview(null)}
      />

      <CatalogLabelPrintModal
        visible={Boolean(labelPrintItem)}
        item={labelPrintItem}
        onClose={() => setLabelPrintItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  listHeader: {
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
  listHeaderTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  listHeaderMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusSm,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(12, 74, 110, 0.45)',
  },
  categoryModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  categoryPickerSheet: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '75%',
    paddingVertical: 12,
  },
  categoryPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  categoryPickerTitle: { color: theme.text, fontSize: 16, fontWeight: '700', flex: 1 },
  categoryPickerClear: { color: '#38bdf8', fontSize: 14, fontWeight: '600', paddingVertical: 4, paddingLeft: 12 },
  categoryPickerHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  categoryPickerEmpty: {
    color: theme.textMuted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  categoryPickerList: { maxHeight: 360 },
  categoryPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  categoryPickerRowActive: { backgroundColor: 'rgba(12, 74, 110, 0.35)' },
  categoryPickerRowText: { color: theme.text, fontSize: 15, flex: 1 },
  categoryPickerCount: { color: theme.textMuted, fontSize: 13, fontWeight: '600', minWidth: 28, textAlign: 'right' },
  categoryPickerDone: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  categoryPickerDoneText: { color: '#f8fafc', fontWeight: '700', fontSize: 15 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#e2e8f0', fontSize: 26, fontWeight: '300', marginTop: -2 },
  listContent: { paddingHorizontal: 10, paddingBottom: 24 },
  gridRow: { gap: 8, marginBottom: 8 },
  gridCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    minWidth: 0,
  },
  cardPress: {
    flex: 1,
    padding: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  cardMain: { flexGrow: 1 },
  thumbWrap: { position: 'relative' },
  thumbPressablePressed: { opacity: 0.88 },
  thumbZoomBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  thumbPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderIcon: { color: '#475569', fontSize: 28, marginBottom: 4 },
  thumbPlaceholderText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  qtyFooter: {
    minHeight: 52,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  qtyValue: { fontSize: 18, fontWeight: '800', textAlign: 'center', width: '100%' },
  qtyValueBoxUnit: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  qtyValuePositive: { color: '#069506' },
  qtyValueZero: { color: '#B30707' },
  qtyIncomplete: { color: '#B30707' },
  expandFab: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: theme.radiusSm,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    zIndex: 2,
  },
  expandIcon: { color: '#94a3b8', fontSize: 10 },
  expandIconOpen: { transform: [{ rotate: '90deg' }] },
  printFab: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 2,
  },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700', marginTop: 8 },
  cardSku: { color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11, marginTop: 4 },
  cardMeta: { color: '#94a3b8', marginTop: 4, fontSize: 11, lineHeight: 15 },
  cardSpec: { color: '#cbd5e1', marginTop: 3, fontSize: 10, lineHeight: 14 },
  packetList: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
  },
  packetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  packetRowMain: { flex: 1, minWidth: 0 },
  packetSku: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 10 },
  packetName: { color: '#e2e8f0', fontSize: 11, marginTop: 2 },
  packetQty: { color: '#a5f3fc', fontSize: 11, fontWeight: '700', marginTop: 2 },
  packetEmpty: { color: '#64748b', fontStyle: 'italic', paddingVertical: 4, fontSize: 11 },
});