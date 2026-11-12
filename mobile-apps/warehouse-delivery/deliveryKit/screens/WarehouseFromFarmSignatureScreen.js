import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import DeliveryDriverPickerComponent from '../components/DeliveryDriverPicker.js';
import DeliverySignaturePad from '../components/DeliverySignaturePad';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { sortDeliveryDriversByName } from '../lib/sortDeliveryDrivers';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { useDeliveryDrivers } from '../../hooks/useDeliveryDrivers';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';
import { tUi } from '../lib/productionKioskI18n';
import { formatWarehouseMobileApiError, warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function WarehouseFromFarmSignatureScreen({ route, navigation }) {
  const DriverPicker = DeliveryDriverPickerComponent;
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const padRef = useRef(null);
  const submitLockRef = useRef(false);

  const sessionId = route.params?.sessionId || '';
  const transferRef = route.params?.transferRef || '';
  const lines = route.params?.lines || [];
  const shareGroups = route.params?.shareGroups || [];
  const dispatchedByName = route.params?.dispatchedByName
    || getProductionDispatcherLabelSync()
    || '';

  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const { drivers, loading: driversLoading } = useDeliveryDrivers();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sigValid, setSigValid] = useState(false);

  useEffect(() => {
    if (!sessionId || !lines.length) {
      navigation.replace('WarehouseFromFarmHome');
    }
  }, [sessionId, lines.length, navigation]);

  useEffect(() => {
    if (!busy) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [busy]);

  const handleValidationChange = useCallback((result) => {
    setSigValid(Boolean(result?.ok));
  }, []);

  const submit = useCallback(async () => {
    if (submitLockRef.current || busy) return;
    if (!sessionId || !lines.length) {
      setError(tUi('deliveryNeedProduct', locale));
      return;
    }
    if (!driverName.trim()) {
      setError(tUi('deliveryNeedDriver', locale));
      return;
    }
    if (!sigValid) {
      setError(tUi('deliverySignatureInvalid', locale));
      return;
    }

    submitLockRef.current = true;
    setBusy(true);
    setError('');
    try {
      const exportFn = padRef.current?.exportPngBase64;
      if (typeof exportFn !== 'function') {
        throw Object.assign(new Error('capture_failed'), { code: 'capture_failed' });
      }
      const dataUri = await exportFn.call(padRef.current);
      if (!dataUri) {
        throw Object.assign(new Error('capture_failed'), { code: 'capture_failed' });
      }

      const submitResult = await warehouseMobileRequest('farm-return-submit', {
        session_id: sessionId,
        driver_name: driverName,
        driver_id: driverId,
        dispatched_by_name: dispatchedByName,
        signature_png_base64: dataUri,
        lines,
        share_groups: shareGroups,
      });

      navigation.replace('WarehouseFromFarmDone', {
        transferRef: submitResult?.transfer_ref || transferRef,
        driverName,
        dispatchedByName: submitResult?.dispatched_by_name || dispatchedByName,
        shareGroups: submitResult?.share_groups || shareGroups,
        submittedAt: submitResult?.submitted_at || new Date().toISOString(),
      });
    } catch (err) {
      const msg = formatWarehouseMobileApiError(err?.message, tUi('deliverySubmitFailed', locale));
      Alert.alert('الإرسال إلى المستودع', msg);
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  }, [
    busy,
    dispatchedByName,
    driverId,
    driverName,
    lines,
    locale,
    navigation,
    shareGroups,
    sessionId,
    sigValid,
    transferRef,
  ]);

  const sortedDrivers = sortDeliveryDriversByName(drivers || []);

  return (
    <KioskSafeScroll
      scrollEnabled={!busy}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.wrap}
      extraBottom={16}
    >
      <ProductionKioskTopBar
        title="توقيع النقل إلى المستودع"
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow} disabled={busy}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>

      <View style={kiosk.card}>
        <Text style={[kiosk.heroNumber, { textAlign }]}>{transferRef}</Text>
        <Text style={[kiosk.metaLine, { textAlign }]}>سائق فقط — بدون سائق العميل.</Text>
      </View>

      <View style={[kiosk.field, styles.driverField]}>
        <Text style={[kiosk.label, { textAlign }]}>{tUi('deliveryDriver', locale)}</Text>
        <Pressable
          style={kiosk.inputPressable}
          onPress={() => setDriverPickerOpen(true)}
          disabled={busy || driversLoading}
        >
          <Text style={[kiosk.inputPressableText, { textAlign }]}>
            {driverName || (driversLoading ? '…' : tUi('deliverySelectDriver', locale))}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}

      <DeliverySignaturePad
        ref={padRef}
        disabled={busy}
        onValidationChange={handleValidationChange}
      />

      <Pressable
        style={[kiosk.btnPrimaryBlock, (!sigValid || busy) && styles.btnDisabled]}
        onPress={submit}
        disabled={!sigValid || busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliverySubmit', locale)}</Text>
        )}
      </Pressable>

      <DriverPicker
        visible={driverPickerOpen}
        drivers={sortedDrivers}
        onClose={() => setDriverPickerOpen(false)}
        onSelect={(d) => {
          setDriverId(String(d?.id || ''));
          setDriverName(String(d?.name || '').trim());
          setDriverPickerOpen(false);
        }}
      />
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  driverField: { marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
});
