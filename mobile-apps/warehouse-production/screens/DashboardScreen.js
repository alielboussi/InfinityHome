import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskScreenEdges } from '../lib/kioskLayout';
import { theme } from '../shared/theme';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';

export default function DashboardScreen({
  navigation,
  userDisplayName,
  userEmail,
  allowed,
  onRefreshAccess,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign, ready } = useProductionKioskLocale();

  if (!allowed) {
    return (
      <View style={[kiosk.screen, styles.center, { paddingTop: insets.top + 16, paddingHorizontal: 20 }]}>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', ready ? locale : 'ar')}</Text>
        {userEmail ? (
          <Text style={[styles.user, { textAlign: 'center', marginTop: 12 }]}>{userEmail}</Text>
        ) : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess()}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', ready ? locale : 'en')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[kiosk.screen, kioskScreenEdges(insets, 28)]}
    >
      <ProductionKioskTopBar
        title={tUi('dashTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      {(userDisplayName || userEmail) ? (
        <Text style={[styles.user, { textAlign }]}>{userDisplayName || userEmail}</Text>
      ) : null}
      <View style={kiosk.dashGrid}>
        <Pressable
          style={({ pressed }) => [kiosk.dashBtn, pressed && kiosk.dashBtnPressed]}
          onPress={() => navigation.navigate('Create')}
        >
          <Text style={[kiosk.dashBtnText, { textAlign }]}>
            {tUi('dashCreate', locale)}
          </Text>
          <Text style={[kiosk.dashBtnSub, { textAlign }]}>
            {tUi('dashCreateSub', locale)}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [kiosk.dashBtn, pressed && kiosk.dashBtnPressed]}
          onPress={() => navigation.navigate('Stock')}
        >
          <Text style={[kiosk.dashBtnText, { textAlign }]}>
            {tUi('dashStock', locale)}
          </Text>
          <Text style={[kiosk.dashBtnSub, { textAlign }]}>
            {tUi('dashStockSub', locale)}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', flexGrow: 1 },
  user: { color: theme.textMuted, marginBottom: 4, fontSize: 15, fontWeight: '500' },
});
