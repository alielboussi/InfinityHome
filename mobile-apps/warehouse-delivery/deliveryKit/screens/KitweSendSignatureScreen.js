import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import DeliveryDriverPickerComponent from '../components/DeliveryDriverPicker.js';
import DeliveryCustomerDriverSection from '../components/DeliveryCustomerDriverSection';
import DeliverySignaturePad from '../components/DeliverySignaturePad';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { sortDeliveryDriversByName } from '../lib/sortDeliveryDrivers';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { useDeliveryDrivers } from '../../hooks/useDeliveryDrivers';
import { getProductionDispatcherLabelSync } from '../lib/productionDispatcherLabel';
import { saveLocalSentDelivery } from '../lib/deliverySentLocalStore';
import { clearDeliveryWorkspace } from '../lib/productionDeliveryWorkspaceCache';
import { deliveryQueueReturnRoute } from '../lib/deliveryQueueNavigation';
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

export default function KitweSendSignatureScreen({ route, navigation }) {
  const DriverPicker = DeliveryDriverPickerComponent;
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const padRef = useRef(null);
  const submitLockRef = useRef(false);

  const sessionId = route.params?.sessionId || '';
  const deliveryNumber = route.params?.deliveryNumber || '';
  const groups = route.params?.groups || [];
  const printGroups = route.params?.printGroups || [];
  const returnOrderId = route.params?.returnOrderId || '';
  const documentKind = route.params?.documentKind || 'delivery';
  const repairCustomerName = route.params?.repairCustomerName || '';
  const repairCustomerPhone = route.params?.repairCustomerPhone || '';
  const dispatchedByName = route.params?.dispatchedByName
    || getProductionDispatcherLabelSync()
    || '';

  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [customerDriverName, setCustomerDriverName] = useState('');
  const [customerDriverPhone, setCustomerDriverPhone] = useState('');
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const { drivers, loading: driversLoading } = useDeliveryDrivers();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sigValid, setSigValid] = useState(false);

  useEffect(() => {
    if (!sessionId || !Array.isArray(groups) || !groups.length) {
      navigation.replace(deliveryQueueReturnRoute(route.params?.queueKind));
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
    const useCustomer = Boolean(customerDriverName.trim() && customerDriverPhone.trim());
    if (!useCustomer && !driverName.trim()) {
      setError(tUi('deliveryNeedDriver', locale));
      return;
    }
    if (useCustomer && driverId) {
      setError(tUi('deliveryDriverEitherOr', locale));
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

      const submitResult = await warehouseMobileRequest('delivery-submit', {
        session_id: sessionId,
        driver_id: useCustomer ? '' : driverId,
        driver_name: useCustomer ? customerDriverName : driverName,
        customer_driver_name: useCustomer ? customerDriverName : '',
        customer_driver_phone: useCustomer ? customerDriverPhone : '',
        signature_png_base64: dataUri,
        groups,
        ...(returnOrderId ? { return_order_id: returnOrderId } : {}),
      });

      clearDeliveryWorkspace();

      const signatureUrl = String(submitResult?.driver_signature_url || '').trim();
      const submittedAt = submitResult?.submitted_at || new Date().toISOString();

      await saveLocalSentDelivery({
        session_id: sessionId,
        delivery_number: deliveryNumber,
        status: 'submitted',
        submitted_at: submittedAt,
        driver_name: driverName,
        dispatched_by_name: dispatchedByName,
        driver_signature_url: signatureUrl,
        driver_signature_data_uri: dataUri,
        print_groups: printGroups,
      }).catch(() => {});

      navigation.replace('KitweSendDone', {
        deliveryNumber,
        driverName,
        supervisorName: dispatchedByName,
        driverSignatureDataUri: dataUri,
        driverSignatureUrl: signatureUrl,
        printGroups,
        submittedAt,
        documentKind,
        customerName: repairCustomerName,
        customerPhone: repairCustomerPhone,
      });
    } catch (err) {
      try {
        await warehouseMobileRequest('delivery-draft-discard', { session_id: sessionId });
      } catch {
        // Server may have already removed the draft after a failed submit.
      }
      const msg = mapSubmitError(err, locale);
      Alert.alert(tUi('deliveryTitle', locale), msg);
      navigation.replace(deliveryQueueReturnRoute(route.params?.queueKind));
    } finally {
      setBusy(false);
      submitLockRef.current = false;
    }
  }, [
    busy,
    deliveryNumber,
    dispatchedByName,
    driverId,
    driverName,
    customerDriverName,
    customerDriverPhone,
    groups,
    locale,
    navigation,
    printGroups,
    sessionId,
    sigValid,
  ]);

  const customerLabels = {
    title: tUi('deliveryCustomerDriver', locale),
    hint: tUi('deliveryCustomerDriverHint', locale),
    addTitle: tUi('deliveryCustomerDriverAdd', locale),
    namePh: tUi('deliveryCustomerDriverNamePh', locale),
    phonePh: tUi('deliveryCustomerDriverPhonePh', locale),
    save: tUi('customerDriverSave', locale),
  };

  return (
    <>
      <KioskSafeScroll
        scrollEnabled={!busy}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.wrap}
        extraBottom={16}
      >
        <ProductionKioskTopBar
          title={tUi('deliverySignatureTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable
          onPress={() => navigation.goBack()}
          style={kiosk.backRow}
          disabled={busy}
        >
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>

        <View style={kiosk.card}>
          <Text style={[kiosk.heroNumber, { textAlign }]}>{deliveryNumber}</Text>
        </View>

        <DeliveryCustomerDriverSection
          locale={locale}
          textAlign={textAlign}
          disabled={busy}
          customerName={customerDriverName}
          customerPhone={customerDriverPhone}
          fleetDriverActive={Boolean(driverId || driverName)}
          labels={customerLabels}
          kiosk={kiosk}
          onCustomerChange={({ name, phone }) => {
            setCustomerDriverName(name);
            setCustomerDriverPhone(phone);
            setDriverId('');
            setDriverName('');
          }}
          onUseFleetDriver={() => {}}
        />

        <View style={[kiosk.field, styles.driverField]}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('deliveryDriver', locale)}</Text>
          <Pressable
            style={[
              kiosk.driverPickerBtn,
              driverName ? kiosk.driverPickerBtnSelected : null,
            ]}
            onPress={() => {
              if (customerDriverName) {
                setError(tUi('deliveryDriverEitherOr', locale));
                return;
              }
              setDriverPickerOpen(true);
            }}
            disabled={busy || Boolean(customerDriverName)}
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

        <View pointerEvents={busy ? 'none' : 'auto'}>
          <DeliverySignaturePad
            ref={padRef}
            locale={locale}
            textAlign={textAlign}
            onValidationChange={handleValidationChange}
          />
        </View>

        {error ? <Text style={[kiosk.errText, { textAlign }]}>{error}</Text> : null}

        <Pressable
          style={[kiosk.btnPrimaryBlock, styles.sendBtn, (!sigValid || busy || (!driverName.trim() && !customerDriverName.trim())) && styles.sendBtnDisabled]}
          onPress={submit}
          disabled={!sigValid || busy || (!driverName.trim() && !customerDriverName.trim())}
        >
          {busy ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliverySendConfirmBtn', locale)}</Text>
          )}
        </Pressable>
      </KioskSafeScroll>

      <DriverPicker
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
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingBottom: 12 },
  driverField: { marginBottom: 8 },
  sendBtn: { marginTop: 20 },
  sendBtnDisabled: { opacity: 0.55 },
});
