import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { sortDeliveryDriversByName } from '../lib/sortDeliveryDrivers';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import DeliveryDriverPickerComponent from '../components/DeliveryDriverPicker.js';
import DeliverySignaturePad from '../components/DeliverySignaturePad';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function RepairReturnSignatureScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const padRef = useRef(null);
  const submitLock = useRef(false);

  const dispatchKind = route.params?.dispatchKind || 'kitwe';
  const returnOrderId = route.params?.returnOrderId || '';
  const returnNumber = route.params?.returnNumber || '';
  const sessionId = route.params?.sessionId || '';
  const deliveryNumber = route.params?.deliveryNumber || '';
  const printGroups = route.params?.printGroups || [];
  const customerName = route.params?.customerName || '';
  const customerPhone = route.params?.customerPhone || '';
  const documentKind = route.params?.documentKind
    || (dispatchKind === 'customer' ? 'return_customer_delivery' : 'return_shipment');

  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sigValid, setSigValid] = useState(false);

  useEffect(() => {
    if (!sessionId) navigation.goBack();
  }, [sessionId, navigation]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await warehouseMobileRequest('delivery-drivers-list', {});
        if (alive) setDrivers(sortDeliveryDriversByName(res?.drivers || []));
      } catch {
        if (alive) setDrivers([]);
      } finally {
        if (alive) setDriversLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

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

      const op = dispatchKind === 'customer'
        ? 'return-order-customer-delivery-submit'
        : 'return-order-ship-submit';
      const out = await warehouseMobileRequest(op, {
        session_id: sessionId,
        driver_id: driverId,
        driver_name: driverName,
        signature_png_base64: dataUri,
      });

      navigation.replace('RepairReturnDone', {
        deliveryNumber: out.delivery_number || deliveryNumber,
        driverName,
        supervisorName: getProductionDispatcherLabelSync() || '',
        printGroups: out.print_groups || printGroups,
        driverSignatureDataUri: dataUri,
        driverSignatureUrl: out.driver_signature_url || '',
        submittedAt: out.submitted_at,
        documentKind,
        customerName: out.customer_name || customerName,
        customerPhone: out.customer_phone || customerPhone,
        returnOrderId,
        returnNumber,
      });
    } catch (err) {
      setError(err?.message || tUi('deliverySubmitFailed', locale));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }, [
    busy, dispatchKind, driverId, driverName, locale, navigation, printGroups,
    sessionId, deliveryNumber, sigValid, documentKind, customerName, customerPhone,
    returnOrderId, returnNumber,
  ]);

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <ProductionKioskTopBar
          title={tUi('returnShipTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={[kiosk.metaLine, { textAlign }]}>{returnNumber || deliveryNumber}</Text>
        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('deliveryDriver', locale)}</Text>
          <Pressable
            style={[kiosk.driverPickerBtn, driverName ? kiosk.driverPickerBtnSelected : null]}
            onPress={() => setDriverPickerOpen(true)}
          >
            <Text
              style={[
                driverName ? kiosk.driverPickerValueText : kiosk.driverPickerPlaceholderText,
                { textAlign: 'center' },
              ]}
              numberOfLines={2}
            >
              {driverName || tUi('deliveryDriverPlaceholder', locale)}
            </Text>
          </Pressable>
        </View>
        <DeliverySignaturePad
          ref={padRef}
          locale={locale}
          textAlign={textAlign}
          onValidationChange={(r) => setSigValid(Boolean(r?.ok))}
        />
        {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
        <Pressable
          style={[kiosk.btnPrimaryBlock, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={kiosk.btnPrimaryBlockText}>{tUi('returnSignSubmit', locale)}</Text>
          )}
        </Pressable>
      </KioskSafeScroll>
      <DeliveryDriverPickerComponent
        visible={driverPickerOpen}
        title={tUi('deliveryDriver', locale)}
        drivers={sortDeliveryDriversByName(drivers)}
        loading={driversLoading}
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
