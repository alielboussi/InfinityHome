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

function storeroomScreenIdForIndex(index) {
  const n = Math.floor(Number(index) || 1);
  if (n === 2) return 'warehouse_storeroom_2';
  if (n === 3) return 'warehouse_storeroom_3';
  return 'warehouse_storeroom_1';
}

export default function WarehouseStoreroomScreen({ route }) {
  const storeroomIndex = Math.min(3, Math.max(1, Math.floor(Number(route?.params?.storeroomIndex) || 1)));
  const screenId = storeroomScreenIdForIndex(storeroomIndex);
  const grant = useSharedMobileAccessGrant();
  const userEmail = useSharedMobileAccessUserEmail();
  const canIncreaseStock = isCatalogLocationStockIncreaseAllowed(grant, screenId, userEmail);
  const canUploadPhoto = isCatalogLocationPhotoUploadAllowed(grant, screenId, userEmail);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [materials, setMaterials] = useState([]);
  const materialsRef = useRef([]);
  materialsRef.current = materials;
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [photoBusyId, setPhotoBusyId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [qtyDraftById, setQtyDraftById] = useState({});

  const loadMaterials = useCallback(async ({ fromPull = false } = {}) => {
    const hasCached = materialsRef.current.length > 0;
    if (!hasCached) setLoading(true);
    else if (fromPull) setRefreshing(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('catalog-storeroom-list', {
        storeroom_index: storeroomIndex,
      });
      setMaterials(Array.isArray(res?.materials) ? res.materials : []);
    } catch (e) {
      setError(e?.message || `Failed to load Storeroom ${storeroomIndex} materials`);
      if (!hasCached) setMaterials([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeroomIndex]);

  useFocusEffect(
    useCallback(() => {
      loadMaterials();
    }, [loadMaterials]),
  );

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (item) => String(item.name || '').toLowerCase().includes(q)
        || String(item.family_sku || '').toLowerCase().includes(q)
        || String(item.uom || '').toLowerCase().includes(q),
    );
  }, [materials, search]);

  const selectedMaterial = useMemo(
    () => materials.find((m) => String(m.assembly_id || m.id) === selectedId) || null,
    [materials, selectedId],
  );

  const openModal = (item) => {
    if (busyId || photoBusyId || !item) return;
    setSelectedId(String(item.assembly_id || item.id));
  };

  const closeModal = () => {
    if (busyId || photoBusyId) return;
    setSelectedId('');
  };

  const handleAdjustQty = async (item, direction) => {
    if (!canIncreaseStock || busyId) return;
    const aid = String(item.assembly_id || item.id || '').trim();
    if (!aid) return;
    const rawDraft = String(qtyDraftById[aid] ?? '').trim();
    const amount = rawDraft === '' ? 1 : Number(rawDraft);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid quantity', 'Enter a positive quantity or leave empty to adjust by 1.');
      return;
    }
    const sign = direction < 0 ? -1 : 1;
    const delta = sign * amount;
    setBusyId(aid);
    setError('');
    try {
      const res = await warehouseMobileRequest('catalog-storeroom-stock-increase', {
        storeroom_index: storeroomIndex,
        assembly_id: aid,
        delta,
      });
      const nextQty = Number(res?.quantity);
      if (Number.isFinite(nextQty)) {
        setMaterials((prev) =>
          prev.map((row) => {
            const rid = String(row.assembly_id || row.id || '');
            return rid === aid ? { ...row, quantity: nextQty } : row;
          }),
        );
      }
      setQtyDraftById((prev) => {
        const next = { ...prev };
        delete next[aid];
        return next;
      });
      await loadMaterials();
    } catch (e) {
      Alert.alert('Stock update failed', e?.message || 'Could not update storeroom stock.');
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
      const res = await warehouseMobileRequest('catalog-storeroom-photo-upload', {
        storeroom_index: storeroomIndex,
        assembly_id: aid,
        image_base64: imageBase64,
      });
      const nextUrl = String(res?.image_url || '').trim();
      if (nextUrl) {
        setMaterials((prev) =>
          prev.map((row) => {
            const rid = String(row.assembly_id || row.id || '');
            return rid === aid ? { ...row, image_url: nextUrl } : row;
          }),
        );
      }
      await loadMaterials();
    } catch (e) {
      Alert.alert('Image upload failed', e?.message || 'Could not upload material image.');
    } finally {
      setPhotoBusyId('');
    }
  };

  const renderMaterialCard = ({ item }) => {
    const id = String(item.assembly_id || item.id);
    const cardImage = resolveProductImageUrl(item?.image_url);
    const cardBusy = busyId === id || photoBusyId === id;
    const qty = Number(item.quantity) || 0;
    const uomLabel = String(item.uom || '').trim();
    return (
      <Pressable
        style={({ pressed }) => [
          styles.tile,
          pressed && styles.tilePressed,
          cardBusy && styles.tileBusy,
        ]}
        disabled={Boolean(busyId || photoBusyId)}
        onPress={() => openModal(item)}
      >
        {cardImage ? (
          <Image source={{ uri: cardImage }} style={styles.tileImage} resizeMode="cover" />
        ) : (
          <View style={styles.tileImagePlaceholder} />
        )}
        <View style={styles.tileOverlay} />
        <View style={styles.tileNameBar}>
          <Text style={styles.tileName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.tileUomSub}>
            {uomLabel ? `${qty} ${uomLabel}` : `Qty: ${qty}`}
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
          onPress={() => openModal(item)}
        >
          <MaterialCommunityIcons
            name={canIncreaseStock ? 'plus-box-outline' : canUploadPhoto ? 'image-plus-outline' : 'information-outline'}
            size={22}
            color="#fff"
          />
          <Text style={styles.inlayBtnText}>
            {uomLabel ? `${qty} ${uomLabel}` : String(qty)}
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
        placeholder={`Search Storeroom ${storeroomIndex} material, SKU, or UOM…`}
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {loading && materials.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => String(item.assembly_id || item.id)}
        refreshing={refreshing}
        onRefresh={() => loadMaterials({ fromPull: true })}
        contentContainerStyle={filtered.length === 0 ? styles.listEmpty : styles.gridContent}
        renderItem={renderMaterialCard}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.emptyText}>
              {hasSearch
                ? 'No matching storeroom materials.'
                : `No materials in Storeroom ${storeroomIndex}.`}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(selectedMaterial)} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            {selectedMaterial ? (() => {
              const id = String(selectedMaterial.assembly_id || selectedMaterial.id);
              const qty = Number(selectedMaterial.quantity) || 0;
              const uomLabel = String(selectedMaterial.uom || '').trim();
              const rowImage = resolveProductImageUrl(selectedMaterial.image_url);
              const isPhotoBusy = photoBusyId === id;
              const isStockBusy = busyId === id;
              const draftVal = qtyDraftById[id] !== undefined ? String(qtyDraftById[id]) : '';
              const thumbContent = isPhotoBusy ? (
                <View style={styles.inlayThumbPlaceholder}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : rowImage ? (
                <Image source={{ uri: rowImage }} style={styles.inlayThumb} resizeMode="cover" />
              ) : (
                <View style={styles.inlayThumbPlaceholder}>
                  <MaterialCommunityIcons
                    name={canUploadPhoto ? 'image-plus-outline' : 'cube-outline'}
                    size={24}
                    color={canUploadPhoto ? theme.primary : theme.textMuted}
                  />
                </View>
              );

              return (
                <View>
                  <Text style={styles.modalTitle}>{selectedMaterial.name}</Text>
                  <Text style={styles.modalSub}>
                    Storeroom {storeroomIndex}
                    {uomLabel ? ` · UOM: ${uomLabel}` : ''}
                    {selectedMaterial.family_sku ? ` · SKU: ${selectedMaterial.family_sku}` : ''}
                  </Text>
                  <View style={styles.inlayRow}>
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
                        <Text style={styles.inlayProductName}>{selectedMaterial.name}</Text>
                        <Text style={styles.inlaySku}>
                          UOM: {uomLabel || '—'}
                        </Text>
                        {canUploadPhoto ? (
                          <Pressable
                            onPress={() => pickAndUploadPhoto(id)}
                            disabled={Boolean(busyId || photoBusyId)}
                            style={{ marginTop: 4 }}
                          >
                            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>
                              {isPhotoBusy ? 'Uploading photo…' : 'Import / change photo'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={styles.inlayQtyRight}>
                        {qty} {uomLabel}
                      </Text>
                    </View>
                    {canIncreaseStock ? (
                      <View style={styles.stockActionRow}>
                        <Pressable
                          style={[styles.stepBtn, styles.stepBtnMinus, (isStockBusy || qty <= 0) && styles.btnDisabled]}
                          disabled={Boolean(busyId || photoBusyId || qty <= 0)}
                          onPress={() => handleAdjustQty(selectedMaterial, -1)}
                          accessibilityLabel={`Decrease stock for ${selectedMaterial.name}`}
                        >
                          <Text style={styles.stepBtnMinusText}>−</Text>
                        </Pressable>
                        <TextInput
                          style={styles.qtyInput}
                          keyboardType="decimal-pad"
                          value={draftVal}
                          editable={!isStockBusy}
                          onChangeText={(txt) =>
                            setQtyDraftById((prev) => ({ ...prev, [id]: txt.replace(/[^0-9.]/g, '') }))
                          }
                          placeholder=""
                          placeholderTextColor={theme.textMuted}
                        />
                        <Pressable
                          style={[styles.stepBtn, styles.stepBtnPlus, isStockBusy && styles.btnDisabled]}
                          disabled={Boolean(busyId || photoBusyId)}
                          onPress={() => handleAdjustQty(selectedMaterial, 1)}
                          accessibilityLabel={`Increase stock for ${selectedMaterial.name}`}
                        >
                          <Text style={styles.stepBtnPlusText}>+</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })() : null}
            <Pressable
              style={styles.closeBtn}
              onPress={closeModal}
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
  tileUomSub: {
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
    fontSize: 17,
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
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4, color: theme.text },
  modalSub: { fontSize: 13, color: theme.textMuted, marginBottom: 14 },
  inlayRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    gap: 12,
  },
  inlayRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  inlayThumbBtn: {
    borderRadius: 8,
  },
  inlayThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },
  inlayThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlayQtyRight: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.primary,
  },
  stockActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  qtyInput: {
    width: 90,
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
});
