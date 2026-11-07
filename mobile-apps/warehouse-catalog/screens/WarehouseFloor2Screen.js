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
  isWarehouseCatalogAddProductAllowed,
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

const SET_COMPONENT_PRESETS = [
  '3 Seater',
  '2 Seater',
  'Single Seater',
  'Lounge Chair',
  '3 Seater Recliner',
  '2 Seater Recliner',
  'Single Seater Recliner',
  'Dining Table',
  'Dining Chair',
  'Buffet',
  'Buffet Mirror',
  'Dresser Table',
  'Dresser Mirror',
  'Coffee Table',
  'Side Table',
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

/**
 * Family card cover photo rule:
 * 1) If the family has a 3 Seater with a photo, use the 3 Seater photo first (then 2 Seater, Single Seater, or any single product photo).
 * 2) Otherwise fall back to `family_image_url`.
 */
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
  const canCreateFloor2 = isWarehouseCatalogAddProductAllowed(grant, userEmail) || canIncreaseStock;

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

  // Create Product / Create Set modal state ('prod' | 'set' | '')
  const [createMode, setCreateMode] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [prodNameInput, setProdNameInput] = useState('');
  const [prodQtyInput, setProdQtyInput] = useState('');
  const [prodPhotoUri, setProdPhotoUri] = useState('');

  const [setBaseNameInput, setSetBaseNameInput] = useState('');
  const [setSelectedPresets, setSetSelectedPresets] = useState(() => ({
    '3 Seater': true,
    '2 Seater': true,
    'Single Seater': true,
  }));
  const [setComponentQtyMap, setSetComponentQtyMap] = useState({});
  const [setPhotoUri, setSetPhotoUri] = useState('');

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
      Alert.alert('Stock update failed', e?.message || 'Could not update Floor 2 stock.');
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

  const pickLocalPhotoUri = async (onPicked) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo permission', 'Photo library permission is required to select an image.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      onPicked(picked.assets[0].uri);
    } catch (e) {
      Alert.alert('Photo error', e?.message || 'Could not select photo.');
    }
  };

  const openCreateModal = (mode) => {
    if (createBusy) return;
    if (mode === 'prod') {
      setProdNameInput('');
      setProdQtyInput('');
      setProdPhotoUri('');
    } else if (mode === 'set') {
      setSetBaseNameInput('');
      setSetSelectedPresets({
        '3 Seater': true,
        '2 Seater': true,
        'Single Seater': true,
      });
      setSetComponentQtyMap({});
      setSetPhotoUri('');
    }
    setCreateMode(mode);
  };

  const closeCreateModal = () => {
    if (createBusy) return;
    setCreateMode('');
  };

  const handleSubmitCreateProd = async () => {
    const name = String(prodNameInput || '').trim();
    if (!name) {
      Alert.alert('Product name required', 'Enter the product name.');
      return;
    }
    const qty = prodQtyInput.trim() === '' ? 0 : Math.max(0, Math.floor(Number(prodQtyInput) || 0));
    setCreateBusy(true);
    try {
      let imageBase64 = '';
      if (prodPhotoUri) {
        imageBase64 = await prepareCatalogPhotoForUpload({ uri: prodPhotoUri });
      }
      await warehouseMobileRequest('catalog-floor2-create-product', {
        name,
        quantity: qty,
        image_base64: imageBase64 || undefined,
      });
      setCreateMode('');
      await loadProducts();
    } catch (e) {
      Alert.alert('Create product failed', e?.message || 'Could not create product on Floor 2.');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSubmitCreateSet = async () => {
    const baseName = String(setBaseNameInput || '').trim();
    if (!baseName) {
      Alert.alert('Family base name required', 'Enter the family base name (e.g. Aria, Monic).');
      return;
    }
    const activePresets = SET_COMPONENT_PRESETS.filter((p) => setSelectedPresets[p]);
    if (!activePresets.length) {
      Alert.alert('Select components', 'Select at least one component for this set.');
      return;
    }
    const components = activePresets.map((preset) => {
      const raw = String(setComponentQtyMap[preset] ?? '').trim();
      const quantity = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
      return { preset, quantity };
    });

    setCreateBusy(true);
    try {
      let imageBase64 = '';
      if (setPhotoUri) {
        imageBase64 = await prepareCatalogPhotoForUpload({ uri: setPhotoUri });
      }
      await warehouseMobileRequest('catalog-floor2-create-set', {
        base_name: baseName,
        components,
        image_base64: imageBase64 || undefined,
      });
      setCreateMode('');
      await loadProducts();
    } catch (e) {
      Alert.alert('Create set failed', e?.message || 'Could not create set on Floor 2.');
    } finally {
      setCreateBusy(false);
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
      <View style={styles.topToolbar}>
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
        {canCreateFloor2 ? (
          <View style={styles.createBtnRow}>
            <Pressable
              style={({ pressed }) => [styles.plusCreateBtn, pressed && styles.plusCreateBtnPressed]}
              onPress={() => openCreateModal('prod')}
              accessibilityRole="button"
              accessibilityLabel="Create product on Floor 2"
            >
              <Text style={styles.plusCreateBtnText}>+ Prod</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.plusCreateBtn,
                styles.plusCreateBtnSet,
                pressed && styles.plusCreateBtnPressed,
              ]}
              onPress={() => openCreateModal('set')}
              accessibilityRole="button"
              accessibilityLabel="Create set on Floor 2"
            >
              <Text style={styles.plusCreateBtnText}>+ Set</Text>
            </Pressable>
          </View>
        ) : null}
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
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={styles.emptyText}>
              {hasSearch ? 'No matching Floor 2 products.' : 'No Floor 2 products found.'}
            </Text>
          ) : null
        }
      />

      {/* Variant / Stock Inlay Modal */}
      <Modal visible={Boolean(inlayGroup)} transparent animationType="fade" onRequestClose={closeInlay}>
        <Pressable style={styles.modalBackdrop} onPress={closeInlay}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{inlayGroup?.displayName || 'Floor 2 Product'}</Text>
            <Text style={styles.modalSub}>
              {canIncreaseStock && canUploadPhoto
                ? 'Tap thumbnail to import photo · use − / + to decrease or add Floor 2 stock.'
                : canIncreaseStock
                  ? 'Use − / + to decrease or add Floor 2 stock.'
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
                        <Pressable
                          style={[styles.stepBtn, styles.stepBtnMinus, (isStockBusy || qty <= 0) && styles.btnDisabled]}
                          disabled={Boolean(busyId || photoBusyId || qty <= 0)}
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
                          disabled={Boolean(busyId || photoBusyId)}
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
              disabled={Boolean(busyId || photoBusyId)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Product (+ Prod) / Create Set (+ Set) Modal */}
      <Modal visible={Boolean(createMode)} transparent animationType="fade" onRequestClose={closeCreateModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeCreateModal}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            {createMode === 'prod' ? (
              <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Create Floor 2 Product (+ Prod)</Text>
                <Text style={styles.modalSub}>
                  Creates a standalone product on Floor 2. Its photo is used directly as the card cover image.
                </Text>

                <Text style={styles.fieldLabel}>Product Name</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Dining Table, Buffet, Coffee Table…"
                  placeholderTextColor={theme.textMuted}
                  value={prodNameInput}
                  onChangeText={setProdNameInput}
                  editable={!createBusy}
                />

                <Text style={styles.fieldLabel}>Opening Qty (optional)</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="number-pad"
                  placeholder=""
                  placeholderTextColor={theme.textMuted}
                  value={prodQtyInput}
                  onChangeText={(txt) => setProdQtyInput(txt.replace(/[^0-9]/g, ''))}
                  editable={!createBusy}
                />

                {canUploadPhoto ? (
                  <View style={styles.photoPickerRow}>
                    <Pressable
                      style={styles.photoPickBtn}
                      disabled={createBusy}
                      onPress={() => pickLocalPhotoUri(setProdPhotoUri)}
                    >
                      <MaterialCommunityIcons name="image-plus-outline" size={20} color={theme.primary} />
                      <Text style={styles.photoPickBtnText}>
                        {prodPhotoUri ? 'Change Product Photo' : 'Import Product Photo'}
                      </Text>
                    </Pressable>
                    {prodPhotoUri ? (
                      <Image source={{ uri: prodPhotoUri }} style={styles.photoPreviewThumb} />
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.modalFooterBtns}>
                  <Pressable
                    style={[styles.closeBtn, { flex: 1, marginTop: 0 }]}
                    disabled={createBusy}
                    onPress={closeCreateModal}
                  >
                    <Text style={styles.closeBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primarySaveBtn, { flex: 1 }, createBusy && styles.btnDisabled]}
                    disabled={createBusy}
                    onPress={handleSubmitCreateProd}
                  >
                    <Text style={styles.primarySaveBtnText}>
                      {createBusy ? 'Saving…' : 'Create Product'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : createMode === 'set' ? (
              <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Create Floor 2 Set (+ Set)</Text>
                <Text style={styles.modalSub}>
                  Creates a family base item and its components (e.g. 3 Seater, 2 Seater, Single Seater). The 3 Seater photo is used as the family cover image.
                </Text>

                <Text style={styles.fieldLabel}>Family Base Name</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Aria, Monic, Berlin…"
                  placeholderTextColor={theme.textMuted}
                  value={setBaseNameInput}
                  onChangeText={setSetBaseNameInput}
                  editable={!createBusy}
                />

                {canUploadPhoto ? (
                  <View style={styles.photoPickerRow}>
                    <Pressable
                      style={styles.photoPickBtn}
                      disabled={createBusy}
                      onPress={() => pickLocalPhotoUri(setSetPhotoUri)}
                    >
                      <MaterialCommunityIcons name="image-plus-outline" size={20} color={theme.primary} />
                      <Text style={styles.photoPickBtnText}>
                        {setPhotoUri ? 'Change 3 Seater / Family Photo' : 'Import 3 Seater / Family Photo'}
                      </Text>
                    </Pressable>
                    {setPhotoUri ? (
                      <Image source={{ uri: setPhotoUri }} style={styles.photoPreviewThumb} />
                    ) : null}
                  </View>
                ) : null}

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Select Components &amp; Opening Qty</Text>
                <View style={styles.presetList}>
                  {SET_COMPONENT_PRESETS.map((preset) => {
                    const selected = Boolean(setSelectedPresets[preset]);
                    const compPreviewName = setBaseNameInput.trim()
                      ? `${setBaseNameInput.trim()} ${preset}`
                      : preset;
                    return (
                      <View key={preset} style={[styles.presetRow, selected && styles.presetRowSelected]}>
                        <Pressable
                          style={styles.presetCheckArea}
                          disabled={createBusy}
                          onPress={() =>
                            setSetSelectedPresets((prev) => ({ ...prev, [preset]: !prev[preset] }))
                          }
                        >
                          <MaterialCommunityIcons
                            name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                            size={22}
                            color={selected ? theme.primary : theme.textMuted}
                          />
                          <Text style={styles.presetRowLabel} numberOfLines={1}>
                            {compPreviewName}
                          </Text>
                        </Pressable>
                        {selected ? (
                          <TextInput
                            style={styles.presetQtyInput}
                            keyboardType="number-pad"
                            placeholder=""
                            placeholderTextColor={theme.textMuted}
                            value={String(setComponentQtyMap[preset] ?? '')}
                            onChangeText={(txt) =>
                              setSetComponentQtyMap((prev) => ({
                                ...prev,
                                [preset]: txt.replace(/[^0-9]/g, ''),
                              }))
                            }
                            editable={!createBusy}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                <View style={styles.modalFooterBtns}>
                  <Pressable
                    style={[styles.closeBtn, { flex: 1, marginTop: 0 }]}
                    disabled={createBusy}
                    onPress={closeCreateModal}
                  >
                    <Text style={styles.closeBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primarySaveBtn, { flex: 1 }, createBusy && styles.btnDisabled]}
                    disabled={createBusy}
                    onPress={handleSubmitCreateSet}
                  >
                    <Text style={styles.primarySaveBtnText}>
                      {createBusy ? 'Saving…' : 'Create Set'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
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
  searchInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  createBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  plusCreateBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusCreateBtnSet: {
    backgroundColor: '#7c3aed',
  },
  plusCreateBtnPressed: {
    opacity: 0.85,
  },
  plusCreateBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
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
