import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import { kiosk } from './kioskStyles';
import { buildDeliveryNotePrintHtml } from '../lib/buildDeliveryNotePrintHtml';
import { discoverNetworkPrinters, isPrinterDiscoveryAvailable } from '../lib/discoverNetworkPrinters';
import { getDeliveryNoteCompanyLogoDataUri } from '../lib/deliveryNoteCompanyLogo';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export const DEFAULT_DELIVERY_PRINT_COPIES = 2;

export default function DeliveryPrintModal({
  visible,
  locale,
  textAlign,
  deliveryNumber,
  driverName,
  dispatchedBy,
  driverSignatureDataUri,
  driverSignatureUrl,
  printGroups,
  submittedAt,
  copyCount = DEFAULT_DELIVERY_PRINT_COPIES,
  autoPrintOnOpen = false,
  onDone,
}) {
  const [printers, setPrinters] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const autoStarted = useRef(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError('');
    try {
      const list = await discoverNetworkPrinters();
      setPrinters(list);
      if (!list.length && isPrinterDiscoveryAvailable()) {
        setError(tUi('deliveryPrintNoPrinters', locale));
      } else if (!isPrinterDiscoveryAvailable()) {
        setError(tUi('deliveryPrintDiscoveryUnavailable', locale));
      }
    } catch {
      setError(tUi('deliveryPrintScanFailed', locale));
    } finally {
      setScanning(false);
    }
  }, [locale]);

  const printNote = useCallback(async () => {
    setPrinting(true);
    setError('');
    try {
      const copies = Math.max(1, Math.min(10, Number(copyCount) || DEFAULT_DELIVERY_PRINT_COPIES));
      const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUri().catch(() => '');
      const html = buildDeliveryNotePrintHtml({
        deliveryNumber,
        driverName,
        dispatchedBy: dispatchedBy || '',
        driverSignatureSrc: driverSignatureDataUri || driverSignatureUrl || '',
        companyLogoSrc,
        submittedAt: submittedAt || new Date().toISOString(),
        printGroups,
        copies,
      });
      const file = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
      });
      await Print.printAsync({ uri: file.uri });
      onDone?.();
    } catch (err) {
      setError(err?.message || tUi('deliveryPrintFailed', locale));
    } finally {
      setPrinting(false);
    }
  }, [
    copyCount,
    deliveryNumber,
    dispatchedBy,
    driverName,
    driverSignatureDataUri,
    driverSignatureUrl,
    onDone,
    printGroups,
    submittedAt,
    locale,
  ]);

  useEffect(() => {
    if (!visible) {
      autoStarted.current = false;
      return;
    }
    setSelectedId('');
    setError('');
    runScan();
  }, [visible, runScan]);

  useEffect(() => {
    if (!visible || !autoPrintOnOpen || autoStarted.current || printing) return;
    autoStarted.current = true;
    printNote();
  }, [visible, autoPrintOnOpen, printing, printNote]);

  const onSelectPrinter = (printer) => {
    setSelectedId(printer.id);
    printNote();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, { textAlign }]}>
            {tUi('deliveryPrintTitleCopies', locale).replace('{n}', String(copyCount || DEFAULT_DELIVERY_PRINT_COPIES))}
          </Text>
          <Text style={[styles.hint, { textAlign }]}>
            {autoPrintOnOpen ? tUi('deliveryPrintAutoHint', locale) : tUi('deliveryPrintHint', locale)}
          </Text>

          {printing ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.busyText}>{tUi('deliveryPrintBusy', locale)}</Text>
            </View>
          ) : null}

          <Pressable
            style={[kiosk.btnOutlinePrimary, styles.scanBtn]}
            onPress={runScan}
            disabled={scanning || printing}
          >
            {scanning ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={kiosk.btnOutlinePrimaryText}>{tUi('deliveryPrintRescan', locale)}</Text>
            )}
          </Pressable>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {printers.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.row, selectedId === p.id && styles.rowOn]}
                onPress={() => onSelectPrinter(p)}
                disabled={printing}
              >
                <Text style={styles.rowTitle}>{p.name}</Text>
                <Text style={styles.rowSub}>{p.host}{p.port ? `:${p.port}` : ''}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            style={[kiosk.btnPrimaryBlock, styles.printBtn]}
            onPress={printNote}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryPrintSystemPicker', locale)}</Text>
            )}
          </Pressable>

          <Pressable style={styles.skipBtn} onPress={onDone} disabled={printing}>
            <Text style={styles.skipText}>{tUi('deliveryPrintSkip', locale)}</Text>
          </Pressable>

          {error ? <Text style={[kiosk.errText, { textAlign }]}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 8 },
  hint: { fontSize: 14, color: theme.muted, lineHeight: 20, marginBottom: 12 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  busyText: { color: theme.text, fontSize: 14, flex: 1 },
  scanBtn: { marginBottom: 10 },
  list: { maxHeight: 220, marginBottom: 10 },
  row: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceElevated,
    marginBottom: 8,
  },
  rowOn: { borderColor: theme.primary, backgroundColor: theme.primaryBg },
  rowTitle: { color: theme.text, fontWeight: '700', fontSize: 15 },
  rowSub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  printBtn: { marginTop: 4 },
  skipBtn: { marginTop: 12, padding: 10, alignItems: 'center' },
  skipText: { color: theme.primary, fontWeight: '700' },
});
