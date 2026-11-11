import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { kiosk } from './kioskStyles';
import { buildDeliveryNotePrintHtml } from '../lib/buildDeliveryNotePrintHtml';
import { discoverNetworkPrinters, isPrinterDiscoveryAvailable } from '../lib/discoverNetworkPrinters';
import { getDeliveryNoteCompanyLogoDataUri } from '../lib/deliveryNoteCompanyLogo';
import {
  isPrintConnectivityFailure,
  openDeliveryNoteHtmlInBrowser,
  printDeliveryNoteFromHtml,
} from '../lib/printDeliveryNoteHtml';
import { resolveDeliveryDriverSignatureDataUri } from '../lib/resolveDeliveryDriverSignatureDataUri';
import { openDeliveryNotePdf } from '../lib/openDeliveryNotePdf';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export const DEFAULT_DELIVERY_PRINT_COPIES = 2;
/** Sent-deliveries history reprint — always one copy in the PDF. */
export const DELIVERY_SENT_REPRINT_COPIES = 1;

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
  reprintMode = false,
  documentKind = 'delivery',
  customerName = '',
  customerPhone = '',
  onDone,
}) {
  const [printers, setPrinters] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [printAttemptDone, setPrintAttemptDone] = useState(false);
  const autoStarted = useRef(false);
  const isReturnDoc = documentKind === 'return' || documentKind === 'return_shipment';
  const isSoldDoc = documentKind === 'sold_delivery';

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const list = await discoverNetworkPrinters();
      setPrinters(Array.isArray(list) ? list : []);
    } catch {
      setPrinters([]);
    } finally {
      setScanning(false);
    }
  }, []);

  const isWeb = Platform.OS === 'web';
  const showLanList = !isWeb && isPrinterDiscoveryAvailable();

  const buildNoteHtml = useCallback(async () => {
    const copies = Math.max(1, Math.min(10, Number(copyCount) || DEFAULT_DELIVERY_PRINT_COPIES));
    const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUri().catch(() => '');
    const signatureSrc = await resolveDeliveryDriverSignatureDataUri({
      dataUri: driverSignatureDataUri,
      url: driverSignatureUrl,
    });
    return buildDeliveryNotePrintHtml({
      deliveryNumber,
      driverName,
      dispatchedBy: dispatchedBy || '',
      driverSignatureSrc: signatureSrc,
      companyLogoSrc,
      submittedAt: submittedAt || new Date().toISOString(),
      printGroups,
      copies,
      documentKind,
      customerName,
      customerPhone,
    });
  }, [
    copyCount,
    customerName,
    customerPhone,
    deliveryNumber,
    dispatchedBy,
    documentKind,
    driverName,
    driverSignatureDataUri,
    driverSignatureUrl,
    printGroups,
    submittedAt,
  ]);

  const printNote = useCallback(async () => {
    if (!String(deliveryNumber || '').trim()) {
      setError(tUi('deliverySubmitFailed', locale));
      setPrintAttemptDone(true);
      return;
    }
    if (!Array.isArray(printGroups) || !printGroups.length) {
      setError(tUi('deliveryPrintNoLines', locale));
      setPrintAttemptDone(true);
      return;
    }
    setPrinting(true);
    setError('');
    try {
      const html = await buildNoteHtml();
      await printDeliveryNoteFromHtml(html);
    } catch (err) {
      const msg = String(err?.message || '');
      const connectivity = isPrintConnectivityFailure(err);
      if (!connectivity && (/cancel/i.test(msg) || /did not complete/i.test(msg))) {
        setPrintAttemptDone(true);
        return;
      }
      setError(
        connectivity
          ? tUi('deliveryPrintTimeoutError', locale)
          : (msg || tUi('deliveryPrintFailed', locale)),
      );
    } finally {
      setPrinting(false);
      setPrintAttemptDone(true);
    }
  }, [
    buildNoteHtml,
    deliveryNumber,
    locale,
    printGroups,
  ]);

  const viewPdf = useCallback(async () => {
    if (!String(deliveryNumber || '').trim()) {
      setError(tUi('deliverySubmitFailed', locale));
      return;
    }
    if (!Array.isArray(printGroups) || !printGroups.length) {
      setError(tUi('deliveryPrintNoLines', locale));
      return;
    }
    setPrinting(true);
    setError('');
    try {
      const html = await buildNoteHtml();
      if (isWeb) {
        openDeliveryNoteHtmlInBrowser(html, deliveryNumber || 'Delivery note');
      } else {
        await openDeliveryNotePdf({
          deliveryNumber,
          driverName,
          dispatchedBy,
          driverSignatureDataUri,
          driverSignatureUrl,
          submittedAt,
          printGroups,
          copies: Math.max(1, Math.min(10, Number(copyCount) || DEFAULT_DELIVERY_PRINT_COPIES)),
        });
      }
    } catch (err) {
      setError(
        isPrintConnectivityFailure(err)
          ? tUi('deliveryPrintTimeoutError', locale)
          : (err?.message || tUi('sentDeliveryOpenFailed', locale)),
      );
    } finally {
      setPrinting(false);
    }
  }, [
    buildNoteHtml,
    copyCount,
    deliveryNumber,
    dispatchedBy,
    driverName,
    driverSignatureDataUri,
    driverSignatureUrl,
    isWeb,
    locale,
    printGroups,
    submittedAt,
  ]);

  useEffect(() => {
    if (!visible) {
      autoStarted.current = false;
      return;
    }
    setSelectedId('');
    setError('');
    setPrintAttemptDone(false);
    if (showLanList) runScan();
  }, [visible, runScan, showLanList]);

  useEffect(() => {
    if (!visible || !autoPrintOnOpen || autoStarted.current || printing) return;
    autoStarted.current = true;
    const timer = setTimeout(() => {
      printNote();
    }, 450);
    return () => clearTimeout(timer);
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
            {reprintMode
              ? tUi('deliveryPrintReprintTitle', locale)
              : (isSoldDoc
                ? tUi('soldPrintTitleCopies', locale).replace('{n}', String(copyCount || DEFAULT_DELIVERY_PRINT_COPIES))
                : isReturnDoc
                  ? tUi('returnPrintTitleCopies', locale).replace('{n}', String(copyCount || DEFAULT_DELIVERY_PRINT_COPIES))
                  : tUi('deliveryPrintTitleCopies', locale).replace('{n}', String(copyCount || DEFAULT_DELIVERY_PRINT_COPIES)))}
          </Text>
          <Text style={[styles.hint, { textAlign }]}>
            {isWeb
              ? tUi('deliveryPrintWebHint', locale)
              : reprintMode
                ? tUi('deliveryPrintReprintHint', locale)
                : (autoPrintOnOpen ? tUi('deliveryPrintAutoHint', locale) : tUi('deliveryPrintHint', locale))}
          </Text>

          {printing ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.busyText}>{tUi('deliveryPrintBusy', locale)}</Text>
            </View>
          ) : null}

          {showLanList ? (
            <>
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
                {!scanning && !printers.length ? (
                  <Text style={[styles.listEmpty, { textAlign }]}>
                    {tUi('deliveryPrintLanListOptional', locale)}
                  </Text>
                ) : null}
              </ScrollView>
            </>
          ) : null}

          <Pressable
            style={[kiosk.btnPrimaryBlock, styles.printBtn]}
            onPress={printNote}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={kiosk.btnPrimaryBlockText}>
                {isWeb ? tUi('deliveryPrintBrowserDialog', locale) : tUi('deliveryPrintSystemPicker', locale)}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[kiosk.btnOutlinePrimary, styles.viewPdfBtn]}
            onPress={viewPdf}
            disabled={printing}
          >
            <Text style={kiosk.btnOutlinePrimaryText}>{tUi('sentDeliveryViewPdf', locale)}</Text>
          </Pressable>

          {printAttemptDone && !printing ? (
            <View style={styles.retryBlock}>
              <Text style={[styles.retryHint, { textAlign }]}>
                {isReturnDoc
                  ? tUi('returnPrintRetryHint', locale)
                  : tUi('deliveryPrintRetryHint', locale)}
              </Text>
              <Pressable style={[kiosk.btnPrimaryBlock, styles.retryBtn]} onPress={printNote}>
                <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryPrintRetry', locale)}</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.skipBtn} onPress={onDone}>
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
  viewPdfBtn: { marginTop: 10 },
  listEmpty: { fontSize: 13, color: theme.muted, lineHeight: 19, paddingVertical: 8 },
  retryBlock: { marginTop: 14 },
  retryHint: { fontSize: 13, color: theme.muted, lineHeight: 19, marginBottom: 10 },
  retryBtn: { marginTop: 0 },
  skipBtn: { marginTop: 12, padding: 10, alignItems: 'center' },
  skipText: { color: theme.primary, fontWeight: '700' },
});
