import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSharedMobileAccessGrant, useSharedMobileAccessUserEmail } from '../shared/MobileAccessGrantContext';
import { isCatalogLocationStockIncreaseAllowed } from '../shared/mobileAccessManifest';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { theme } from '../shared/theme';
import ProductionProductListRow, { productionProductRowPressableStyle } from '../shared/components/ProductionProductListRow';

const CARD_MIN_SIZE = PixelRatio.roundToNearestPixel((8 * 160) / 2.54 / PixelRatio.get());
const CARD_GAP = 12;
const productRowPressable = productionProductRowPressableStyle(CARD_GAP);

const PRESET_SUFFIXES = [
  '3 Seater Recliner',
  '2 Seater Recliner',
  'Single Seater Recliner',
  '1 Seater Recliner',
  'Dresser Table Mirror',
  'Dresser Mirror',
  'Dresser Table',
  'Buffet Mirror',
  'Dining Table',
  'Dining Chair',
  'Coffee Table',
  'Lounge Chair',
  'Single Seater',
  'Corner Sofa',
  'Side Table',
  '3 Seater',
  '2 Seater',
  '1 Seater',
  'Recliner',
  'Curtains',
  'Pillows',
  'Buffet',
  'L Shape',
];

function extractBaseName(productName) {
  const n = String(productName || '').trim();
  if (!n) return '';
  for (const suffix of PRESET_SUFFIXES) {
    const tail = ` ${suffix}`;
    if (n.toLowerCase().endsWith(tail.toLowerCase())) {
      return n.slice(0, -tail.length).trim();
    }
  }
  return n;
}

function farmQty(item) {
  return Math.max(0, Math.floor(Number(item?.farm_qty ?? item?.quantity) || 0));
}

function productCardImageUrl(item) {
  const wip = String(item?.floor2_image_url || '').trim();
  return resolveProductImageUrl(wip) || '';
}

/** One Floor 2 card per product (no family merge or shared cover). */
function floor2ProductsAsFlatCards(products) {
  return (products || [])
    .map((item) => {
      const id = String(item.assembly_id || item.id || '').trim();
      if (!id) return null;
      const name = String(item.raw_name || item.name || id).trim();
      return {
        key: id,
        displayName: name,
        items: [item],
        totalFarm: farmQty(item),
        imageUrl: productCardImageUrl(item),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const FarmGroupListRow = memo(function FarmGroupListRow({ group, busyId, onOpen }) {
  const product = group.items?.[0];
  const cardImage = group.imageUrl || productCardImageUrl(product);
  const cardBusy = group.items.some(
    (row) => busyId === String(row.assembly_id || row.id),
  );
  const sku = String(product?.family_sku || '').trim();
  return (
    <Pressable
      style={({ pressed }) => [
        productRowPressable.row,
        pressed && productRowPressable.rowPressed,
        cardBusy && productRowPressable.rowBusy,
      ]}
      disabled={Boolean(busyId)}
      onPress={() => onOpen(group)}
    >
      <ProductionProductListRow
        imageUrl={cardImage || undefined}
        name={group.displayName}
        sku={sku}
        subtitle={`Farm on hand: ${group.totalFarm}`}
        busy={cardBusy}
      />
    </Pressable>
  );
});

export default function FarmWarehouseScreen() {
  const grant = useSharedMobileAccessGrant();
  const userEmail = useSharedMobileAccessUserEmail();
  const canIncreaseStock = isCatalogLocationStockIncreaseAllowed(grant, 'warehouse_farm_1', userEmail);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const productsRef = useRef([]);
  productsRef.current = products;
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [inlayGroupKey, setInlayGroupKey] = useState('');
  const [qtyDraftById, setQtyDraftById] = useState({});

  const loadProducts = useCallback(async ({ fromPull = false } = {}) => {
    const hasCached = productsRef.current.length > 0;
    if (!hasCached) setLoading(true);
    else if (fromPull) setRefreshing(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('catalog-farm-list', {});
      setProducts(Array.isArray(res?.products) ? res.products : []);
    } catch (e) {
      setError(e?.message || 'Failed to load Farm warehouse products');
      if (!hasCached) setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts]),
  );

  const allGroups = useMemo(() => floor2ProductsAsFlatCards(products), [products]);
  const inlayGroup = useMemo(
    () => allGroups.find((g) => g.key === inlayGroupKey) || null,
    [allGroups, inlayGroupKey],
  );

  const groups = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter((group) => {
      if (group.displayName.toLowerCase().includes(q)) return true;
      return group.items.some(
        (item) => String(item.name || '').toLowerCase().includes(q)
          || String(item.family_sku || '').toLowerCase().includes(q),
      );
    });
  }, [allGroups, search]);

  const openInlay = useCallback((group) => {
    if (busyId || !group?.items?.length) return;
    setInlayGroupKey(group.key);
  }, [busyId]);

  const closeInlay = useCallback(() => {
    if (busyId) return;
    setInlayGroupKey('');
  }, [busyId]);

  const handleAdjustQty = async (item, direction) => {
    if (!canIncreaseStock || busyId) return;
    const aid = String(item.assembly_id || item.id || '').trim();
    if (!aid) return;
    const rawDraft = String(qtyDraftById[aid] ?? '').trim();
    const amount = rawDraft === '' ? 1 : Math.floor(Number(rawDraft) || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter quantity', 'Enter a positive quantity or leave empty to adjust by 1.');
      return;
    }
    const sign = direction < 0 ? -1 : 1;
    const delta = sign * amount;
    setBusyId(aid);
    setError('');
    try {
      const res = await warehouseMobileRequest('catalog-farm-stock-adjust', {
        assembly_id: aid,
        delta,
      });
      const nextQty = Number(res?.quantity);
      if (Number.isFinite(nextQty)) {
        setProducts((prev) =>
          prev.map((row) => {
            const rid = String(row.assembly_id || row.id || '');
            return rid === aid ? { ...row, quantity: nextQty, farm_qty: nextQty } : row;
          }),
        );
      }
      setQtyDraftById((prev) => {
        const next = { ...prev };
        delete next[aid];
        return next;
      });
      await loadProducts();
    } catch (e) {
      Alert.alert('Stock update failed', e?.message || 'Could not update Farm stock.');
    } finally {
      setBusyId('');
    }
  };

  const renderGroupCard = useCallback(
    ({ item: group }) => (
      <FarmGroupListRow
        group={group}
        busyId={busyId}
        onOpen={openInlay}
      />
    ),
    [busyId, openInlay],
  );

  const hasSearch = Boolean(String(search || '').trim());

  return (
    <View style={styles.root}>
      <View style={styles.topToolbar}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Farm warehouse product or SKU…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={groups}
        keyExtractor={(group) => group.key}
        refreshing={refreshing}
        onRefresh={() => loadProducts({ fromPull: true })}
        contentContainerStyle={groups.length === 0 ? styles.listEmpty : styles.gridContent}
        renderItem={renderGroupCard}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.emptyText}>
              {hasSearch ? 'No matching farm products.' : 'No farm warehouse products found.'}
            </Text>
          ) : null
        }
      />

      {/* Variant / Stock Inlay Modal */}
      <Modal visible={Boolean(inlayGroup)} transparent animationType="fade" onRequestClose={closeInlay}>
        <Pressable style={styles.modalBackdrop} onPress={closeInlay}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{inlayGroup?.displayName || 'Farm product'}</Text>
            <Text style={styles.modalSub}>
              {canIncreaseStock
                ? 'WIP photo matches Floor 2. Use − / + to adjust farm on-hand qty.'
                : 'WIP photo matches Floor 2. View farm on-hand qty.'}
            </Text>
            <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
              {(inlayGroup?.items || []).map((item) => {
                const id = String(item.assembly_id || item.id);
                const qty = farmQty(item);
                const rowImage = productCardImageUrl(item);
                const isStockBusy = busyId === id;
                const draftVal = qtyDraftById[id] !== undefined ? String(qtyDraftById[id]) : '';
                const thumbContent = rowImage ? (
                  <Image source={{ uri: rowImage }} style={styles.inlayThumb} resizeMode="contain" />
                ) : (
                  <View style={styles.inlayThumbPlaceholder}>
                    <MaterialCommunityIcons name="sofa-outline" size={22} color={theme.textMuted} />
                  </View>
                );

                return (
                  <View key={id} style={styles.inlayRow}>
                    <View style={styles.inlayRowTop}>
                      {thumbContent}
                      <View style={styles.inlayInfo}>
                        <Text style={styles.inlayProductName} numberOfLines={2}>
                          {item.raw_name || item.name || '—'}
                        </Text>
                        {item.family_sku ? (
                          <Text style={styles.inlaySku}>{item.family_sku}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.inlayQtyRight}>On hand: {qty}</Text>
                    </View>
                    {canIncreaseStock ? (
                      <View style={styles.stockActionRow}>
                        <Pressable
                          style={[styles.stepBtn, styles.stepBtnMinus, (isStockBusy || qty <= 0) && styles.btnDisabled]}
                          disabled={Boolean(busyId || qty <= 0)}
                          onPress={() => handleAdjustQty(item, -1)}
                          accessibilityLabel={`Decrease stock for ${item.name}`}
                        >
                          <Text style={styles.stepBtnMinusText}>−</Text>
                        </Pressable>
                        <TextInput
                          style={styles.qtyInput}
                          keyboardType="number-pad"
                          value={draftVal}
                          editable={!isStockBusy}
                          onChangeText={(txt) =>
                            setQtyDraftById((prev) => ({ ...prev, [id]: txt.replace(/[^0-9]/g, '') }))
                          }
                          placeholder=""
                          placeholderTextColor={theme.textMuted}
                        />
                        <Pressable
                          style={[styles.stepBtn, styles.stepBtnPlus, isStockBusy && styles.btnDisabled]}
                          disabled={Boolean(busyId)}
                          onPress={() => handleAdjustQty(item, 1)}
                          accessibilityLabel={`Increase stock for ${item.name}`}
                        >
                          <Text style={styles.stepBtnPlusText}>+</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            <Pressable
              style={styles.closeBtn}
              onPress={closeInlay}
              disabled={Boolean(busyId)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topToolbar: {
    marginBottom: 12,
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  plusFab: {
    width: 48,
    height: 48,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusFabText: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
  plusCreateBtnPressed: {
    opacity: 0.85,
  },
  errorText: {
    color: theme.danger,
    marginBottom: 10,
    fontWeight: '600',
  },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  gridContent: { paddingBottom: 24, gap: CARD_GAP },
  emptyText: {
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 24,
    fontSize: 15,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    minHeight: CARD_MIN_SIZE,
    marginBottom: CARD_GAP,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    overflow: 'hidden',
  },
  tileImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  tileImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.surface,
  },
  tileNoImageCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 56,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  tilePressed: { opacity: 0.92, borderColor: theme.primary },
  tileBusy: { opacity: 0.65 },
  tileNameBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 52,
    zIndex: 1,
    alignItems: 'center',
  },
  tileName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 26,
    textAlign: 'center',
  },
  tileStockSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  inlayBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
  },
  inlayBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  tileSpinner: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  inlayCard: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6, color: theme.text },
  modalSub: { fontSize: 13, color: theme.textMuted, marginBottom: 12 },
  inlayScroll: { maxHeight: 460 },
  inlayRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    gap: 10,
  },
  inlayRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlayInfo: {
    flex: 1,
    minWidth: 0,
  },
  inlayProductName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  inlaySku: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  inlayThumbCol: {
    alignItems: 'center',
    gap: 4,
  },
  inlayRemovePhotoBtn: {
    padding: 2,
  },
  inlayThumbBtn: {
    borderRadius: 8,
  },
  inlayThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },
  inlayThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlayQtyRight: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
  },
  stockActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  qtyInput: {
    width: 84,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  stepBtn: {
    width: 46,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnMinus: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stepBtnMinusText: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  stepBtnPlus: {
    backgroundColor: theme.primary,
  },
  stepBtnPlusText: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  closeBtn: {
    marginTop: 14,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  fieldLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  formInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    color: theme.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  photoPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  photoPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  photoPickBtnText: {
    color: theme.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  photoPreviewThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },
  presetList: {
    gap: 6,
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  presetRowSelected: {
    borderColor: theme.primary,
  },
  presetCheckArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  presetRowLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  presetQtyInput: {
    width: 68,
    backgroundColor: theme.bg,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 6,
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  modalFooterBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  primarySaveBtn: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySaveBtnText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
});
