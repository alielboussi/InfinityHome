import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DeliveryPrintModal, { DEFAULT_DELIVERY_PRINT_COPIES } from '../components/DeliveryPrintModal';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';

export default function SoldDeliverDoneScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const dn = route.params?.deliveryNumber || '';
  const driverName = route.params?.driverName || '';
  const supervisorName = route.params?.supervisorName || '';
  const printGroups = route.params?.printGroups || [];
  const driverSignatureUrl = route.params?.driverSignatureUrl || '';
  const submittedAt = route.params?.submittedAt || '';
  const customerName = route.params?.customerName || '';
  const customerPhone = route.params?.customerPhone || '';
  const hasPrint = Boolean(dn) && printGroups.length > 0;
  const [printOpen, setPrintOpen] = useState(hasPrint);

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <ProductionKioskTopBar title={tUi('soldDeliverDoneTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
        <View style={kiosk.card}>
          <Text style={[kiosk.title, { textAlign }]}>{tUi('deliveryDoneTitle', locale)}</Text>
          <Text style={[styles.dn, { textAlign }]}>{dn}</Text>
        </View>
        {hasPrint ? (
          <Pressable style={kiosk.btnOutlinePrimary} onPress={() => setPrintOpen(true)}>
            <Text style={kiosk.btnOutlinePrimaryText}>{tUi('deliveryPrintTitle', locale)}</Text>
          </Pressable>
        ) : null}
        <Pressable style={kiosk.btnPrimaryBlock} onPress={() => navigation.popToTop()}>
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryBackDashboard', locale)}</Text>
        </Pressable>
      </KioskSafeScroll>
      <DeliveryPrintModal
        visible={printOpen && hasPrint}
        locale={locale}
        textAlign={textAlign}
        deliveryNumber={dn}
        driverName={driverName}
        dispatchedBy={supervisorName}
        driverSignatureUrl={driverSignatureUrl}
        printGroups={printGroups}
        submittedAt={submittedAt}
        copyCount={DEFAULT_DELIVERY_PRINT_COPIES}
        documentKind="delivery"
        customerName={customerName}
        customerPhone={customerPhone}
        autoPrintOnOpen
        onDone={() => setPrintOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, flexGrow: 1, justifyContent: 'center' },
  dn: { fontSize: 20, fontWeight: '800', marginVertical: 8 },
});
