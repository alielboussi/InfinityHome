import { useCallback, useEffect, useState } from 'react';
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
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function DeliveryPrintModal({
  visible,
  locale,
  textAlign,
  deliveryNumber,
  driverName,
  supervisorName,
  printGroups,
  onDone,
}) {
  const [printers, setPrinters] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!visible) return;
    setSelectedId('');
    setError('');
    runScan();
  }, [visible, runScan]);

  const printNote = async (printerHint) => {
    setPrinting(true);
    setError('');
    try {
      const html = buildDeliveryNotePrintHtml({
        deliveryNumber,
        driverName,
        supervisorName,
        submittedAt: new Date().toISOString(),
        printGroups,
      });
      const file = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
      });
      await Print.printAsync({ uri: file.uri });
      if (printerHint?.name) {
        // Android opens system print UI; user picks the same printer as selected in our list.
      }
      onDone?.();
    } catch (err) {
      setError(err?.message || tUi('deliveryPrintFailed', locale));
    } finally {
      setPrinting(false);
    }
  };

  const onSelectPrinter = (printer) => {
    setSelectedId(printer.id);
    printNote(printer);
  };

  const onSystemPrint = () => {
    printNote(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, { textAlign }]}>{tUi('deliveryPrintTitle', locale)}</Text>
          <Text style={[styles.hint, { textAlign }]}>{tUi('deliveryPrintHint', locale)}</Text>

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
            onPress={onSystemPrint}
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
