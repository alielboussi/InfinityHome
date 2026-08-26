import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProductCard from '../components/ProductCard';
import {
  fetchCatalogProducts,
  filterCatalogProducts,
  findProductBySku,
} from '../services/catalog';
import {
  countMissingDisplayableImages,
  probeCatalogImageStatuses,
} from '../services/imageProbe';
import { theme } from '../theme';

export default function CatalogScreen({ navigation, route }) {
  const locationId = route.params?.locationId;
  const locationName = route.params?.locationName || 'Location';
  const initialSearch = route.params?.initialSearch || '';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [imageStatusById, setImageStatusById] = useState({});
  const [probingImages, setProbingImages] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const rows = await fetchCatalogProducts(locationId);
      setProducts(rows);
    } catch (err) {
      setError(err?.message || 'Failed to load products.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!products.length) {
      setImageStatusById({});
      setProbingImages(false);
      return undefined;
    }

    let cancelled = false;
    const initial = {};
    products.forEach((product) => {
      initial[product.id] = product.imageUrl ? 'checking' : 'none';
    });
    setImageStatusById(initial);
    setProbingImages(true);

    probeCatalogImageStatuses(products, (productId, status) => {
      if (cancelled) return;
      setImageStatusById((prev) => ({ ...prev, [productId]: status }));
    }).finally(() => {
      if (!cancelled) setProbingImages(false);
    });

    return () => { cancelled = true; };
  }, [products]);

  const displayRows = useMemo(
    () => filterCatalogProducts(products, search, { missingImageOnly, imageStatusById }),
    [products, search, missingImageOnly, imageStatusById],
  );

  const missingImageCount = useMemo(
    () => countMissingDisplayableImages(products, imageStatusById),
    [products, imageStatusById],
  );

  const markImageBroken = (productId) => {
    setImageStatusById((prev) => ({ ...prev, [productId]: 'broken' }));
  };

  const openProduct = (product) => {
    navigation.navigate('ProductEdit', {
      productId: product.id,
      locationId,
      locationName,
    });
  };

  const onScan = () => {
    navigation.navigate('Scan', { locationId, locationName });
  };

  const onSearchSubmit = async () => {
    const q = search.trim();
    if (!q) return;
    const bySku = await findProductBySku(q, locationId);
    if (bySku) {
      openProduct(bySku);
      return;
    }
    if (displayRows.length === 1) {
      openProduct(displayRows[0]);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Dashboard</Text>
        </Pressable>
        <Text style={styles.title}>Products</Text>
        <Text style={styles.subtitle}>
          {locationName}
          {missingImageOnly ? ` · ${displayRows.length} without image` : ''}
          {!missingImageOnly && missingImageCount > 0 ? ` · ${missingImageCount} missing photos` : ''}
        </Text>
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
        <Pressable style={styles.scanButton} onPress={onScan}>
          <Text style={styles.scanButtonText}>Scan QR</Text>
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
      </View>

      {loading ? (
        <ActivityIndicator style={styles.centered} size="large" color={theme.border} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={displayRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load({ silent: true });
              }}
              tintColor={theme.border}
            />
          )}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              imageStatus={imageStatusById[item.id]}
              onImageBroken={() => markImageBroken(item.id)}
              onPress={() => openProduct(item)}
            />
          )}
          ListEmptyComponent={(
            <Text style={styles.empty}>
              {missingImageOnly
                ? (probingImages
                  ? 'Checking product photos…'
                  : 'All products have working images — nothing left to upload.')
                : 'No products match your search.'}
            </Text>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  back: { color: theme.border, fontWeight: '700', marginBottom: 8 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: theme.muted, marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
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
  scanButton: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  scanButtonText: { color: theme.border, fontWeight: '800' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
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
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  centered: { marginTop: 40 },
  error: { color: theme.danger, padding: 16 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
});
