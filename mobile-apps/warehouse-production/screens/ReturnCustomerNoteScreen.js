import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DeliveryPrintModal, { DEFAULT_DELIVERY_PRINT_COPIES } from '../components/DeliveryPrintModal';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';
import { tUi } from '../lib/productionKioskI18n';

/** Customer Delivery Note (A4) — 👤 on returns list; truck flow stays separate. */
export default function ReturnCustomerNoteScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const row = route.params?.row || {};
  const printGroups = [{
    assembly_name: row.assembly_name,
    units: row.quantity,
    elapsed_display: '—',
    lines: row.reason ? [{ name: row.reason, kind: 'reason' }] : [],
  }];
  const dn = row.return_number || row.storage_number || '—';
  const [printOpen, setPrintOpen] = useState(true);

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <ProductionKioskTopBar title={tUi('returnCustomerNoteTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
        <Text style={[kiosk.metaLine, { textAlign: 'center' }]}>{dn}</Text>
        <Pressable style={kiosk.btnOutlinePrimary} onPress={() => setPrintOpen(true)}>
          <Text style={kiosk.btnOutlinePrimaryText}>{tUi('deliveryPrintTitle', locale)}</Text>
        </Pressable>
        <Pressable style={kiosk.btnPrimaryBlock} onPress={() => navigation.goBack()}>
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('back', locale)}</Text>
        </Pressable>
      </KioskSafeScroll>
      <DeliveryPrintModal
        visible={printOpen}
        locale={locale}
        textAlign={textAlign}
        deliveryNumber={dn}
        driverName=""
        dispatchedBy={getProductionDispatcherLabelSync() || ''}
        printGroups={printGroups}
        submittedAt={new Date().toISOString()}
        copyCount={DEFAULT_DELIVERY_PRINT_COPIES}
        documentKind="delivery"
        customerName={row.customer_name || ''}
        customerPhone={row.customer_phone || ''}
        autoPrintOnOpen
        onDone={() => {
          setPrintOpen(false);
          navigation.goBack();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, flexGrow: 1, justifyContent: 'center' },
});
