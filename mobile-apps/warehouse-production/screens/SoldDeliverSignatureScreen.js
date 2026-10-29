import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text } from 'react-native';
import DeliveryDriverPickerComponent from '../components/DeliveryDriverPicker.js';
import DeliverySignaturePad from '../components/DeliverySignaturePad';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { sortDeliveryDriversByName } from '../lib/sortDeliveryDrivers';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function SoldDeliverSignatureScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const padRef = useRef(null);
  const submitLock = useRef(false);
  const storageSendId = route.params?.storageSendId || '';
  const storageNumber = route.params?.storageNumber || '';
  const sessionId = route.params?.sessionId || '';
  const deliveryNumber = route.params?.deliveryNumber || storageNumber;
  const printGroups = route.params?.printGroups || [];
  const customerName = route.params?.customerName || '';
  const customerPhone = route.params?.customerPhone || '';

  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sigValid, setSigValid] = useState(false);

  useEffect(() => {
    warehouseMobileRequest('delivery-drivers-list')
      .then((res) => setDrivers(res?.drivers || []))
      .catch(() => setDrivers([]));
  }, []);

  useEffect(() => {
    if (!storageSendId) navigation.replace('SoldOrders');
  }, [storageSendId, navigation]);

  useEffect(() => {
    if (!busy) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [busy]);

  const submit = useCallback(async () => {
    if (submitLock.current || busy) return;
    if (!driverName.trim()) {
      setError(tUi('deliveryNeedDriver', locale));
      return;
    }
    if (!sigValid) {
      setError(tUi('returnDrawSignature', locale));
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      const dataUri = await padRef.current?.exportPngBase64?.();
      if (!dataUri) throw new Error(tUi('deliverySignatureCaptureFailed', locale));
      const out = await warehouseMobileRequest('storage-deliver-submit', {
        storage_send_id: storageSendId,
        session_id: sessionId,
        driver_id: driverId,
        driver_name: driverName,
        signature_png_base64: dataUri,
      });
      navigation.replace('SoldDeliverDone', {
        deliveryNumber: out.delivery_number || deliveryNumber,
        driverName,
        supervisorName: getProductionDispatcherLabelSync() || '',
        printGroups: out.print_groups || printGroups,
        driverSignatureUrl: out.driver_signature_url || '',
        submittedAt: out.submitted_at,
        documentKind: 'sold_delivery',
        customerName: out.customer_name || customerName,
        customerPhone: out.customer_phone || customerPhone,
      });
    } catch (err) {
      setError(err?.message || tUi('soldDeliverFailed', locale));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }, [
    busy, customerName, customerPhone, deliveryNumber, driverId, driverName,
    locale, navigation, printGroups, sessionId, sigValid, storageSendId,
  ]);

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <ProductionKioskTopBar title={tUi('soldDeliverTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
        <Text style={[kiosk.metaLine, { textAlign }]}>{storageNumber || deliveryNumber}</Text>
        <Pressable
          style={[kiosk.driverPickerBtn, driverName ? kiosk.driverPickerBtnSelected : null, { marginBottom: 12 }]}
          onPress={() => setDriverPickerOpen(true)}
        >
          <Text style={driverName ? kiosk.driverPickerValueText : kiosk.driverPickerPlaceholderText}>
            {driverName || tUi('deliveryDriverPlaceholder', locale)}
          </Text>
        </Pressable>
        <DeliverySignaturePad
          ref={padRef}
          locale={locale}
          textAlign={textAlign}
          onValidationChange={(r) => setSigValid(Boolean(r?.ok))}
        />
        {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
        <Pressable style={[kiosk.btnPrimaryBlock, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={kiosk.btnPrimaryBlockText}>{tUi('returnSignSubmit', locale)}</Text>
          )}
        </Pressable>
      </KioskSafeScroll>
      <DeliveryDriverPickerComponent
        visible={driverPickerOpen}
        title={tUi('deliveryDriver', locale)}
        drivers={sortDeliveryDriversByName(drivers)}
        locale={locale}
        textAlign={textAlign}
        selectedDriverId={driverId}
        onClose={() => setDriverPickerOpen(false)}
        onSelect={(d) => {
          setDriverId(String(d.id || ''));
          setDriverName(String(d.name || '').trim());
          setDriverPickerOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 8 },
});
