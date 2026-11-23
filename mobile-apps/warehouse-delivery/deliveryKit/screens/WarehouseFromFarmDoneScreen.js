import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { openDeliveryNotePdf } from '../lib/openDeliveryNotePdf';
import { theme } from '../shared/theme';

export default function WarehouseFromFarmDoneScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const transferRef = route.params?.transferRef || '';
  const driverName = route.params?.driverName || '';
  const dispatchedByName = route.params?.dispatchedByName || '';
  const printGroups = route.params?.printGroups || route.params?.shareGroups || [];
  const submittedAt = route.params?.submittedAt || '';
  const driverSignatureDataUri = route.params?.driverSignatureDataUri || '';
  const driverSignatureUrl = route.params?.driverSignatureUrl || '';
  const documentKind = route.params?.documentKind || 'farm_return';
  const hasPrintPayload = Boolean(transferRef) && Array.isArray(printGroups) && printGroups.length > 0;
  const [sharing, setSharing] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const autoShareStarted = useRef(false);

  const sharePdf = useCallback(async () => {
    if (!hasPrintPayload) {
      setWhatsappSent(true);
      return;
    }
    setSharing(true);
    try {
      await openDeliveryNotePdf({
        deliveryNumber: transferRef,
        driverName,
        dispatchedBy: dispatchedByName,
        driverSignatureDataUri,
        driverSignatureUrl,
        submittedAt,
        printGroups,
        copies: 1,
        documentKind,
        forceShare: true,
      });
      setWhatsappSent(true);
    } catch (e) {
      Alert.alert(
        tUi('deliveryFarmWhatsAppRequiredTitle', locale),
        e?.message || tUi('deliveryFarmWhatsAppRequiredBody', locale),
      );
    } finally {
      setSharing(false);
    }
  }, [
    dispatchedByName,
    documentKind,
    driverName,
    driverSignatureDataUri,
    driverSignatureUrl,
    hasPrintPayload,
    locale,
    printGroups,
    submittedAt,
    transferRef,
  ]);

  useEffect(() => {
    if (autoShareStarted.current || !hasPrintPayload) return;
    autoShareStarted.current = true;
    void sharePdf();
  }, [hasPrintPayload, sharePdf]);

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar
        title={tUi('deliveryFarmReturnDoneTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <View style={styles.centerBlock}>
        <View style={kiosk.card}>
          <Text style={[kiosk.title, { textAlign, fontSize: 22 }]}>
            {tUi('deliveryFarmReturnDoneHead', locale)}
          </Text>
          <Text style={[styles.ref, { textAlign }]}>{transferRef}</Text>
          <Text style={[kiosk.metaLine, { textAlign }]}>
            {whatsappSent
              ? tUi('deliveryFarmWhatsAppDone', locale)
              : tUi('deliveryFarmWhatsAppRequiredBody', locale)}
          </Text>
        </View>
        <Pressable
          style={styles.outlineBtn}
          onPress={sharePdf}
          disabled={sharing}
        >
          <Text style={styles.outlineBtnText}>
            {sharing ? '…' : tUi('deliveryFarmOpenPdf', locale)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.doneBtn, styles.btn, !whatsappSent && styles.btnDisabled]}
          onPress={() => navigation.popToTop()}
          disabled={!whatsappSent}
        >
          <Text style={styles.doneBtnText}>{tUi('deliveryFarmDone', locale)}</Text>
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
  ref: {
    fontSize: 20,
    fontWeight: '800',
    color: '#047857',
    marginVertical: 12,
  },
  outlineBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  outlineBtnText: { color: '#047857', fontSize: 16, fontWeight: '800' },
  doneBtn: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  btn: { marginTop: 12 },
  btnDisabled: { opacity: 0.45 },
});
