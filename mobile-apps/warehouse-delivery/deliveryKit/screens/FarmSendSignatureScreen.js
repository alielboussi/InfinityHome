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
import { saveLocalSentDelivery } from '../lib/deliverySentLocalStore';
import { tUi } from '../lib/productionKioskI18n';
import { formatWarehouseMobileApiError, warehouseMobileRequest } from '../shared/warehouseMobileApi';

function mapSubmitError(err, locale) {
  const code = err?.code || '';
  if (code === 'dots' || code === 'too_small' || code === 'empty' || code === 'invalid') {
    return tUi('deliverySignatureInvalid', locale);
  }
  if (code === 'capture_failed') {
    return tUi('deliverySignatureCaptureFailed', locale);
  }
  const msg = formatWarehouseMobileApiError(err?.message, '');
  if (/unknown op/i.test(msg)) {
    return tUi('deliverySubmitApiNotDeployed', locale);
  }
  return msg || tUi('deliverySubmitFailed', locale);
}

export default function FarmSendSignatureScreen({ route, navigation }) {
  const DriverPicker = DeliveryDriverPickerComponent;
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const padRef = useRef(null);
  const submitLockRef = useRef(false);

  const sessionId = route.params?.sessionId || '';
  const deliveryNumber = route.params?.deliveryNumber || '';
  const groups = route.params?.groups || [];
  const printGroups = route.params?.printGroups || [];
  const documentKind = 'farm_delivery';
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
    if (!sessionId || !groups.length) {
      navigation.replace('FarmSendHome');
    }
  }, [sessionId, groups.length, navigation]);

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
    if (!sessionId || !groups.length) {
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

      const submitResult = await warehouseMobileRequest('farm-delivery-submit', {
        session_id: sessionId,
        driver_id: driverId,
        driver_name: driverName,
        dispatched_by_name: dispatchedByName,
        signature_png_base64: dataUri,
        groups,
        print_groups: printGroups,
        document_kind: documentKind,
      });

      const signatureUrl = String(submitResult?.driver_signature_url || '').trim();
      const submittedAt = submitResult?.submitted_at || new Date().toISOString();
      const printGroupsResolved = submitResult?.print_groups || printGroups;
      const dn = submitResult?.delivery_number || deliveryNumber;

      await saveLocalSentDelivery({
        session_id: sessionId,
        delivery_number: dn,
        display_number: dn,
        document_kind: documentKind,
        status: 'submitted',
        submitted_at: submittedAt,
        driver_name: driverName,
        dispatched_by_name: dispatchedByName,
        driver_signature_url: signatureUrl,
        driver_signature_data_uri: dataUri,
        print_groups: printGroupsResolved,
      }).catch(() => {});

      navigation.replace('FarmSendDone', {
        deliveryNumber: dn,
        printNoteNumber: dn,
        driverName,
        supervisorName: dispatchedByName,
        driverSignatureDataUri: dataUri,
        driverSignatureUrl: signatureUrl,
        printGroups: printGroupsResolved,
        submittedAt,
        documentKind,
      });
    } catch (err) {
      const msg = mapSubmitError(err, locale);
      Alert.alert(tUi('deliveryFarmTitle', locale), msg);
      navigation.replace('FarmSendHome');
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  }, [
    busy,
    deliveryNumber,
    dispatchedByName,
    documentKind,
    driverId,
    driverName,
    groups,
    locale,
    navigation,
    printGroups,
    sessionId,
    sigValid,
  ]);

  const sortedDrivers = sortDeliveryDriversByName(drivers || []);

  return (
    <KioskSafeScroll
      scrollEnabled={!busy}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.wrap}
      extraBottom={36}
    >
      <ProductionKioskTopBar
        title={tUi('deliveryFarmSignatureTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow} disabled={busy}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>

      <View style={kiosk.card}>
        <Text style={[kiosk.heroNumber, { textAlign }]}>{deliveryNumber}</Text>
        <Text style={[kiosk.metaLine, { textAlign }]}>
          {tUi('deliveryFarmDriverOnlyHint', locale)}
        </Text>
      </View>

      <View style={[kiosk.field, styles.driverField]}>
        <Text style={[kiosk.label, { textAlign }]}>{tUi('deliveryDriver', locale)}</Text>
        <Pressable
          style={[
            kiosk.driverPickerBtn,
            driverName ? kiosk.driverPickerBtnSelected : null,
          ]}
          onPress={() => setDriverPickerOpen(true)}
          disabled={busy || driversLoading}
        >
          <Text
            style={[
              driverName ? kiosk.driverPickerValueText : kiosk.driverPickerPlaceholderText,
              { textAlign: 'center' },
            ]}
            numberOfLines={2}
          >
            {driverName || (driversLoading ? '…' : tUi('deliveryDriverPlaceholder', locale))}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}

      <DeliverySignaturePad
        ref={padRef}
        locale={locale}
        textAlign={textAlign}
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
        title={tUi('deliveryDriver', locale)}
        drivers={sortedDrivers}
        loading={driversLoading}
        locale={locale}
        textAlign={textAlign}
        selectedDriverId={driverId}
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
