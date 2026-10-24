import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';

export default function DashboardScreen({
  navigation,
  userDisplayName,
  userEmail,
  allowed,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, dir, ready } = useProductionKioskLocale();

  if (!allowed) {
    return (
      <View style={[kiosk.screen, styles.center, { paddingTop: insets.top + 16 }]}>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', ready ? locale : 'ar')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        kiosk.screen,
        dir === 'rtl' && kiosk.screenRtl,
        { paddingTop: insets.top + 12 },
      ]}
    >
      <ProductionKioskTopBar
        title={tUi('dashTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      {(userDisplayName || userEmail) ? (
        <Text style={styles.user}>{userDisplayName || userEmail}</Text>
      ) : null}
      <View style={kiosk.dashGrid}>
        <Pressable
          style={kiosk.dashBtn}
          onPress={() => navigation.navigate('Create')}
        >
          <Text style={kiosk.dashBtnText}>{tUi('dashCreate', locale)}</Text>
        </Pressable>
        <Pressable
          style={kiosk.dashBtn}
          onPress={() => navigation.navigate('Stock')}
        >
          <Text style={kiosk.dashBtnText}>{tUi('dashStock', locale)}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', flexGrow: 1 },
  user: { color: '#6b7280', marginBottom: 8, fontSize: 14 },
});
