import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from './ProductionKioskTopBar';
import { kiosk } from './kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { tUi } from '../lib/productionKioskI18n';

export default function OrdersScreenShell({
  title,
  locale,
  onToggleLocale,
  navigation,
  children,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[kiosk.screen, styles.flex, kioskScreenEdgesSafe(insets, 12)]}>
      <ProductionKioskTopBar title={title} locale={locale} onToggleLocale={onToggleLocale} />
      {navigation ? (
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
      ) : null}
      {!allowed ? (
        <>
          <Text style={kiosk.noticeErr}>{tUi('accessDenied', locale)}</Text>
          {accessHint ? <Text style={kiosk.hint}>{accessHint}</Text> : null}
          {typeof onRefreshAccess === 'function' ? (
            <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess({ background: false })}>
              <Text style={kiosk.btnText}>{tUi('retryAccess', locale)}</Text>
            </Pressable>
          ) : null}
        </>
      ) : children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
