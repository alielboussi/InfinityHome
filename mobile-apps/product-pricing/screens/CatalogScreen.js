import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOutFirebase } from '../../shared/firebase';
import ProductCard from '../components/ProductCard';
import ProductNameEditModal from '../components/ProductNameEditModal';
import VisualSearchResultsModal from '../components/VisualSearchResultsModal';
import {
  fetchCatalogProducts,
  catalogItemKey,
  filterCatalogProducts,
  findProductBySku,
  updateCatalogItemName,
} from '../services/catalog';
import {
  countMissingDisplayableImages,
  probeCatalogImageStatuses,
} from '../services/imageProbe';
import { fetchEmbeddingStatus, runEmbeddingBackfillLoop, searchProductsByPhoto } from '../services/visualSearch';
import { theme } from '../theme';
import { uriToBase64 } from '../utils/imageBase64';
import { promptVisualSearchPhoto } from '../utils/productImagePicker';

const NUM_COLUMNS = 2;
const H_PADDING = 16;
const GRID_GAP = 10;

function getCardWidth() {
  const { width } = Dimensions.get('window');
  return (width - H_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
}

const INITIAL_EMBEDDING_NOTE = 'Indexing photos · checking…';

function formatEmbeddingNote(result) {
  const methodLabel = result?.searchMethod === 'gemini' ? 'AI' : 'basic';
  if (Number(result?.remaining) > 0) {
    return `Indexing photos (${methodLabel}) · ${result.remaining} left`;
  }
  if (Number(result?.totalWithImages) > 0) {
    return `Photo search ready — ${result.totalWithImages} indexed (${methodLabel})`;
  }
  return `Indexing photos (${methodLabel}) · checking…`;
}

export default function CatalogScreen({ navigation, route, userEmail }) {
  const initialSearch = route.params?.initialSearch || '';
  const cardWidth = useMemo(() => getCardWidth(), []);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [imageStatusById, setImageStatusById] = useState({});
  const [probingImages, setProbingImages] = useState(false);
  const [nameEditProduct, setNameEditProduct] = useState(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameEditError, setNameEditError] = useState('');
  const [visualMatches, setVisualMatches] = useState([]);
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualError, setVisualError] = useState('');
  const [visualSearchNote, setVisualSearchNote] = useState('');
  const [visualModalOpen, setVisualModalOpen] = useState(false);
  const [embeddingNote, setEmbeddingNote] = useState(INITIAL_EMBEDDING_NOTE);
  const probeCancelRef = useRef(false);
  const backfillActiveRef = useRef(false);

  const startEmbeddingIndex = useCallback(async () => {
    if (backfillActiveRef.current) return;
    backfillActiveRef.current = true;
    setEmbeddingNote(INITIAL_EMBEDDING_NOTE);

    try {
      const status = await fetchEmbeddingStatus().catch(() => null);
      if (status) {
        setEmbeddingNote(formatEmbeddingNote(status));
      }

      const summary = await runEmbeddingBackfillLoop({
        limit: 50,
        onProgress: (result) => {
          setEmbeddingNote(formatEmbeddingNote(result));
        },
      });

      if (summary.remaining > 0) {
        setEmbeddingNote(`Photo search partial — ${summary.remaining} photos still need indexing`);
      }
    } catch {
      setEmbeddingNote('Photo search will work after the portal API is deployed.');
    } finally {
      backfillActiveRef.current = false;
    }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const rows = await fetchCatalogProducts();
      setProducts(rows);

      const prefetchUrls = rows
        .map((row) => String(row.imageUrl || '').trim())
        .filter(Boolean)
        .slice(0, 40);
      if (prefetchUrls.length) {
        Image.prefetch(prefetchUrls).catch(() => {});
      }
    } catch (err) {
      setError(err?.message || 'Failed to load products.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    startEmbeddingIndex();
  }, [startEmbeddingIndex]);

  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!products.length) {
      setImageStatusById({});
      setProbingImages(false);
      return undefined;
    }

    probeCancelRef.current = false;
    const initial = {};
    products.forEach((product) => {
      initial[catalogItemKey(product)] = product.imageUrl ? 'checking' : 'none';
    });
    setImageStatusById(initial);

    const timer = setTimeout(() => {
      setProbingImages(true);
      probeCatalogImageStatuses(products, (productId, status) => {
        if (probeCancelRef.current) return;
        const row = products.find((item) => String(item.id) === String(productId));
        if (!row) return;
        setImageStatusById((prev) => ({ ...prev, [catalogItemKey(row)]: status }));
      }).finally(() => {
        if (!probeCancelRef.current) setProbingImages(false);
      });
    }, 400);

    return () => {
      probeCancelRef.current = true;
      clearTimeout(timer);
    };
  }, [products]);

  const displayRows = useMemo(
    () => filterCatalogProducts(products, search, { missingImageOnly, imageStatusById }),
    [products, search, missingImageOnly, imageStatusById],
  );

  const missingImageCount = useMemo(
    () => countMissingDisplayableImages(products, imageStatusById, catalogItemKey),
    [products, imageStatusById],
  );

  const markImageBroken = (item) => {
    setImageStatusById((prev) => ({ ...prev, [catalogItemKey(item)]: 'broken' }));
  };

  const openProduct = (product, options = {}) => {
    navigation.navigate('ProductEdit', {
      productId: product.id,
      isCombo: Boolean(product.__isCombo),
      ...options,
    });
  };

  const openSetEditor = (item) => {
    navigation.navigate('SetEdit', { comboId: item.id });
  };

  const onScan = () => {
    navigation.navigate('Scan');
  };

  const runVisualSearch = async (uri) => {
    setVisualError('');
    setVisualSearchNote('');
    setVisualMatches([]);
    setVisualModalOpen(true);
    setVisualLoading(true);
    try {
      const imageBase64 = await uriToBase64(uri);
      const textHint = search.trim();
      const result = await searchProductsByPhoto(imageBase64, { textHint });
      if (result.indexingIncomplete) {
        setVisualSearchNote('Catalog still indexing — results improve as more photos are processed.');
      } else if (textHint) {
        setVisualSearchNote(`Using search hint “${textHint}” with your photo.`);
      }
      setVisualMatches((result.matches || []).map((row) => ({
        ...row,
        id: row.entityId,
        name: row.name,
        __isCombo: row.entityType === 'combo' || row.__isCombo,
      })));
    } catch (err) {
      setVisualError(err?.message || 'Photo search failed.');
    } finally {
      setVisualLoading(false);
    }
  };

  const onVisualSearch = () => {
    promptVisualSearchPhoto({
      onPicked: (uri) => runVisualSearch(uri),
    });
  };

  const onSearchSubmit = async () => {
    const q = search.trim();
    if (!q) return;
    const bySku = await findProductBySku(q);
    if (bySku) {
      openProduct(bySku);
      return;
    }
    if (displayRows.length === 1) {
      openProduct(displayRows[0]);
    }
  };

  const onLogout = () => {
    Alert.alert('Log out', 'Sign out of Product Photos?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => signOutFirebase().catch(() => {}),
      },
    ]);
  };

  const handleNameLongPress = (item) => {
    const buttons = [
      {
        text: 'Edit name',
        onPress: () => {
          setNameEditError('');
          setNameEditProduct(item);
        },
      },
    ];
    if (item.__isCombo) {
      buttons.unshift({
        text: 'Edit set components',
        onPress: () => openSetEditor(item),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(item.name || 'Item', 'Choose an action', buttons);
  };

  const handleSaveItemName = async (draftName) => {
    if (!nameEditProduct) return;
    const trimmed = String(draftName || '').trim();
    if (!trimmed) {
      setNameEditError('Name cannot be empty.');
      return;
    }
    if (trimmed === String(nameEditProduct.name || '').trim()) {
      setNameEditProduct(null);
      return;
    }

    setNameSaving(true);
    setNameEditError('');
    try {
      const savedName = await updateCatalogItemName(nameEditProduct, trimmed);
      setProducts((prev) => prev.map((row) => (
        catalogItemKey(row) === catalogItemKey(nameEditProduct)
          ? {
            ...row,
            name: savedName,
            ...(row.__isCombo ? { combo_name: savedName } : {}),
          }
          : row
      )));
      setNameEditProduct(null);
      Alert.alert('Saved', `${nameEditProduct.__isCombo ? 'Set' : 'Product'} name updated on the portal.`);
    } catch (err) {
      setNameEditError(err?.message || 'Failed to save name.');
    } finally {
      setNameSaving(false);
    }
  };

  const handleVisualSelect = (match) => {
    const item = products.find((row) => (
      String(row.id) === String(match.entityId || match.id)
      && Boolean(row.__isCombo) === Boolean(match.__isCombo || match.entityType === 'combo')
    ));
    setVisualModalOpen(false);
    if (item) openProduct(item);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.eyebrow}>Infinity Home</Text>
            <Text style={styles.title}>Product Photos</Text>
          </View>
          <Pressable onPress={onLogout}>
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {userEmail || 'Portal user'}
          {missingImageOnly ? ` · ${displayRows.length} without image` : ''}
          {!missingImageOnly && missingImageCount > 0 ? ` · ${missingImageCount} missing photos` : ''}
        </Text>
        {embeddingNote ? <Text style={styles.embeddingNote}>{embeddingNote}</Text> : null}
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Search name, SKU, amount…"
          placeholderTextColor={theme.muted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearchSubmit}
          returnKeyType="search"
        />
        <Pressable style={styles.toolButton} onPress={onVisualSearch}>
          <Text style={styles.toolButtonText}>Photo</Text>
        </Pressable>
        <Pressable style={styles.toolButton} onPress={onScan}>
          <Text style={styles.toolButtonText}>QR</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, missingImageOnly && styles.filterChipActive]}
          onPress={() => setMissingImageOnly((value) => !value)}
        >
          <Text style={[styles.filterChipText, missingImageOnly && styles.filterChipTextActive]}>
            No image yet
            {missingImageCount > 0 ? ` (${missingImageCount})` : ''}
            {probingImages ? ' · checking…' : ''}
          </Text>
        </Pressable>
        <Text style={styles.nameHint}>Hold name to edit</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.centered} size="large" color={theme.border} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={displayRows}
          keyExtractor={catalogItemKey}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                startEmbeddingIndex();
                load({ silent: true });
              }}
              tintColor={theme.border}
            />
          )}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              cardWidth={cardWidth}
              imageStatus={imageStatusById[catalogItemKey(item)]}
              onImageBroken={() => markImageBroken(item)}
              onPress={() => openProduct(item)}
              onImageLongPress={(product) => openProduct(product, { promptImageReplace: true })}
              onNameLongPress={handleNameLongPress}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>
                {missingImageOnly
                  ? (probingImages
                    ? 'Checking product photos…'
                    : 'All products have working images — nothing left to upload.')
                  : 'No products match your search.'}
              </Text>
            </View>
          )}
        />
      )}

      <ProductNameEditModal
        visible={Boolean(nameEditProduct)}
        product={nameEditProduct}
        saving={nameSaving}
        error={nameEditError}
        onClose={() => {
          if (!nameSaving) setNameEditProduct(null);
        }}
        onSave={handleSaveItemName}
      />

      <VisualSearchResultsModal
        visible={visualModalOpen}
        matches={visualMatches}
        loading={visualLoading}
        error={visualError}
        note={visualSearchNote}
        onClose={() => setVisualModalOpen(false)}
        onSelect={handleVisualSelect}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: H_PADDING, paddingTop: 8, paddingBottom: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  eyebrow: { color: theme.muted, fontSize: 12, marginBottom: 4 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  logout: { color: theme.border, fontWeight: '700', marginTop: 4 },
  subtitle: { color: theme.muted, marginTop: 6, fontSize: 13 },
  embeddingNote: { color: theme.accent, marginTop: 4, fontSize: 11 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: H_PADDING, marginBottom: 8 },
  search: {
    flex: 1,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
  },
  toolButton: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  toolButtonText: { color: theme.border, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: H_PADDING,
    marginBottom: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.surfaceAlt,
  },
  filterChipActive: {
    borderColor: theme.border,
    backgroundColor: 'rgba(30, 215, 168, 0.12)',
  },
  filterChipText: { color: theme.muted, fontWeight: '700', fontSize: 13 },
  filterChipTextActive: { color: theme.border },
  nameHint: { color: theme.muted, fontSize: 11, flexShrink: 1, textAlign: 'right' },
  list: { paddingHorizontal: H_PADDING, paddingBottom: 24 },
  column: { gap: GRID_GAP, marginBottom: GRID_GAP, alignItems: 'flex-start' },
  centered: { marginTop: 40 },
  error: { color: theme.danger, padding: 16 },
  emptyWrap: { width: '100%', alignItems: 'center' },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
});
