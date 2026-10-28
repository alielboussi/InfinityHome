import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import DeliverySignaturePad from '../components/DeliverySignaturePad';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionAccessGrant } from '../hooks/useProductionAccessGrant';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { uploadDeliveryDriverSignature } from '../lib/uploadDeliveryDriverSignature';
import { tUi } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function KitweSendSignatureScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const { userDisplayName: supervisorName } = useProductionAccessGrant();
  const padRef = useRef(null);

  const sessionId = route.params?.sessionId || '';
  const deliveryNumber = route.params?.deliveryNumber || '';
  const driverId = route.params?.driverId || '';
  const driverName = route.params?.driverName || '';
  const groups = route.params?.groups || [];
  const printGroups = route.params?.printGroups || [];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sigValid, setSigValid] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const dataUri = await padRef.current?.exportPngBase64();
      const signatureUrl = await uploadDeliveryDriverSignature(sessionId, dataUri);
      await warehouseMobileRequest('delivery-submit', {
        session_id: sessionId,
        driver_id: driverId,
        driver_name: driverName,
        driver_signature_url: signatureUrl,
        groups,
      });
      navigation.replace('KitweSendDone', {
        deliveryNumber,
        driverName,
        supervisorName,
        driverSignatureDataUri: dataUri,
        driverSignatureUrl: signatureUrl,
        printGroups,
        submittedAt: new Date().toISOString(),
      });
    } catch (err) {
      const code = err?.code || err?.message;
      if (code === 'dots' || code === 'too_small' || code === 'empty' || code === 'invalid') {
        setError(tUi('deliverySignatureInvalid', locale));
      } else {
        setError(err?.message || tUi('deliverySubmitFailed', locale));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar
        title={tUi('deliverySignatureTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>

      <View style={kiosk.card}>
        <Text style={[kiosk.heroNumber, { textAlign }]}>{deliveryNumber}</Text>
        <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
          {tUi('deliveryDriver', locale)}: {driverName}
        </Text>
      </View>

      <DeliverySignaturePad
        ref={padRef}
        locale={locale}
        textAlign={textAlign}
        onValidationChange={(result) => setSigValid(Boolean(result?.ok))}
      />

      {error ? <Text style={[kiosk.errText, { textAlign }]}>{error}</Text> : null}

      <Pressable
        style={[kiosk.btnPrimaryBlock, styles.sendBtn, (!sigValid || busy) && styles.sendBtnDisabled]}
        onPress={submit}
        disabled={!sigValid || busy}
      >
        {busy ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliverySendConfirmBtn', locale)}</Text>
        )}
      </Pressable>
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingBottom: 32 },
  sendBtn: { marginTop: 20 },
  sendBtnDisabled: { opacity: 0.55 },
});
