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
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSharedMobileAccessGrant, useSharedMobileAccessUserEmail } from '../shared/MobileAccessGrantContext';
import {
  isCatalogLocationPhotoUploadAllowed,
  isCatalogLocationStockIncreaseAllowed,
  isWarehouseCatalogLabelPrintAllowed,
  isWarehouseFloor2CreateProductAllowed,
  isWarehouseProductStockQtyEditAllowed,
} from '../shared/mobileAccessManifest';
import CatalogLabelPrintModal, { CatalogLabelPrintIconButton } from '../shared/CatalogLabelPrintModal';
import { prepareCatalogPhotoForUpload } from '../shared/prepareCatalogPhotoUpload';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { assemblyDimsDraftFromItem, formatAssemblyDimensions } from '../shared/warehouseAssemblySpecs';
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

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty ?? item?.quantity) || 0));
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
        totalFloor2: floor2Qty(item),
        imageUrl: productCardImageUrl(item),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const Floor2GroupListRow = memo(function Floor2GroupListRow({
  group, busyId, photoBusyId, onOpen, canPrintLabel, onPrintLabel,
}) {
  const product = group.items?.[0];
  const cardImage = group.imageUrl || productCardImageUrl(product);
  const cardBusy = group.items.some(
    (row) => busyId === String(row.assembly_id || row.id) || photoBusyId === String(row.assembly_id || row.id),
  );
  const sku = String(product?.family_sku || '').trim();
  return (
    <View style={styles.listRowWrap}>
      <Pressable
        style={({ pressed }) => [
          productRowPressable.row,
          pressed && productRowPressable.rowPressed,
          cardBusy && productRowPressable.rowBusy,
        ]}
        disabled={Boolean(busyId || photoBusyId)}
        onPress={() => onOpen(group)}
      >
        <ProductionProductListRow
          imageUrl={cardImage || undefined}
          name={group.displayName}
          sku={sku}
          subtitle={`On hand: ${group.totalFloor2}`}
          busy={cardBusy}
        />
      </Pressable>
      {canPrintLabel && sku ? (
        <View style={styles.printFab}>
          <CatalogLabelPrintIconButton
            onPress={() => onPrintLabel(group)}
            disabled={Boolean(busyId || photoBusyId)}
          />
        </View>
      ) : null}
    </View>
  );
});

export default function WarehouseFloor2Screen() {
  const grant = useSharedMobileAccessGrant();
  const userEmail = useSharedMobileAccessUserEmail();
  const canIncreaseStock = isCatalogLocationStockIncreaseAllowed(grant, 'warehouse_floor_2', userEmail);
  const canUploadPhoto = isCatalogLocationPhotoUploadAllowed(grant, 'warehouse_floor_2', userEmail);
  const canCreateFloor2Prod = isWarehouseFloor2CreateProductAllowed(grant, userEmail);
  const canPrintLabel = isWarehouseCatalogLabelPrintAllowed(grant, userEmail);
  const canEditDims = isWarehouseProductStockQtyEditAllowed(grant);

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
  const [dimsDraftById, setDimsDraftById] = useState({});
  const [dimBusyId, setDimBusyId] = useState('');
  const [labelPrintItem, setLabelPrintItem] = useState(null);

  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [prodNameInput, setProdNameInput] = useState('');
  const [prodQtyInput, setProdQtyInput] = useState('');
  const [prodPhotoUri, setProdPhotoUri] = useState('');

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
    if (busyId || photoBusyId || !group?.items?.length) return;
    setInlayGroupKey(group.key);
  }, [busyId, photoBusyId]);

  const closeInlay = useCallback(() => {
    if (busyId || photoBusyId) return;
    setInlayGroupKey('');
  }, [busyId, photoBusyId]);

  const openLabelPrint = useCallback((group) => {
    const product = group?.items?.[0];
    const labelName = String(group?.displayName || product?.name || '').trim();
    const labelSku = String(product?.family_sku || '').trim();
    if (!labelName || !labelSku) return;
    const dimensionsDisplay = formatAssemblyDimensions(product);
    setLabelPrintItem({
      name: labelName,
      sku: labelSku,
      defaultCopies: Math.max(1, floor2Qty(product)),
      dimLength: product?.dim_length,
      dimWidth: product?.dim_width,
      dimHeight: product?.dim_height,
      dimensionsDisplay,
    });
  }, []);

  const handleSaveQty = async (item) => {
    if (!canIncreaseStock || busyId) return;
    const aid = String(item.assembly_id || item.id || '').trim();
    if (!aid) return;
    const rawDraft = String(qtyDraftById[aid] ?? '').trim();
    if (rawDraft === '') {
      Alert.alert('Enter quantity', 'Type the on-hand quantity you want to save.');
      return;
    }
    const target = Math.floor(Number(rawDraft) || 0);
    if (!Number.isFinite(target) || target < 0) {
      Alert.alert('Invalid quantity', 'Enter a whole number of 0 or more.');
      return;
    }
    const current = floor2Qty(item);
    const delta = target - current;
    if (delta === 0) {
      setQtyDraftById((prev) => {
        const next = { ...prev };
        delete next[aid];
        return next;
      });
      return;
    }
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

  const handleSaveDimensions = async (item) => {
    if (!canEditDims || dimBusyId) return;
    const aid = String(item.assembly_id || item.id || '').trim();
    if (!aid) return;
    const draft = dimsDraftById[aid] || assemblyDimsDraftFromItem(item);
    setDimBusyId(aid);
    try {
      const res = await warehouseMobileRequest('catalog-floor2-update-dimensions', {
        assembly_id: aid,
        dim_length: draft.dim_length === '' ? null : draft.dim_length,
        dim_width: draft.dim_width === '' ? null : draft.dim_width,
        dim_height: draft.dim_height === '' ? null : draft.dim_height,
      });
      const patch = {
        dim_length: res?.dim_length ?? null,
        dim_width: res?.dim_width ?? null,
        dim_height: res?.dim_height ?? null,
      };
      setProducts((prev) =>
        prev.map((row) => {
          const rid = String(row.assembly_id || row.id || '');
          return rid === aid ? { ...row, ...patch } : row;
        }),
      );
      setDimsDraftById((prev) => {
        const next = { ...prev };
        delete next[aid];
        return next;
      });
    } catch (e) {
      Alert.alert('Dimensions not saved', e?.message || 'Could not save dimensions.');
    } finally {
      setDimBusyId('');
    }
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

  const removeFloor2Photo = async (assemblyId) => {
    if (!canUploadPhoto || busyId || photoBusyId) return;
    const aid = String(assemblyId || '').trim();
    if (!aid) return;
    setPhotoBusyId(aid);
    try {
      await warehouseMobileRequest('catalog-floor2-photo-remove', { assembly_id: aid });
      setProducts((prev) =>
        prev.map((row) => {
          const rid = String(row.assembly_id || row.id || '');
            return rid === aid ? { ...row, floor2_image_url: '' } : row;
        }),
      );
      await loadProducts();
    } catch (e) {
      Alert.alert('Remove photo failed', e?.message || 'Could not remove Floor 2 image.');
    } finally {
      setPhotoBusyId('');
    }
  };

  const confirmRemovePhoto = (assemblyId, displayName) => {
    if (!canUploadPhoto || busyId || photoBusyId) return;
    Alert.alert(
      'Remove WIP photo',
      `Remove the Floor 2 photo for ${displayName || 'this product'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeFloor2Photo(assemblyId) },
      ],
    );
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
            return rid === aid ? { ...row, floor2_image_url: nextUrl } : row;
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
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      onPicked(picked.assets[0].uri);
    } catch (e) {
      Alert.alert('Photo error', e?.message || 'Could not select photo.');
    }
  };

  const openCreateProduct = () => {
    if (createBusy) return;
    setProdNameInput('');
    setProdQtyInput('');
    setProdPhotoUri('');
    setCreateProductOpen(true);
  };

  const closeCreateProduct = () => {
    if (createBusy) return;
    setCreateProductOpen(false);
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
      setCreateProductOpen(false);
      await loadProducts();
    } catch (e) {
      Alert.alert('Create product failed', e?.message || 'Could not create product on Floor 2.');
    } finally {
      setCreateBusy(false);
    }
  };

  const renderGroupCard = useCallback(
    ({ item: group }) => (
      <Floor2GroupListRow
        group={group}
        busyId={busyId}
        photoBusyId={photoBusyId}
        onOpen={openInlay}
        canPrintLabel={canPrintLabel}
        onPrintLabel={openLabelPrint}
      />
    ),
    [busyId, photoBusyId, openInlay, canPrintLabel, openLabelPrint],
  );

  const hasSearch = Boolean(String(search || '').trim());

  return (
    <View style={styles.root}>
      <View style={styles.topToolbar}>
        <View style={styles.searchRow}>
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
          {canCreateFloor2Prod ? (
            <Pressable
              style={({ pressed }) => [styles.plusFab, pressed && styles.plusCreateBtnPressed]}
              onPress={openCreateProduct}
              accessibilityRole="button"
              accessibilityLabel="Create Floor 2 product"
            >
              <Text style={styles.plusFabText}>+</Text>
            </Pressable>
          ) : null}
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
                ? 'Tap thumbnail to change photo · − / + step qty · Save sets on-hand · dims sync with web catalog.'
                : canIncreaseStock
                  ? 'Use − / + or Save to set Floor 2 on-hand qty.'
                  : canUploadPhoto
                    ? 'Tap thumbnail to change photo · X removes WIP photo.'
                    : 'View Floor 2 stock on hand.'}
            </Text>
            <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
              {(inlayGroup?.items || []).map((item) => {
                const id = String(item.assembly_id || item.id);
                const qty = floor2Qty(item);
                const rowImage = productCardImageUrl(item);
                const isPhotoBusy = photoBusyId === id;
                const isStockBusy = busyId === id;
                const draftVal = qtyDraftById[id] !== undefined ? String(qtyDraftById[id]) : '';
                const dimDraft = dimsDraftById[id] || assemblyDimsDraftFromItem(item);
                const dimDisplay = formatAssemblyDimensions(item);
                const isDimBusy = dimBusyId === id;
                const thumbContent = isPhotoBusy ? (
                  <View style={styles.inlayThumbPlaceholder}>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                ) : rowImage ? (
                  <Image source={{ uri: rowImage }} style={styles.inlayThumb} resizeMode="contain" />
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
                        <View style={styles.inlayThumbCol}>
                          <Pressable
                            onPress={() => pickAndUploadPhoto(id)}
                            disabled={Boolean(busyId || photoBusyId)}
                            hitSlop={8}
                            style={styles.inlayThumbBtn}
                          >
                            {thumbContent}
                          </Pressable>
                          {rowImage && !isPhotoBusy ? (
                            <Pressable
                              onPress={() => confirmRemovePhoto(id, item.raw_name || item.name)}
                              disabled={Boolean(busyId || photoBusyId)}
                              hitSlop={8}
                              style={styles.inlayRemovePhotoBtn}
                              accessibilityLabel="Remove Floor 2 WIP photo"
                            >
                              <MaterialCommunityIcons name="image-remove-outline" size={22} color={theme.danger} />
                            </Pressable>
                          ) : null}
                        </View>
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
                        {dimDisplay && !canEditDims ? (
                          <Text style={styles.inlayDims}>{dimDisplay}</Text>
                        ) : null}
                      </View>
                      <View style={styles.inlayQtyCol}>
                        {canPrintLabel && item.family_sku ? (
                          <CatalogLabelPrintIconButton
                            onPress={() => openLabelPrint({ displayName: item.raw_name || item.name, items: [item] })}
                            disabled={Boolean(busyId || photoBusyId || isStockBusy || isDimBusy)}
                          />
                        ) : null}
                        <Text style={styles.inlayQtyRight}>On hand: {qty}</Text>
                      </View>
                    </View>
                    {canEditDims ? (
                      <View style={styles.dimEditRow}>
                        <Text style={styles.dimLabel}>L</Text>
                        <TextInput
                          style={styles.dimInput}
                          keyboardType="decimal-pad"
                          value={dimDraft.dim_length}
                          editable={!isDimBusy}
                          placeholder="—"
                          placeholderTextColor={theme.textMuted}
                          onChangeText={(txt) =>
                            setDimsDraftById((prev) => ({
                              ...prev,
                              [id]: { ...dimDraft, dim_length: txt.replace(/[^0-9.]/g, '') },
                            }))
                          }
                        />
                        <Text style={styles.dimSep}>×</Text>
                        <Text style={styles.dimLabel}>W</Text>
                        <TextInput
                          style={styles.dimInput}
                          keyboardType="decimal-pad"
                          value={dimDraft.dim_width}
                          editable={!isDimBusy}
                          placeholder="—"
                          placeholderTextColor={theme.textMuted}
                          onChangeText={(txt) =>
                            setDimsDraftById((prev) => ({
                              ...prev,
                              [id]: { ...dimDraft, dim_width: txt.replace(/[^0-9.]/g, '') },
                            }))
                          }
                        />
                        <Text style={styles.dimSep}>×</Text>
                        <Text style={styles.dimLabel}>H</Text>
                        <TextInput
                          style={styles.dimInput}
                          keyboardType="decimal-pad"
                          value={dimDraft.dim_height}
                          editable={!isDimBusy}
                          placeholder="—"
                          placeholderTextColor={theme.textMuted}
                          onChangeText={(txt) =>
                            setDimsDraftById((prev) => ({
                              ...prev,
                              [id]: { ...dimDraft, dim_height: txt.replace(/[^0-9.]/g, '') },
                            }))
                          }
                        />
                        <Text style={styles.dimUnit}>cm</Text>
                        <Pressable
                          style={[styles.dimSaveBtn, isDimBusy && styles.btnDisabled]}
                          disabled={Boolean(isDimBusy || busyId || photoBusyId)}
                          onPress={() => handleSaveDimensions(item)}
                        >
                          <Text style={styles.dimSaveBtnText}>{isDimBusy ? '…' : 'Save'}</Text>
                        </Pressable>
                      </View>
                    ) : null}
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
                          placeholder={String(qty)}
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
                        <Pressable
                          style={[styles.qtySaveBtn, (isStockBusy || draftVal === '') && styles.btnDisabled]}
                          disabled={Boolean(busyId || photoBusyId || isStockBusy || draftVal === '')}
                          onPress={() => handleSaveQty(item)}
                        >
                          <Text style={styles.qtySaveBtnText}>{isStockBusy ? '…' : 'Save'}</Text>
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

      <Modal visible={createProductOpen} transparent animationType="fade" onRequestClose={closeCreateProduct}>
        <Pressable style={styles.modalBackdrop} onPress={closeCreateProduct}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={styles.inlayScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>New Floor 2 product</Text>
              <Text style={styles.modalSub}>
                Saves to Warehouse Floor 2. Opening qty blank = 0. WIP photo shows on this screen only (not Floor 1 catalog).
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

              <Text style={styles.fieldLabel}>Opening qty</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="number-pad"
                placeholder="0"
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
                      {prodPhotoUri ? 'Change WIP photo' : 'Import WIP photo'}
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
                  onPress={closeCreateProduct}
                >
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primarySaveBtn, { flex: 1 }, createBusy && styles.btnDisabled]}
                  disabled={createBusy}
                  onPress={handleSubmitCreateProd}
                >
                  <Text style={styles.primarySaveBtnText}>
                    {createBusy ? 'Saving…' : 'Create'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <CatalogLabelPrintModal
        visible={Boolean(labelPrintItem)}
        item={labelPrintItem}
        onClose={() => setLabelPrintItem(null)}
      />
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
  listRowWrap: {
    position: 'relative',
    width: '100%',
  },
  printFab: {
    position: 'absolute',
    right: 10,
    top: '50%',
    marginTop: -18,
    zIndex: 3,
  },
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
  inlayQtyCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  inlayQtyRight: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
  },
  inlayDims: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 4,
  },
  dimEditRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  dimLabel: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  dimSep: { fontSize: 14, color: theme.textMuted },
  dimUnit: { fontSize: 12, color: theme.textMuted, marginRight: 4 },
  dimInput: {
    width: 52,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 6,
    color: theme.text,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  dimSaveBtn: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 'auto',
  },
  dimSaveBtnText: {
    color: theme.text,
    fontWeight: '700',
    fontSize: 14,
  },
  stockActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  qtySaveBtn: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 42,
    justifyContent: 'center',
  },
  qtySaveBtnText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 15,
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
