import { Pressable, StyleSheet, Text, View } from 'react-native';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function KitweSendDoneScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const dn = route.params?.deliveryNumber || '';

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar
        title={tUi('deliverySentTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <View style={styles.centerBlock}>
        <View style={kiosk.card}>
          <Text style={[kiosk.title, { textAlign, fontSize: 22 }]}>{tUi('deliveryDoneTitle', locale)}</Text>
          <Text style={[styles.dn, { textAlign }]}>{dn}</Text>
          <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
            {tUi('deliveryDoneSub', locale)}
          </Text>
        </View>
        <Pressable style={[kiosk.btnPrimaryBlock, styles.btn]} onPress={() => navigation.popToTop()}>
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryBackDashboard', locale)}</Text>
        </Pressable>
      </View>
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 320,
  },
  dn: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.primary,
    marginVertical: 12,
  },
  btn: { marginTop: 24 },
});
