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
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSharedMobileAccessGrant, useSharedMobileAccessUserEmail } from '../shared/MobileAccessGrantContext';
import {
  isCatalogLocationPhotoUploadAllowed,
  isCatalogLocationStockIncreaseAllowed,
} from '../shared/mobileAccessManifest';
import { prepareCatalogPhotoForUpload } from '../shared/prepareCatalogPhotoUpload';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { theme } from '../shared/theme';

const CARD_MIN_SIZE = PixelRatio.roundToNearestPixel((8 * 160) / 2.54 / PixelRatio.get());
const CARD_GAP = 12;

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

function familyCoverSeaterRank(name) {
  const n = String(name || '').trim().toLowerCase();
  if (/\b3\s*seater\b/.test(n)) return 0;
  if (/\b2\s*seater\b/.test(n)) return 1;
  if (/\b(single|1)\s*seater\b/.test(n)) return 2;
  return 3;
}

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty ?? item?.quantity) || 0));
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

function groupFloor2Products(products) {
  const map = new Map();
  (products || []).forEach((item) => {
    const rawName = String(item?.raw_name || item?.name || '').trim();
    const familyBase = extractBaseName(rawName) || rawName || String(item.assembly_id || item.id);
    const key = familyBase.toLowerCase();
    if (!map.has(key)) map.set(key, { familyBase, items: [] });
    map.get(key).items.push(item);
  });
  return [...map.entries()]
    .map(([key, { familyBase, items }]) => {
      const sorted = [...items].sort((a, b) =>
        String(a.raw_name || a.name || '').localeCompare(String(b.raw_name || b.name || '')),
      );
      const totalFloor2 = sorted.reduce((sum, row) => sum + floor2Qty(row), 0);
      return {
        key,
        displayName: familyBase,
        items: sorted,
        totalFloor2,
        imageUrl: pickGroupImageUrl(sorted),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default function WarehouseFloor2Screen() {
  const grant = useSharedMobileAccessGrant();
  const userEmail = useSharedMobileAccessUserEmail();
  const canIncreaseStock = isCatalogLocationStockIncreaseAllowed(grant, 'warehouse_floor_2', userEmail);
  const canUploadPhoto = isCatalogLocationPhotoUploadAllowed(grant, 'warehouse_floor_2', userEmail);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const productsRef = useRef([]);
  productsRef.current = products;
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [photoBusyId, setPhotoBusyId] = useState('');
  const [inlayGroupKey, setInlayGroupKey] = useState('');
  const [qtyDraftById, setQtyDraftById] = useState({});

  const loadProducts = useCallback(async ({ fromPull = false } = {}) => {
    const hasCached = productsRef.current.length > 0;
    if (!hasCached) setLoading(true);
    else if (fromPull) setRefreshing(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('catalog-floor2-list', {});
      setProducts(Array.isArray(res?.products) ? res.products : []);
    } catch (e) {
      setError(e?.message || 'Failed to load Floor 2 products');
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

  const allGroups = useMemo(() => groupFloor2Products(products), [products]);
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

  const openInlay = (group) => {
    if (busyId || photoBusyId || !group?.items?.length) return;
    setInlayGroupKey(group.key);
  };

  const closeInlay = () => {
    if (busyId || photoBusyId) return;
    setInlayGroupKey('');
  };

  const handleIncreaseQty = async (item) => {
    if (!canIncreaseStock || busyId) return;
    const aid = String(item.assembly_id || item.id || '').trim();
    if (!aid) return;
    const rawDraft = qtyDraftById[aid];
    const delta = Math.max(1, Math.floor(Number(rawDraft !== undefined && rawDraft !== '' ? rawDraft : 1) || 1));
    setBusyId(aid);
    setError('');
    try {
      const res = await warehouseMobileRequest('catalog-floor2-stock-increase', {
        assembly_id: aid,
        delta,
      });
      const nextQty = Number(res?.quantity);
      if (Number.isFinite(nextQty)) {
        setProducts((prev) =>
          prev.map((row) => {
            const rid = String(row.assembly_id || row.id || '');
            return rid === aid ? { ...row, quantity: nextQty, floor2_qty: nextQty } : row;
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
      Alert.alert('Stock increase failed', e?.message || 'Could not increase Floor 2 stock.');
    } finally {
      setBusyId('');
    }
  };

  const pickAndUploadPhoto = async (assemblyId) => {
    if (!canUploadPhoto || busyId || photoBusyId) return;
    const aid = String(assemblyId || '').trim();
    if (!aid) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo permission', 'Photo library permission is required to import an image.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      setPhotoBusyId(aid);
      const imageBase64 = await prepareCatalogPhotoForUpload({ uri: picked.assets[0].uri });
      const res = await warehouseMobileRequest('catalog-floor2-photo-upload', {
        assembly_id: aid,
        image_base64: imageBase64,
      });
      const nextUrl = String(res?.image_url || '').trim();
      if (nextUrl) {
        setProducts((prev) =>
          prev.map((row) => {
            const rid = String(row.assembly_id || row.id || '');
            return rid === aid ? { ...row, image_url: nextUrl } : row;
          }),
        );
      }
      await loadProducts();
    } catch (e) {
      Alert.alert('Image upload failed', e?.message || 'Could not upload Floor 2 image.');
    } finally {
      setPhotoBusyId('');
    }
  };

  const renderGroupCard = ({ item: group }) => {
    const multi = group.items.length > 1;
    const cardImage = group.imageUrl || pickGroupImageUrl(group.items);
    const cardBusy = group.items.some(
      (row) => busyId === String(row.assembly_id || row.id) || photoBusyId === String(row.assembly_id || row.id),
    );
    return (
      <Pressable
        style={({ pressed }) => [
          styles.tile,
          pressed && styles.tilePressed,
          cardBusy && styles.tileBusy,
        ]}
        disabled={Boolean(busyId || photoBusyId)}
        onPress={() => openInlay(group)}
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
          <Text style={styles.tileStockSub}>
            On hand: {group.totalFloor2}
          </Text>
        </View>
        {!cardImage ? (
          <View style={styles.tileNoImageCenter} pointerEvents="none">
            <MaterialCommunityIcons name="image-off-outline" size={48} color={theme.textMuted} />
          </View>
        ) : null}
        <Pressable
          style={styles.inlayBtn}
          hitSlop={12}
          disabled={Boolean(busyId || photoBusyId)}
          onPress={() => openInlay(group)}
        >
          <MaterialCommunityIcons
            name={multi ? 'layers-triple' : 'plus-box-outline'}
            size={22}
            color="#fff"
          />
          <Text style={styles.inlayBtnText}>
            {multi ? String(group.items.length) : String(group.totalFloor2)}
          </Text>
        </Pressable>
        {cardBusy ? (
          <ActivityIndicator color={theme.primary} size="small" style={styles.tileSpinner} />
        ) : null}
      </Pressable>
    );
  };

  const hasSearch = Boolean(String(search || '').trim());

  return (
    <View style={styles.root}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search Floor 2 product or SKU…"
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
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
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.emptyText}>
              {hasSearch ? 'No matching Floor 2 products.' : 'No Floor 2 products found.'}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(inlayGroup)} transparent animationType="fade" onRequestClose={closeInlay}>
        <Pressable style={styles.modalBackdrop} onPress={closeInlay}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{inlayGroup?.displayName || 'Floor 2 Product'}</Text>
            <Text style={styles.modalSub}>
              {canIncreaseStock && canUploadPhoto
                ? 'Tap thumbnail to import photo · enter qty to add to Floor 2 stock on hand.'
                : canIncreaseStock
                  ? 'Enter qty to add to Floor 2 stock on hand.'
                  : canUploadPhoto
                    ? 'Tap thumbnail to import photo.'
                    : 'View Floor 2 stock on hand.'}
            </Text>
            <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
              {(inlayGroup?.items || []).map((item) => {
                const id = String(item.assembly_id || item.id);
                const qty = floor2Qty(item);
                const rowImage = resolveProductImageUrl(item?.image_url);
                const isPhotoBusy = photoBusyId === id;
                const isStockBusy = busyId === id;
                const draftVal = qtyDraftById[id] !== undefined ? String(qtyDraftById[id]) : '1';
                const thumbContent = isPhotoBusy ? (
                  <View style={styles.inlayThumbPlaceholder}>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                ) : rowImage ? (
                  <Image source={{ uri: rowImage }} style={styles.inlayThumb} resizeMode="cover" />
                ) : (
                  <View style={styles.inlayThumbPlaceholder}>
                    <MaterialCommunityIcons
                      name={canUploadPhoto ? 'image-plus-outline' : 'sofa-outline'}
                      size={22}
                      color={canUploadPhoto ? theme.primary : theme.textMuted}
                    />
                  </View>
                );

                return (
                  <View key={id} style={styles.inlayRow}>
                    <View style={styles.inlayRowTop}>
                      {canUploadPhoto ? (
                        <Pressable
                          onPress={() => pickAndUploadPhoto(id)}
                          disabled={Boolean(busyId || photoBusyId)}
                          hitSlop={8}
                          style={styles.inlayThumbBtn}
                        >
                          {thumbContent}
                        </Pressable>
                      ) : (
                        thumbContent
                      )}
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
                        <TextInput
                          style={styles.qtyInput}
                          keyboardType="number-pad"
                          value={draftVal}
                          editable={!isStockBusy}
                          onChangeText={(txt) =>
                            setQtyDraftById((prev) => ({ ...prev, [id]: txt.replace(/[^0-9]/g, '') }))
                          }
                          placeholder="1"
                          placeholderTextColor={theme.textMuted}
                        />
                        <Pressable
                          style={[styles.addStockBtn, isStockBusy && styles.btnDisabled]}
                          disabled={Boolean(busyId || photoBusyId)}
                          onPress={() => handleIncreaseQty(item)}
                        >
                          <Text style={styles.addStockBtnText}>
                            {isStockBusy ? 'Adding…' : '+ Add Qty'}
                          </Text>
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
              disabled={Boolean(busyId || photoBusyId)}
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
  searchInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    color: theme.danger,
    marginBottom: 10,
    fontWeight: '600',
  },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  gridContent: { paddingBottom: 24 },
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
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6, color: theme.text },
  modalSub: { fontSize: 13, color: theme.textMuted, marginBottom: 12 },
  inlayScroll: { maxHeight: 400 },
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
  addStockBtn: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  addStockBtnText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.6,
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
});
