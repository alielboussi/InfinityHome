import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskFooterBottomPad } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { fetchProductionCatalog } from '../services/productionApi';
import { floor1CatalogImageUri } from '../lib/floor1CatalogImageUri';
import {
  isCompleteCatalogProduct,
  isSetAssembly,
  isStoreroomMaterialAssembly,
} from '../shared/warehouseCatalogProductCompleteness';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import {
  buildWarehouseCategoryIndex,
  resolveWarehouseCategoryName,
} from '../shared/warehouseCategoryLookup';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
} from '../shared/warehouseScanResolver';
import { theme } from '../shared/theme';

const UNCATEGORIZED_CATEGORY_KEY = '__none__';
const LIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: true,
};

function assemblyCategoryKey(assembly, categoryIndex) {
  const raw = assembly?.category_id;
  if (raw == null || raw === '') return UNCATEGORIZED_CATEGORY_KEY;
  const key = String(raw).trim();
  if (!key) return UNCATEGORIZED_CATEGORY_KEY;
  if (!resolveWarehouseCategoryName(key, categoryIndex)) return UNCATEGORIZED_CATEGORY_KEY;
  return key;
}

function floorQty(map, id) {
  return Math.max(0, Math.floor(Number(map?.[id] ?? 0)));
}

export default function Floor1ProductsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => new Set());
  const catalogRef = useRef(null);

  const load = useCallback(async ({ pull = false } = {}) => {
    if (pull) setRefreshing(true);
    else if (!catalogRef.current) setLoading(true);
    setError('');
    try {
      const data = await fetchProductionCatalog();
      catalogRef.current = data || null;
      setCatalog(data || null);
    } catch (e) {
      setError(e?.message || tUi('floor1ProductsLoadFailed', locale));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale]);

  useFocusEffect(
    useCallback(() => {
      load({ pull: false });
    }, [load]),
  );

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(catalog?.assemblyPackets, catalog?.packets),
    [catalog],
  );
  const categoryIndex = useMemo(
    () => buildWarehouseCategoryIndex(catalog?.categories),
    [catalog?.categories],
  );
  const assemblyWarehouseQty = catalog?.assemblyWarehouseQty || {};

  const categoryName = useCallback((id, assembly) => {
    const fromAssembly = String(assembly?.category_name || '').trim();
    if (fromAssembly) return fromAssembly;
    return resolveWarehouseCategoryName(id, categoryIndex) || '';
  }, [categoryIndex]);

  const products = useMemo(() => (
    (catalog?.assemblies || []).filter((a) => {
      if (isSetAssembly(a) || isStoreroomMaterialAssembly(a)) return false;
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      return isCompleteCatalogProduct(a, pktList);
    })
  ), [catalog?.assemblies, packetsByAssembly]);

  const warehouseCategoryOptions = useMemo(() => {
    const counts = new Map();
    products.forEach((a) => {
      const id = assemblyCategoryKey(a, categoryIndex);
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    const options = [...counts.entries()].map(([id, count]) => ({
      id,
      count,
      name: id === UNCATEGORIZED_CATEGORY_KEY
        ? tUi('floor1ProductsUncategorized', locale)
        : (resolveWarehouseCategoryName(id, categoryIndex) || id),
    }));
    options.sort((a, b) => {
      if (a.id === UNCATEGORIZED_CATEGORY_KEY) return 1;
      if (b.id === UNCATEGORIZED_CATEGORY_KEY) return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return options;
  }, [products, categoryIndex, locale]);

  const categoryFilterActive = selectedCategoryIds.size > 0;

  const filtered = useMemo(() => {
    let rows = products;
    if (selectedCategoryIds.size) {
      rows = rows.filter((a) => selectedCategoryIds.has(assemblyCategoryKey(a, categoryIndex)));
    }
    const raw = search.trim();
    if (raw) {
      const qLower = raw.toLowerCase();
      const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
      rows = rows.filter((a) => {
        if (String(a.name || '').toLowerCase().includes(qLower)) return true;
        if (String(a.family_sku || '').toLowerCase().includes(qLower)) return true;
        const cat = categoryName(a.category_id, a);
        if (cat.toLowerCase().includes(qLower)) return true;
        const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(a.family_sku));
        return [...qKeys].some((k) => k && stored.has(k));
      });
    }
    return [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }, [products, selectedCategoryIds, categoryIndex, search, categoryName]);

  const toggleCategoryFilterId = (id) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderCard = ({ item }) => {
    const id = String(item.id);
    const uri = floor1CatalogImageUri(item);
    const floor1 = floorQty(assemblyWarehouseQty, id);
    return (
      <View style={styles.gridCard}>
        <View style={styles.cardPress}>
          <View style={styles.cardMain}>
            {uri ? (
              <Image source={{ uri }} style={styles.thumb} resizeMode="contain" />
            ) : (
              <View style={styles.thumbEmpty} />
            )}
            <Text style={styles.cardTitle} numberOfLines={2}>{item.name || '—'}</Text>
            <Text style={styles.cardSku} numberOfLines={1}>{item.family_sku || ''}</Text>
          </View>
          <View style={styles.qtyFooter}>
            <Text style={styles.qtyLine}>
              {tUi('floor1ProductsFloor1Qty', locale).replace('{n}', String(floor1))}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[
      kiosk.screen,
      { paddingTop: insets.top + 4, paddingBottom: kioskFooterBottomPad(insets) },
    ]}
    >
      <ProductionKioskTopBar
        title={tUi('dashFloor1Products', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
        compact
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>

      <View style={styles.toolbar}>
        <TextInput
          style={[styles.search, { textAlign }]}
          placeholder={tUi('floor1ProductsSearch', locale)}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.filterBtn, categoryFilterActive && styles.filterBtnActive]}
          onPress={() => setCategoryFilterOpen(true)}
          accessibilityLabel={tUi('floor1ProductsCategoryFilter', locale)}
        >
          <MaterialCommunityIcons
            name="filter-variant"
            size={22}
            color={categoryFilterActive ? '#38bdf8' : '#94a3b8'}
          />
        </Pressable>
      </View>
      <Text style={[styles.meta, { textAlign }]}>
        {tUi('floor1ProductsCount', locale).replace('{n}', String(filtered.length))}
      </Text>
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}

      {loading && !catalog ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={(
            <Text style={styles.empty}>{tUi('floor1ProductsEmpty', locale)}</Text>
          )}
          refreshing={refreshing}
          onRefresh={() => load({ pull: true })}
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
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryFilterOpen(false)}>
          <View style={styles.pickerSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{tUi('floor1ProductsCategoryFilter', locale)}</Text>
              {categoryFilterActive ? (
                <Pressable onPress={() => setSelectedCategoryIds(new Set())}>
                  <Text style={styles.pickerClear}>{tUi('floor1ProductsClearFilter', locale)}</Text>
                </Pressable>
              ) : null}
            </View>
            {warehouseCategoryOptions.length === 0 ? (
              <Text style={styles.pickerEmpty}>{tUi('floor1ProductsEmpty', locale)}</Text>
            ) : (
              <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
                {warehouseCategoryOptions.map((opt) => {
                  const checked = selectedCategoryIds.has(opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.pickerRow, checked && styles.pickerRowActive]}
                      onPress={() => toggleCategoryFilterId(opt.id)}
                    >
                      <MaterialCommunityIcons
                        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={22}
                        color={checked ? '#38bdf8' : '#64748b'}
                      />
                      <Text style={styles.pickerRowText} numberOfLines={2}>{opt.name}</Text>
                      <Text style={styles.pickerCount}>{opt.count}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable style={styles.pickerDone} onPress={() => setCategoryFilterOpen(false)}>
              <Text style={styles.pickerDoneText}>{tUi('presetPickerClose', locale)}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
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
    backgroundColor: theme.surface,
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
  meta: {
    color: theme.textMuted,
    fontSize: 13,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  listContent: { paddingHorizontal: 10, paddingBottom: 24 },
  gridRow: { gap: 8, marginBottom: 8, alignItems: 'stretch' },
  gridCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: '48%',
    minWidth: 0,
    minHeight: 280,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  cardPress: {
    flex: 1,
    padding: 8,
    paddingBottom: 6,
    justifyContent: 'space-between',
  },
  cardMain: { flexGrow: 1 },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  thumbEmpty: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  cardSku: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  qtyFooter: {
    marginTop: 8,
    paddingTop: 8,
    minHeight: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  qtyLine: {
    color: '#069506',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  empty: {
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
  },
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
    maxHeight: '75%',
    paddingVertical: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pickerTitle: { color: theme.text, fontSize: 16, fontWeight: '700', flex: 1 },
  pickerClear: { color: '#38bdf8', fontSize: 14, fontWeight: '600', paddingVertical: 4, paddingLeft: 12 },
  pickerEmpty: { color: theme.textMuted, fontSize: 14, paddingHorizontal: 16, paddingVertical: 16 },
  pickerList: { maxHeight: 360 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  pickerRowActive: { backgroundColor: 'rgba(12, 74, 110, 0.35)' },
  pickerRowText: { color: theme.text, fontSize: 15, flex: 1 },
  pickerCount: { color: theme.textMuted, fontSize: 13, fontWeight: '600', minWidth: 28, textAlign: 'right' },
  pickerDone: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.primary,
    alignItems: 'center',
  },
  pickerDoneText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
