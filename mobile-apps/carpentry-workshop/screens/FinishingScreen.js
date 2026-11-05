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
import {
  fetchCarpentryFinishingProducts,
  runCarpentryFinishing,
} from '../services/carpentryApi';
import { theme } from '../shared/theme';

function formatFloor2Qty(locale, qty) {
  return tUi('finishingFloor2Qty', locale).replace('{qty}', String(Math.max(0, Number(qty) || 0)));
}

function formatConfirmBody(locale, name) {
  return tUi('finishingConfirmBody', locale).replace('{name}', name || 'product');
}

export default function FinishingScreen({
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

  const loadList = useCallback(async () => {
    if (!allowed) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchCarpentryFinishingProducts();
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('finishingLoadFailed', locale));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList]),
  );

  const onFinish = (item) => {
    if (!allowed || busyId) return;
    const name = String(item.name || '').trim() || 'product';
    const floor2Qty = Math.max(0, Number(item.floor2_qty) || 0);
    if (floor2Qty < 1) {
      Alert.alert(tUi('finishingConfirmTitle', locale), tUi('finishingNoStock', locale));
      return;
    }
    Alert.alert(
      tUi('finishingConfirmTitle', locale),
      formatConfirmBody(locale, name),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('confirm', locale),
          onPress: async () => {
            setBusyId(String(item.id));
            try {
              await runCarpentryFinishing({ assemblyId: item.id, productQty: 1 });
              Alert.alert(tUi('finishingConfirmTitle', locale), tUi('finishingDone', locale));
              await loadList();
            } catch (e) {
              Alert.alert(
                tUi('finishingFailed', locale),
                e?.message || tUi('finishingFailed', locale),
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
          title={tUi('finishingTitle', locale)}
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
        title={tUi('finishingTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('finishingIntro', locale)}</Text>
      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={products}
        keyExtractor={(row) => String(row.id)}
        refreshing={loading}
        onRefresh={loadList}
        contentContainerStyle={products.length === 0 ? styles.listEmpty : undefined}
        renderItem={({ item }) => {
          const busy = busyId === String(item.id);
          return (
            <Pressable
              style={({ pressed }) => [kiosk.card, styles.row, pressed && styles.rowPressed]}
              disabled={Boolean(busyId)}
              onPress={() => onFinish(item)}
            >
              <Text style={styles.sku}>{item.family_sku || '—'}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{formatFloor2Qty(locale, item.floor2_qty)}</Text>
              {busy ? (
                <ActivityIndicator color={theme.primary} style={{ marginTop: 8 }} />
              ) : (
                <Text style={styles.tapHint}>{tUi('finishingTapHint', locale)}</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('finishingEmpty', locale)}
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
