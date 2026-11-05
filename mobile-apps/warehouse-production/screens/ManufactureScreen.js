import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import {
  fetchUpholsteryManufactureProducts,
  runUpholsteryManufacture,
} from '../services/productionApi';
import { theme } from '../shared/theme';

function formatConfirmBody(locale, rawName, finishedSku) {
  const finished = finishedSku
    ? tUi('manufactureFinishedSku', locale).replace('{sku}', finishedSku)
    : '';
  return tUi('manufactureUpholsteryConfirmBody', locale)
    .replace('{name}', rawName || 'product')
    .replace('{finished}', finished);
}

export default function ManufactureScreen({
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadCatalog = useCallback(async () => {
    if (!allowed) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchUpholsteryManufactureProducts();
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('manufactureUpholsteryLoadFailed', locale));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
    }, [loadCatalog]),
  );

  const onManufacture = (item) => {
    if (!allowed || busyId) return;
    const rawName = String(item.raw_name || item.name || '').trim() || 'product';
    const finishedSku = String(item.finished_sku || '').trim();
    Alert.alert(
      tUi('manufactureConfirmTitle', locale),
      formatConfirmBody(locale, rawName, finishedSku),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('confirm', locale),
          onPress: async () => {
            const rawId = String(item.raw_assembly_id || item.id || '');
            setBusyId(rawId);
            try {
              await runUpholsteryManufacture({ rawAssemblyId: rawId, productQty: 1 });
              Alert.alert(
                tUi('manufactureConfirmTitle', locale),
                tUi('manufactureUpholsteryDone', locale),
              );
              await loadCatalog();
            } catch (e) {
              Alert.alert(
                tUi('manufactureFailed', locale),
                e?.message || tUi('manufactureFailed', locale),
              );
            } finally {
              setBusyId('');
            }
          },
        },
      ],
    );
  };

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.blockedRoot]}>
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
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('manufactureUpholsteryIntro', locale)}</Text>
      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={products}
        keyExtractor={(item) => String(item.raw_assembly_id || item.id)}
        refreshing={loading}
        onRefresh={loadCatalog}
        contentContainerStyle={products.length === 0 ? styles.listEmpty : undefined}
        renderItem={({ item }) => {
          const id = String(item.raw_assembly_id || item.id);
          const busy = busyId === id;
          const qtyLabel = tUi('manufactureRawQty', locale).replace(
            '{qty}',
            String(item.carpentry_qty ?? '0'),
          );
          return (
            <Pressable
              style={({ pressed }) => [kiosk.card, styles.row, pressed && styles.rowPressed]}
              disabled={Boolean(busyId)}
              onPress={() => onManufacture(item)}
            >
              <Text style={styles.sku}>{item.raw_sku || '—'}</Text>
              <Text style={styles.name}>{item.raw_name || item.name}</Text>
              <Text style={styles.meta}>{qtyLabel}</Text>
              {item.finished_sku ? (
                <Text style={styles.meta}>
                  {tUi('manufactureFinishedSku', locale).replace('{sku}', item.finished_sku)}
                </Text>
              ) : null}
              {busy ? (
                <ActivityIndicator color={theme.primary} style={{ marginTop: 8 }} />
              ) : (
                <Text style={styles.tapHint}>{tUi('manufactureTapHint', locale)}</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('manufactureUpholsteryEmpty', locale)}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  blockedRoot: { flex: 1 },
  intro: { marginBottom: 12 },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: { marginBottom: 10 },
  rowPressed: { opacity: 0.92 },
  sku: { color: theme.textDim, fontSize: 12, marginBottom: 4 },
  name: { color: theme.text, fontSize: 17, fontWeight: '600', marginBottom: 6 },
  meta: { color: theme.textMuted, fontSize: 13, marginBottom: 4 },
  tapHint: { color: theme.primary, fontSize: 13, fontWeight: '600', marginTop: 4 },
  empty: { marginTop: 24 },
});
