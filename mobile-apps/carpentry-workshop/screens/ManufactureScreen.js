// @refresh reset — Manufacture had grid/qty/camera code removed; avoid partial Fast Refresh.
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import {
  fetchCarpentryManufactureProducts,
  startCarpentryProductionJob,
} from '../services/carpentryApi';
import ProductionPressableHint from '../productionKiosk/lib/ProductionPressableHint';
import { theme } from '../shared/theme';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { extractProductionBaseName } from '../productionKiosk/lib/productionItemName';

/** Minimum tile height ~8 cm; width fills the list row. */
const CARD_MIN_SIZE = PixelRatio.roundToNearestPixel((8 * 160) / 2.54 / PixelRatio.get());
const CARD_GAP = 12;

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty ?? item?.carpentry_qty) || 0));
}

function familyCoverSeaterRank(name) {
  const n = String(name || '').trim().toLowerCase();
  if (/\b3\s*seater\b/.test(n)) return 0;
  if (/\b2\s*seater\b/.test(n)) return 1;
  if (/\b(single|1)\s*seater\b/.test(n)) return 2;
  return 3;
}

function pickGroupImageUrl(items) {
  const list = items || [];
  const ranked = [...list].sort((a, b) => {
    const na = a?.raw_name || a?.name || '';
    const nb = b?.raw_name || b?.name || '';
    return familyCoverSeaterRank(na) - familyCoverSeaterRank(nb);
  });
  for (const item of ranked) {
    const url = resolveProductImageUrl(item?.image_url);
    if (url) return url;
  }
  for (const item of list) {
    const url = resolveProductImageUrl(item?.family_image_url);
    if (url) return url;
  }
  return '';
}

function groupManufactureProducts(products) {
  const map = new Map();
  (products || []).forEach((item) => {
    const rawName = String(item?.raw_name || item?.name || '').trim();
    const familyBase = extractProductionBaseName(rawName) || rawName || String(item.raw_assembly_id || item.id);
    const key = familyBase.toLowerCase();
    if (!map.has(key)) map.set(key, { familyBase, items: [] });
    map.get(key).items.push(item);
  });
  return [...map.entries()].map(([key, { familyBase, items }]) => {
    const sorted = [...items].sort((a, b) =>
      String(a.raw_name || '').localeCompare(String(b.raw_name || '')),
    );
    const totalFloor2 = sorted.reduce((sum, row) => sum + floor2Qty(row), 0);
    return {
      key,
      displayName: familyBase,
      items: sorted,
      totalFloor2,
      imageUrl: pickGroupImageUrl(sorted),
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default function ManufactureScreen({
  navigation,
  allowed,
  photoUploadAllowed = false,
  accessHint,
  onRefreshAccess,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const productsRef = useRef([]);
  productsRef.current = products;
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [inlayGroupKey, setInlayGroupKey] = useState('');
  const [photoBusyId, setPhotoBusyId] = useState('');

  const loadCatalog = useCallback(async ({ force = false, fromPull = false } = {}) => {
    if (!allowed) {
      setProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const hasCachedRows = productsRef.current.length > 0;
    if (!hasCachedRows) {
      setLoading(true);
    } else if (fromPull) {
      setRefreshing(true);
    }
    setError('');
    try {
      const list = await fetchCarpentryManufactureProducts({ force: force || fromPull });
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('manufactureLoadFailed', locale));
      if (!hasCachedRows) setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
    }, [loadCatalog]),
  );

  const allGroups = useMemo(() => groupManufactureProducts(products), [products]);

  const inlayGroup = useMemo(
    () => allGroups.find((g) => g.key === inlayGroupKey) || null,
    [allGroups, inlayGroupKey],
  );

  const groups = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter((group) => group.displayName.toLowerCase().includes(q));
  }, [allGroups, search]);

  const hasSearch = Boolean(String(search || '').trim());

  const startJobForItem = async (item) => {
    if (!allowed || busyId) return;
    const rawId = String(item.raw_assembly_id || item.id || '');
    if (!rawId) return;
    const materialCount = Number(item.material_count ?? item.materials?.length ?? 0);
    if (materialCount < 1) {
      Alert.alert(tUi('manufactureConfirmTitle', locale), tUi('manufactureNoMaterials', locale));
      return;
    }
    setBusyId(rawId);
    setError('');
    try {
      const created = await startCarpentryProductionJob({ assemblyId: rawId, productQty: 1 });
      setInlayGroupKey('');
      navigation.navigate('Jobs', { initialJob: created?.job || created });
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || tUi('manufactureFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const closeInlay = () => {
    if (busyId || photoBusyId) return;
    setInlayGroupKey('');
  };

  const onCardPress = (group) => {
    if (group.items.length !== 1) return;
    startJobForItem(group.items[0]);
  };

  const openInlay = (group) => {
    if (busyId || photoBusyId || !group || !group.items.length) return;
    if (group.items.length < 2 && !photoUploadAllowed) return;
    setInlayGroupKey(group.key);
  };

  const onInlayPick = (item) => {
    startJobForItem(item);
  };

  const uploadVariantPhotoFromSource = async () => {};

  const pickVariantPhotoFromLibrary = async () => {};

  const onInlayThumbPress = () => {};

  const renderGroupCard = ({ item: group }) => {
    const multi = group.items.length > 1;
    const cardImage = group.imageUrl || pickGroupImageUrl(group.items);
    const cardBusy = group.items.some(
      (row) => busyId === String(row.raw_assembly_id || row.id),
    );
    return (
      <ProductionPressableHint
        hintKey="dashTileHint_manufacture"
        locale={locale}
        textAlign={textAlign}
        disabled={Boolean(busyId)}
        onPress={() => onCardPress(group)}
        style={({ pressed }) => [
          styles.tile,
          !multi && pressed && styles.tilePressed,
          cardBusy && styles.tileBusy,
          multi && styles.tileInlayOnly,
        ]}
      >
        {cardImage ? (
          <Image source={{ uri: cardImage }} style={styles.tileImage} resizeMode="cover" />
        ) : (
          <View style={styles.tileImagePlaceholder} />
        )}
        <View style={styles.tileOverlay} />
        <View style={styles.tileNameBar}>
          <Text style={styles.tileName} numberOfLines={2}>
            {group.displayName}
          </Text>
        </View>
        {!cardImage ? (
          <View style={styles.tileNoImageCenter} pointerEvents="none">
            <MaterialCommunityIcons name="image-off-outline" size={48} color={theme.textMuted} />
          </View>
        ) : null}
        {multi ? (
          <Pressable
            style={styles.inlayBtn}
            hitSlop={12}
            disabled={Boolean(busyId || photoBusyId)}
            onPress={() => openInlay(group)}
          >
            <MaterialCommunityIcons name="layers-triple" size={22} color="#fff" />
            <Text style={styles.inlayBtnText}>
              {tUi('manufactureSameNameInlay', locale).replace('{count}', String(group.items.length))}
            </Text>
          </Pressable>
        ) : photoUploadAllowed ? (
          <Pressable
            style={styles.inlayBtn}
            hitSlop={12}
            disabled={Boolean(busyId || photoBusyId)}
            onPress={() => openInlay(group)}
          >
            <MaterialCommunityIcons name="image-plus-outline" size={22} color="#fff" />
          </Pressable>
        ) : null}
        {cardBusy ? (
          <ActivityIndicator color={theme.primary} size="small" style={styles.tileSpinner} />
        ) : null}
      </ProductionPressableHint>
    );
  };

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('manufactureTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', locale)}</Text>
        {accessHint ? <Text style={[kiosk.hint, { textAlign }]}>{accessHint}</Text> : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess({ background: false })}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', locale)}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[kiosk.screen, styles.flex, kioskScreenEdgesSafe(insets, 16)]}>
      <ProductionKioskTopBar
        title={tUi('manufactureTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Pressable style={styles.jobsLink} onPress={() => navigation.navigate('Jobs')}>
        <Text style={styles.jobsLinkText}>{tUi('carpentryJobsTitle', locale)}</Text>
      </Pressable>
      <TextInput
        style={[kiosk.input, styles.searchInput, { textAlign: 'left' }]}
        placeholder={tUi('manufactureSearch', locale)}
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {hasSearch && !loading && groups.length === 0 && !error ? (
        <Text style={[kiosk.searchHint, { textAlign }]}>{tUi('manufactureSearchNoMatch', locale)}</Text>
      ) : null}
      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={groups}
        keyExtractor={(group) => group.key}
        refreshing={refreshing}
        onRefresh={() => loadCatalog({ force: true, fromPull: true })}
        contentContainerStyle={groups.length === 0 ? styles.listEmpty : styles.gridContent}
        renderItem={renderGroupCard}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && !error && !hasSearch ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('manufactureEmpty', locale)}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(inlayGroup)} transparent animationType="fade" onRequestClose={closeInlay}>
        <Pressable style={styles.modalBackdrop} onPress={closeInlay}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{inlayGroup?.displayName || tUi('manufactureInlayTitle', locale)}</Text>
            <Text style={styles.modalSub}>{tUi('manufactureInlayHint', locale)}</Text>
            <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
              {(inlayGroup?.items || []).map((item) => {
                const id = String(item.raw_assembly_id || item.id);
                const qty = floor2Qty(item);
                const rowImage = resolveProductImageUrl(item?.image_url);
                const isPhotoBusy = photoBusyId === id;
                const thumbContent = isPhotoBusy ? (
                  <View style={styles.inlayThumbPlaceholder}>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                ) : rowImage ? (
                  <Image source={{ uri: rowImage }} style={styles.inlayThumb} resizeMode="cover" />
                ) : (
                  <View style={styles.inlayThumbPlaceholder}>
                    <MaterialCommunityIcons
                      name={photoUploadAllowed ? 'image-plus-outline' : 'sofa-outline'}
                      size={22}
                      color={photoUploadAllowed ? theme.primary : theme.textMuted}
                    />
                  </View>
                );
                return (
                  <Pressable
                    key={id}
                    style={({ pressed }) => [styles.inlayRow, pressed && styles.inlayRowPressed]}
                    disabled={Boolean(busyId || photoBusyId)}
                    onPress={() => onInlayPick(item)}
                  >
                    {photoUploadAllowed ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          onInlayThumbPress(item);
                        }}
                        disabled={Boolean(busyId || photoBusyId)}
                        hitSlop={8}
                        style={styles.inlayThumbBtn}
                      >
                        {thumbContent}
                      </Pressable>
                    ) : (
                      thumbContent
                    )}
                    <Text style={styles.inlayProductName} numberOfLines={2}>
                      {item.raw_name || item.name || '—'}
                    </Text>
                    <Text style={styles.inlayQtyRight}>
                      {tUi('manufactureQtyLabel', locale).replace('{qty}', String(qty))}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.primary} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={[kiosk.btn, { marginTop: 12 }]} onPress={closeInlay} disabled={Boolean(busyId || photoBusyId)}>
              <Text style={kiosk.btnText}>{tUi('cancel', locale)}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchInput: { marginBottom: 12 },
  jobsLink: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 8 },
  jobsLinkText: { color: theme.primary, fontSize: 15, fontWeight: '700' },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  gridContent: { paddingBottom: 24 },
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
  tileInlayOnly: { opacity: 1 },
  tileBusy: { opacity: 0.65 },
  tileNameBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 52,
    zIndex: 1,
  },
  tileName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 26,
    textAlign: 'center',
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
  empty: { marginTop: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
  },
  inlayCard: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: theme.text },
  modalSub: { fontSize: 14, color: theme.textMuted, marginBottom: 12 },
  inlayScroll: { maxHeight: 360 },
  inlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  inlayRowPressed: { backgroundColor: theme.surface },
  inlayProductName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  inlayThumbBtn: {
    borderRadius: 8,
  },
  inlayThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },
  inlayThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlayQtyRight: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textSecondary,
  },
});
