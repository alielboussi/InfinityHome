import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import ProductionQrScanModal from '../productionKiosk/components/ProductionQrScanModal';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import {
  acceptCarpentryQuote,
  completeCarpentryQuote,
  fetchCarpentryProductionQuotes,
  scanCarpentryQuoteMaterial,
  sendCarpentryQuoteToPainting,
} from '../services/carpentryApi';
import ProductionJobMaterialsModal from '../productionKiosk/components/ProductionJobMaterialsModal';
import { theme } from '../shared/theme';
import {
  QuoteProductionDrawingSection,
  QuoteProductionLineRows,
} from '../shared/quoteProductionOrderUi';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function QuoteDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const initialQuote = route.params?.quote || {};
  const [quote, setQuote] = useState(initialQuote);
  const [loadingOrder, setLoadingOrder] = useState(() => !Array.isArray(initialQuote.lines));
  const quoteId = String(quote.quote_id || initialQuote.quote_id || '');
  const startedAt = quote.run_started_at || quote.accepted_at;
  const [accepted, setAccepted] = useState(Boolean(quote.accepted_at));
  const [completed, setCompleted] = useState(Boolean(quote.completed_at));
  const [tick, setTick] = useState(Date.now());
  const [scan, setScan] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  useEffect(() => {
    if (!quoteId || Array.isArray(quote.lines)) return;
    let alive = true;
    setLoadingOrder(true);
    fetchCarpentryProductionQuotes()
      .then((list) => {
        if (!alive) return;
        const found = (Array.isArray(list) ? list : []).find(
          (q) => String(q.quote_id) === quoteId,
        );
        if (found) {
          setQuote(found);
          setAccepted(Boolean(found.accepted_at));
          setCompleted(Boolean(found.completed_at));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingOrder(false);
      });
    return () => {
      alive = false;
    };
  }, [quoteId, quote.lines]);

  useEffect(() => {
    if (!accepted || completed || !startedAt) return undefined;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [accepted, completed, startedAt]);

  const elapsedLabel = useMemo(() => {
    if (!startedAt || !accepted || completed) return '—';
    return formatElapsed(tick - new Date(startedAt).getTime());
  }, [startedAt, accepted, completed, tick]);

  const lines = Array.isArray(quote.lines) ? quote.lines : [];

  const onAccept = async () => {
    setBusy(true);
    try {
      await acceptCarpentryQuote(quoteId);
      const nowIso = new Date().toISOString();
      setAccepted(true);
      setQuote((prev) => ({ ...prev, accepted_at: nowIso, run_started_at: nowIso }));
    } catch (e) {
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const finishQuote = async (sendToPainting) => {
    setBusy(true);
    try {
      await completeCarpentryQuote(quoteId);
      setCompleted(true);
      if (sendToPainting) {
        await sendCarpentryQuoteToPainting(quoteId);
        Alert.alert(
          tUi('quoteOrderEndConfirmTitle', locale),
          tUi('carpentryQuoteSentToPainting', locale),
        );
      } else {
        Alert.alert(tUi('quoteOrderEndConfirmTitle', locale), tUi('quoteOrderCompleteDone', locale));
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = () => {
    Alert.alert(
      tUi('quoteOrderEndConfirmTitle', locale),
      tUi('quoteOrderEndConfirmBody', locale),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('quoteOrderEnd', locale),
          onPress: () => finishQuote(false),
        },
        {
          text: tUi('quoteOrderEndSendPainting', locale),
          onPress: () => finishQuote(true),
        },
      ],
    );
  };

  const onScanSubmit = async (rawValue) => {
    const value = String(rawValue ?? scan).trim();
    if (!value) return;
    setBusy(true);
    try {
      if (!accepted) {
        await acceptCarpentryQuote(quoteId);
        const nowIso = new Date().toISOString();
        setAccepted(true);
        setQuote((prev) => ({ ...prev, accepted_at: nowIso, run_started_at: nowIso }));
      }
      await scanCarpentryQuoteMaterial(quoteId, value, 1);
      setScan('');
      Alert.alert(tUi('quoteOrderMaterials', locale), tUi('quoteOrderScanDeducted', locale));
    } catch (e) {
      Alert.alert(tUi('quoteOrderScanFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={[kiosk.screen, styles.flex]}
      contentContainerStyle={[kioskScreenEdgesSafe(insets, 16), { paddingBottom: 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <ProductionKioskTopBar
        title={tUi('quoteOrderScreenTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {loadingOrder ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />
      ) : null}
      <Text style={[styles.quoteNum, { textAlign }]}>{quote.quote_number || quoteId}</Text>
      <Text style={[styles.name, { textAlign }]}>{quote.customer_name || '—'}</Text>
      <Text style={[styles.phone, { textAlign }]}>{quote.customer_phone || '—'}</Text>
      <QuoteProductionDrawingSection
        drawingUrl={quote.drawing_url}
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
      />
      <View style={styles.timerBox}>
        <Text style={[styles.timerLabel, { textAlign }]}>{tUi('quoteOrderTimer', locale)}</Text>
        <Text style={styles.timer}>{elapsedLabel}</Text>
      </View>
      {!accepted && !completed ? (
        <Pressable style={[kiosk.btn, styles.actionBtn]} disabled={busy} onPress={onAccept}>
          <Text style={kiosk.btnText}>{tUi('quoteOrderAcceptStart', locale)}</Text>
        </Pressable>
      ) : null}
      {accepted && !completed ? (
        <Pressable style={[kiosk.btn, styles.actionBtn, styles.danger]} disabled={busy} onPress={onComplete}>
          <Text style={kiosk.btnText}>{tUi('quoteOrderEnd', locale)}</Text>
        </Pressable>
      ) : null}
      <Text style={[kiosk.label, styles.section, { textAlign }]}>{tUi('quoteOrderMaterials', locale)}</Text>
      {!completed && quote.sent_to_production_at ? (
        <Pressable
          style={[kiosk.btn, kiosk.btnPrimary, styles.actionBtn, styles.wrenchRow]}
          disabled={busy}
          onPress={() => setMaterialsOpen(true)}
        >
          <MaterialCommunityIcons name="wrench" size={22} color="#fff" />
          <Text style={[kiosk.btnText, kiosk.btnPrimaryText, styles.wrenchRowText]}>
            {tUi('quoteOrderMaterials', locale)}
          </Text>
        </Pressable>
      ) : null}
      <TextInput
        style={[kiosk.input, { textAlign: locale === 'ar' ? 'right' : 'left' }]}
        placeholder={tUi('quoteOrderScanPlaceholder', locale)}
        placeholderTextColor="#94a3b8"
        value={scan}
        onChangeText={setScan}
        onSubmitEditing={() => onScanSubmit()}
        editable={!completed && !busy}
      />
      <View style={styles.scanRow}>
        <Pressable style={[kiosk.btn, styles.actionBtn, styles.scanBtnFlex]} disabled={busy || completed} onPress={() => onScanSubmit()}>
          <Text style={kiosk.btnText}>{tUi('quoteOrderDeductScan', locale)}</Text>
        </Pressable>
        <Pressable
          style={[kiosk.btn, kiosk.btnPrimary, styles.actionBtn]}
          disabled={busy || completed}
          onPress={() => setScanOpen(true)}
        >
          <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('manufactureScanBtn', locale)}</Text>
        </Pressable>
      </View>
      <ProductionQrScanModal
        visible={scanOpen}
        locale={locale}
        onClose={() => setScanOpen(false)}
        onScan={(value) => {
          setScanOpen(false);
          onScanSubmit(value);
        }}
      />
      <Text style={[kiosk.label, styles.section, { textAlign }]}>{tUi('quoteOrderLines', locale)}</Text>
      <QuoteProductionLineRows
        lines={lines}
        route="carpentry"
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
      />
      <ProductionJobMaterialsModal
        visible={materialsOpen}
        locale={locale}
        textAlign={textAlign}
        jobKind="quote"
        jobId={quoteId}
        productionRoute="carpentry"
        initialLines={quote.manual_material_lines || []}
        onClose={() => setMaterialsOpen(false)}
        onSaved={async () => {
          setMaterialsOpen(false);
          try {
            const list = await fetchCarpentryProductionQuotes();
            const found = (Array.isArray(list) ? list : []).find((q) => String(q.quote_id) === quoteId);
            if (found) setQuote(found);
          } catch {
            // ignore
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  quoteNum: { color: theme.primary, fontWeight: '700', fontSize: 18, marginBottom: 4 },
  name: { color: theme.text, fontSize: 17, fontWeight: '600' },
  phone: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
  timerBox: { marginVertical: 16, padding: 16, backgroundColor: theme.surface, borderRadius: 12 },
  timerLabel: { color: theme.textMuted },
  timer: { color: theme.primary, fontSize: 28, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  actionBtn: { alignSelf: 'stretch', marginBottom: 8 },
  scanRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  scanBtnFlex: { flex: 1 },
  danger: { backgroundColor: '#7f1d1d' },
  section: { marginTop: 16, marginBottom: 8 },
  line: { color: theme.textSecondary, marginBottom: 4 },
  wrenchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wrenchRowText: { marginLeft: 4 },
});
