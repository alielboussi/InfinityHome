import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchLusakaStockData, filterStockRows } from '../../shared/lusakaStock/fetchStock';
import { API_BASE, signOutFirebase } from '../../shared/firebase';
import StockCard, { ImageLightbox } from '../components/StockCard';
import {
  cacheRowImages,
  hydrateRowsWithCachedImages,
  loadStockCache,
  saveStockCache,
} from '../services/stockCache';

const STOCK_SYNC_MS = 60_000;

function applyStockPayload(setters, data) {
  setters.setLocationName(data.locationName);
  setters.setRows(data.rows);
  setters.setLastSyncedAt(data.syncedAt);
}

export default function StockScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [locationName, setLocationName] = useState('Lusaka');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [usingCache, setUsingCache] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const warmImageCache = useCallback(async (nextRows, meta) => {
    const hydrated = await hydrateRowsWithCachedImages(nextRows);
    setRows(hydrated);
    const cachedRows = await cacheRowImages(hydrated);
    await saveStockCache({
      locationName: meta.locationName,
      rows: cachedRows,
      syncedAt: meta.syncedAt,
    });
    setRows(cachedRows);
  }, []);

  const load = useCallback(async ({ initial = false, silent = false } = {}) => {
    if (initial && !silent) {
      setLoading(true);
      setError('');
    } else if (!silent) {
      setRefreshing(true);
    } else {
      setSyncing(true);
    }

    try {
      const data = await fetchLusakaStockData(API_BASE);
      const hydrated = await hydrateRowsWithCachedImages(data.rows);
      applyStockPayload(
        { setLocationName, setRows, setLastSyncedAt },
        { ...data, rows: hydrated },
      );
      setUsingCache(false);
      setError('');
      await saveStockCache({ locationName: data.locationName, rows: hydrated, syncedAt: data.syncedAt });
      void warmImageCache(hydrated, { locationName: data.locationName, syncedAt: data.syncedAt });
    } catch (err) {
      setRows((current) => {
        if (initial && !current.length) {
          setError(err?.message || 'Failed to load Lusaka stock.');
        }
        return current;
      });
    } finally {
      if (initial && !silent) setLoading(false);
      setRefreshing(false);
      setSyncing(false);
    }
  }, [warmImageCache]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const cached = await loadStockCache();
      if (!alive) return;
      if (cached) {
        applyStockPayload(
          { setLocationName, setRows, setLastSyncedAt },
          cached,
        );
        setUsingCache(true);
        setLoading(false);
      }
      await load({ initial: !cached, silent: Boolean(cached) });
    })();

    const timer = setInterval(() => load({ initial: false, silent: true }), STOCK_SYNC_MS);
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') load({ initial: false, silent: true });
    });
    return () => {
      alive = false;
      clearInterval(timer);
      appStateSub.remove();
    };
  }, [load]);

  const displayRows = useMemo(() => filterStockRows(rows, search), [rows, search]);
  const filteredTotalQty = useMemo(
    () => displayRows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    [displayRows],
  );

  const onLogout = () => {
    Alert.alert('Log out', 'Sign out of Lusaka Stock?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOutFirebase();
          } catch (err) {
            Alert.alert('Error', err?.message || 'Could not sign out.');
          }
        },
      },
    ]);
  };

  const syncLabel = syncing
    ? 'syncing…'
    : lastSyncedAt
      ? `${usingCache ? 'cached · ' : ''}updated ${lastSyncedAt.toLocaleTimeString()}`
      : (usingCache ? 'showing cached stock' : '');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>{locationName} Stock</Text>
            <Text style={styles.subtitle}>
              Products and sets at Lusaka
              {syncLabel ? ` · ${syncLabel}` : ''}
            </Text>
            <View style={styles.statsRow}>
              <Text style={styles.stat}>{displayRows.length} items</Text>
              <Text style={styles.stat}>{filteredTotalQty} total qty</Text>
            </View>
          </View>
        </View>
        <TextInput
          style={styles.search}
          placeholder="Search name, SKU, standard or promo price…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Loading stock…</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={displayRows}
          keyExtractor={(item) => item.key}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={9}
          removeClippedSubviews
          refreshControl={(
            <RefreshControl refreshing={refreshing} onRefresh={() => load({ initial: false })} />
          )}
          ListEmptyComponent={(
            <Text style={styles.empty}>
              No in-stock products or sets at {locationName}.
            </Text>
          )}
          renderItem={({ item }) => (
            <StockCard row={item} onPressImage={setExpandedImage} />
          )}
        />
      )}

      <ImageLightbox uri={expandedImage} onClose={() => setExpandedImage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#0f172a',
  },
  headerTop: {
    position: 'relative',
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 108,
  },
  headerCenter: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 84,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  logoutBtn: {
    position: 'absolute',
    top: 20,
    right: 0,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 2,
  },
  logoutText: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 2,
  },
  stat: {
    color: '#e2e8f0',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
  },
  search: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 8,
  },
  error: {
    color: '#b91c1c',
    backgroundColor: '#fef2f2',
    margin: 12,
    padding: 10,
    borderRadius: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#64748b',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 6,
    paddingBottom: 32,
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
  },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 40,
    paddingHorizontal: 20,
    fontSize: 15,
  },
});
