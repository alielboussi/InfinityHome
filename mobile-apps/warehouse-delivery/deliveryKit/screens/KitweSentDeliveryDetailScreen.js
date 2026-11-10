import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DeliveryPrintModal, { DELIVERY_SENT_REPRINT_COPIES } from '../components/DeliveryPrintModal';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { fetchDeliverySentDetail } from '../lib/deliverySentApi';
import { openDeliveryNotePdf } from '../lib/openDeliveryNotePdf';
import { formatZambiaDate, formatZambiaTime } from '../lib/zambiaDateTime';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function KitweSentDeliveryDetailScreen({ route, navigation }) {
  const sessionId = route.params?.sessionId || '';
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchDeliverySentDetail(sessionId);
      setDetail(data);
    } catch (err) {
      if (err?.code === 'api_not_deployed') {
        setError(tUi('sentDeliveriesServerPending', locale));
      } else {
        setError(err?.message || tUi('sentDeliveriesLoadFailed', locale));
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, locale]);

  useEffect(() => {
    load();
  }, [load]);

  const session = detail?.session;
  const printGroups = detail?.print_groups || [];
  const customerSentLines = detail?.customer_sent_lines || [];

  const noteNumber = session?.display_number || session?.delivery_number || '';
  const documentKind = session?.document_kind || 'delivery';

  const noteFields = session ? {
    deliveryNumber: noteNumber,
    driverName: session.driver_name,
    dispatchedBy: session.dispatched_by_name,
    driverSignatureSrc: detail?.driver_signature_data_uri || session.driver_signature_url,
    driverSignatureDataUri: detail?.driver_signature_data_uri || '',
    driverSignatureUrl: session.driver_signature_url || '',
    submittedAt: session.submitted_at,
    printGroups,
    copies: DELIVERY_SENT_REPRINT_COPIES,
    documentKind,
    customerName: session.customer_name || '',
    customerPhone: session.customer_phone || '',
  } : null;

  const onViewPdf = async () => {
    if (!noteFields) return;
    setPdfBusy(true);
    setError('');
    try {
      await openDeliveryNotePdf(noteFields);
    } catch (err) {
      setError(err?.message || tUi('sentDeliveryOpenFailed', locale));
    } finally {
      setPdfBusy(false);
    }
  };

  const when = session?.submitted_at || '';
  const dateStr = when ? formatZambiaDate(when) : '—';
  const timeStr = when ? formatZambiaTime(when) : '—';

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <ProductionKioskTopBar
          title={tUi('sentDeliveryDetailTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
        ) : null}

        {session ? (
          <View style={kiosk.card}>
            <Text style={[kiosk.heroNumber, { textAlign }]}>{noteNumber}</Text>
            {session.delivery_number && noteNumber !== session.delivery_number ? (
              <Text style={[kiosk.metaLine, { textAlign }]}>
                {tUi('sentDeliveryRefWhd', locale)}: {session.delivery_number}
              </Text>
            ) : null}
            <Text style={[kiosk.metaLine, { textAlign }]}>
              {tUi('sentDeliverySubmittedAt', locale)}: {dateStr} · {timeStr} (Zambia)
            </Text>
            <Text style={[kiosk.metaLine, { textAlign }]}>
              {tUi('sentDeliveryDriver', locale)}: {session.driver_name || '—'}
            </Text>
            <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
              {tUi('sentDeliveryDispatchedBy', locale)}: {session.dispatched_by_name || '—'}
            </Text>
          </View>
        ) : null}

        {session && !loading && customerSentLines.length ? (
          <View style={[kiosk.card, { marginTop: 12 }]}>
            <Text style={[kiosk.sectionTitle, { textAlign, marginBottom: 8 }]}>
              {tUi('sentToCustomerTitle', locale)}
            </Text>
            {customerSentLines.map((line) => (
              <Text key={line.id} style={[kiosk.metaLine, { textAlign }]}>
                {line.label}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={[kiosk.errText, { textAlign }]}>{error}</Text> : null}

        {session && !loading ? (
          <>
            <Pressable
              style={[kiosk.btnOutlinePrimary, styles.btn]}
              onPress={onViewPdf}
              disabled={pdfBusy}
            >
              {pdfBusy ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Text style={kiosk.btnOutlinePrimaryText}>{tUi('sentDeliveryViewPdf', locale)}</Text>
              )}
            </Pressable>
            <Pressable
              style={[kiosk.btnPrimaryBlock, styles.btn]}
              onPress={() => setPrintOpen(true)}
            >
              <Text style={kiosk.btnPrimaryBlockText}>{tUi('sentDeliveryPrintOne', locale)}</Text>
            </Pressable>
          </>
        ) : null}
      </KioskSafeScroll>

      {session ? (
        <DeliveryPrintModal
          visible={printOpen}
          locale={locale}
          textAlign={textAlign}
          deliveryNumber={noteNumber}
          driverName={session.driver_name}
          dispatchedBy={session.dispatched_by_name}
          driverSignatureUrl={session.driver_signature_url}
          driverSignatureDataUri={detail?.driver_signature_data_uri || ''}
          printGroups={printGroups}
          submittedAt={session.submitted_at}
          copyCount={DELIVERY_SENT_REPRINT_COPIES}
          documentKind={documentKind}
          customerName={session.customer_name || ''}
          customerPhone={session.customer_phone || ''}
          reprintMode
          autoPrintOnOpen={false}
          onDone={() => setPrintOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingBottom: 16 },
  btn: { marginTop: 14 },
});
