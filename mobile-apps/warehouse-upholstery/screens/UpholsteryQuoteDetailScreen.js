import { formatProductionElapsed as formatElapsed } from '../shared/lib/formatProductionElapsed';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { kioskFooterBottomPad, kioskScreenEdges } from '../lib/kioskLayout';
import { tUi } from '../lib/productionKioskI18n';
import {
  acceptUpholsteryQuote,
  completeUpholsteryQuote,
  fetchProductionQuoteArabicTranslations,
  fetchUpholsteryProductionQuotes,
  pauseUpholsteryQuote,
  resumeUpholsteryQuote,
} from '../services/productionApi';
import ProductionJobMaterialsModal from '../components/ProductionJobMaterialsModal';
import { theme } from '../shared/theme';
import {
  QuoteProductionDrawingSection,
  QuoteProductionLineRows,
  useProductionQuoteArabicMap,
} from '../shared/quoteProductionOrderUi';
import { displayQuoteFieldValue } from '../shared/quoteArabicTranslate';



export default function UpholsteryQuoteDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const initialQuote = route.params?.quote || {};
  const [quote, setQuote] = useState(initialQuote);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const quoteId = String(quote.quote_id || initialQuote.quote_id || '');
  const startedAt = quote.run_started_at || quote.accepted_at;
  const [accepted, setAccepted] = useState(Boolean(quote.accepted_at));
  const [completed, setCompleted] = useState(Boolean(quote.completed_at));
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  const reloadQuote = useCallback(async () => {
    if (!quoteId) {
      setLoadingOrder(false);
      return;
    }
    setLoadingOrder(true);
    try {
      const list = await fetchUpholsteryProductionQuotes();
      const found = (Array.isArray(list) ? list : []).find(
        (q) => String(q.quote_id) === quoteId,
      );
      if (found) {
        setQuote(found);
        setAccepted(Boolean(found.accepted_at));
        setCompleted(Boolean(found.completed_at));
      }
    } catch {
      // keep route params
    } finally {
      setLoadingOrder(false);
    }
  }, [quoteId]);

  useFocusEffect(
    useCallback(() => {
      reloadQuote();
    }, [reloadQuote]),
  );

  const isPaused = useMemo(
    () => String(quote.timer_status || '').toLowerCase() === 'paused' || Boolean(quote.run_paused_at),
    [quote.timer_status, quote.run_paused_at],
  );
  const accumulatedMs = useMemo(
    () => Math.max(0, Number(quote.accumulated_ms) || 0),
    [quote.accumulated_ms],
  );

  useEffect(() => {
    if (!accepted || completed || !startedAt || isPaused) return undefined;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [accepted, completed, startedAt, isPaused]);

  const elapsedLabel = useMemo(() => {
    if (!accepted || completed) return '—';
    if (isPaused) return formatElapsed(accumulatedMs);
    if (!startedAt) return '—';
    const runningMs = Math.max(0, tick - new Date(startedAt).getTime());
    return formatElapsed(accumulatedMs + runningMs);
  }, [startedAt, accepted, completed, tick, isPaused, accumulatedMs]);

  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const arabicMap = useProductionQuoteArabicMap(
    lines,
    locale,
    fetchProductionQuoteArabicTranslations,
  );
  const customerName = displayQuoteFieldValue(locale, quote.customer_name, arabicMap) || '—';

  const onAccept = async () => {
    setBusy(true);
    try {
      await acceptUpholsteryQuote(quoteId);
      const nowIso = new Date().toISOString();
      setAccepted(true);
      setQuote((prev) => ({
        ...prev,
        accepted_at: nowIso,
        run_started_at: nowIso,
        timer_status: 'running',
        accumulated_ms: 0,
        run_paused_at: null,
      }));
    } catch (e) {
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const onPause = async () => {
    setBusy(true);
    try {
      const result = await pauseUpholsteryQuote(quoteId);
      const pausedAt = result?.paused_at || new Date().toISOString();
      const acc = Math.max(0, Number(result?.accumulated_ms) || accumulatedMs);
      setQuote((prev) => ({
        ...prev,
        timer_status: 'paused',
        run_paused_at: pausedAt,
        accumulated_ms: acc,
      }));
    } catch (e) {
      const msg = String(e?.message || '');
      const body = /unknown op/i.test(msg)
        ? tUi('quoteOrderPauseServerStale', locale)
        : msg;
      Alert.alert(tUi('quoteOrderFailed', locale), body);
    } finally {
      setBusy(false);
    }
  };

  const onResume = async () => {
    setBusy(true);
    try {
      const result = await resumeUpholsteryQuote(quoteId);
      const resumedAt = result?.resumed_at || new Date().toISOString();
      const acc = Math.max(0, Number(result?.accumulated_ms) || accumulatedMs);
      setQuote((prev) => ({
        ...prev,
        timer_status: 'running',
        run_paused_at: null,
        run_started_at: resumedAt,
        accumulated_ms: acc,
      }));
      setTick(Date.now());
    } catch (e) {
      const msg = String(e?.message || '');
      const body = /unknown op/i.test(msg)
        ? tUi('quoteOrderPauseServerStale', locale)
        : msg;
      Alert.alert(tUi('quoteOrderFailed', locale), body);
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
          onPress: async () => {
            setBusy(true);
            try {
              await completeUpholsteryQuote(quoteId);
              setCompleted(true);
              navigation.goBack();
            } catch (e) {
              Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const bottomPad = kioskFooterBottomPad(insets) + 32;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
    <ScrollView
      style={[kiosk.screen, styles.scroll]}
      contentContainerStyle={[kioskScreenEdges(insets, 0), { paddingBottom: bottomPad }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      nestedScrollEnabled
      keyboardDismissMode="on-drag"
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
      <Text style={[styles.name, { textAlign }]}>{customerName}</Text>
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
        <View style={styles.orderControlRow}>
          {isPaused ? (
            <Pressable
              style={[kiosk.btn, kiosk.btnPrimary, styles.orderControlBtn]}
              disabled={busy}
              onPress={onResume}
            >
              <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('quoteOrderResume', locale)}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[kiosk.btn, styles.orderControlBtn, styles.pauseBtn]}
              disabled={busy}
              onPress={onPause}
            >
              <Text style={kiosk.btnText}>{tUi('quoteOrderPause', locale)}</Text>
            </Pressable>
          )}
          <Pressable
            style={[kiosk.btn, styles.orderControlBtn, styles.danger]}
            disabled={busy}
            onPress={onComplete}
          >
            <Text style={kiosk.btnText}>{tUi('quoteOrderEnd', locale)}</Text>
          </Pressable>
        </View>
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
      {!completed && quote.sent_to_production_at ? (
        <Text style={[styles.materialsHint, { textAlign }]}>
          {tUi('quoteOrderMaterialsHint', locale)}
        </Text>
      ) : null}
      <Text style={[kiosk.label, styles.section, { textAlign }]}>{tUi('quoteOrderLines', locale)}</Text>
      <QuoteProductionLineRows
        lines={lines}
        route="upholstery"
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
        arabicMap={arabicMap}
      />
    </ScrollView>
    <ProductionJobMaterialsModal
      visible={materialsOpen}
      locale={locale}
      textAlign={textAlign}
      jobKind="quote"
      jobId={quoteId}
      productionRoute="upholstery"
      initialLines={quote.manual_material_lines || []}
      onClose={() => setMaterialsOpen(false)}
      onSaved={async () => {
        setMaterialsOpen(false);
        await reloadQuote();
      }}
    />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { flex: 1 },
  quoteNum: { color: theme.primary, fontWeight: '700', fontSize: 18, marginBottom: 4 },
  name: { color: theme.text, fontSize: 17, fontWeight: '600' },
  phone: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
  timerBox: { marginVertical: 16, padding: 16, backgroundColor: theme.surface, borderRadius: 12 },
  timerLabel: { color: theme.textMuted },
  timer: { color: theme.primary, fontSize: 28, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  actionBtn: { alignSelf: 'stretch', marginBottom: 8 },
  orderControlRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  orderControlBtn: { flex: 1, alignSelf: 'stretch' },
  pauseBtn: { backgroundColor: '#334155' },
  materialsHint: { color: theme.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  danger: { backgroundColor: '#7f1d1d' },
  section: { marginTop: 16, marginBottom: 8 },
  line: { color: theme.textSecondary, marginBottom: 4 },
  wrenchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wrenchRowText: { marginLeft: 4 },
});
