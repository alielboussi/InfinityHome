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
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import { fetchCarpentryCatalog, runCarpentryManufacture } from '../services/carpentryApi';
import { theme } from '../shared/theme';

function formatMaterialCount(locale, count) {
  const n = Math.max(0, Number(count) || 0);
  return tUi('manufactureMaterialCount', locale).replace('{count}', String(n));
}

function formatConfirmBody(locale, name) {
  return tUi('manufactureConfirmBody', locale).replace('{name}', name || 'product');
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
      const list = await fetchCarpentryCatalog();
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('manufactureLoadFailed', locale));
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
    const name = String(item.name || '').trim() || 'product';
    const materialCount = Number(item.material_count ?? item.materials?.length ?? 0);
    if (materialCount < 1) {
      Alert.alert(
        tUi('manufactureConfirmTitle', locale),
        tUi('manufactureNoMaterials', locale),
      );
      return;
    }
    Alert.alert(
      tUi('manufactureConfirmTitle', locale),
      formatConfirmBody(locale, name),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('confirm', locale),
          onPress: async () => {
            setBusyId(String(item.id));
            try {
              await runCarpentryManufacture({ assemblyId: item.id, productQty: 1 });
              Alert.alert(tUi('manufactureConfirmTitle', locale), tUi('manufactureDone', locale));
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
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('manufactureIntro', locale)}</Text>
      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={products}
        keyExtractor={(row) => String(row.id)}
        refreshing={loading}
        onRefresh={loadCatalog}
        contentContainerStyle={products.length === 0 ? styles.listEmpty : undefined}
        renderItem={({ item }) => {
          const busy = busyId === String(item.id);
          const materialCount = Number(item.material_count ?? item.materials?.length ?? 0);
          const hasBom = materialCount > 0;
          return (
            <Pressable
              style={({ pressed }) => [
                kiosk.card,
                styles.row,
                pressed && styles.rowPressed,
                !hasBom && styles.rowWarn,
              ]}
              disabled={Boolean(busyId)}
              onPress={() => onManufacture(item)}
            >
              <Text style={styles.sku}>{item.family_sku || '—'}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.meta, !hasBom && styles.metaWarn]}>
                {hasBom
                  ? formatMaterialCount(locale, materialCount)
                  : tUi('manufactureNoMaterials', locale)}
              </Text>
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
              {tUi('manufactureEmpty', locale)}
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
  rowWarn: { borderColor: theme.danger, borderWidth: 1 },
  sku: { color: theme.textDim, fontSize: 12, marginBottom: 4 },
  name: { color: theme.text, fontSize: 17, fontWeight: '600', marginBottom: 6 },
  meta: { color: theme.textMuted, fontSize: 13, marginBottom: 4 },
  metaWarn: { color: theme.danger },
  tapHint: { color: theme.primary, fontSize: 13, fontWeight: '600', marginTop: 4 },
  empty: { marginTop: 24 },
});
