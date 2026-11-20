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
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { kioskFooterBottomPad, kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import {
  acceptCarpentryQuote,
  completeCarpentryQuote,
  fetchCarpentryProductionQuotes,
  fetchProductionQuoteArabicTranslations,
  handoffCarpentryQuoteLine,
  markCarpentryQuoteLineReady,
  pauseCarpentryQuote,
  resumeCarpentryQuote,
  sendCarpentryQuoteToPainting,
} from '../services/carpentryApi';
import ProductionJobMaterialsModal from '../productionKiosk/components/ProductionJobMaterialsModal';
import ConfirmTypeOkModal from '../productionKiosk/shared/components/ConfirmTypeOkModal';
import { theme } from '../shared/theme';
import { isFloor2ManufactureBlockError } from '../shared/floor2QuoteShortfall';
import { alertQuoteFloor2QtyCappedIfNeeded } from '../shared/quoteFloor2QtyCapAlert';
import {
  QuoteProductionFloor2ShortfallBanner,
  QuoteProductionLineSetBadge,
  QuoteProductionOrderBadges,
  productionQuoteDetailCustomerLabel,
  useProductionQuoteArabicMap,
} from '../shared/quoteProductionOrderUi';
import {
  QuoteProductionDispositionModal,
  QuoteProductionWorkshopLineRows,
} from '../productionKiosk/shared/quoteProductionPartialUi';
import { displayQuoteFieldValue } from '../shared/quoteArabicTranslate';
import {
  applyQuoteOrderTimerFrozenPatch,
  isQuoteOrderFullyCompleteLines,
} from '../shared/lib/quoteOrderTimerFreeze';

export default function QuoteDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const initialQuote = route.params?.quote || {};
  const [quote, setQuote] = useState(initialQuote);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const quoteId = String(quote.quote_id || initialQuote.quote_id || '');
  const productionLineSet = quote.production_line_set || initialQuote.production_line_set || null;
  const cardListId = String(quote.production_card_id || initialQuote.production_card_id || quoteId);
  const startedAt = quote.run_started_at || quote.accepted_at;
  const [accepted, setAccepted] = useState(Boolean(quote.accepted_at));
  const [completed, setCompleted] = useState(Boolean(quote.completed_at));
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [endConfirmVisible, setEndConfirmVisible] = useState(false);
  const [endDestVisible, setEndDestVisible] = useState(false);

  const reloadQuote = useCallback(async ({ quiet = false } = {}) => {
    if (!quoteId) {
      setLoadingOrder(false);
      return;
    }
    if (!quiet) setLoadingOrder(true);
    try {
      const list = await fetchCarpentryProductionQuotes();
      const found = (Array.isArray(list) ? list : []).find(
        (q) => String(q.production_card_id || q.quote_id) === cardListId,
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
  }, [quoteId, cardListId]);

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
    if (!accepted) return '—';
    if (completed) {
      const frozen = Math.max(0, Number(quote.accumulated_ms) || accumulatedMs);
      return frozen > 0 ? formatElapsed(frozen) : '—';
    }
    if (isPaused) return formatElapsed(accumulatedMs);
    if (!startedAt) return '—';
    const runningMs = Math.max(0, tick - new Date(startedAt).getTime());
    return formatElapsed(accumulatedMs + runningMs);
  }, [startedAt, accepted, completed, tick, isPaused, accumulatedMs]);

  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const arabicExtraPhrases = useMemo(
    () => [quote.customer_name, quote.customer_phone].map((s) => String(s || '').trim()).filter(Boolean),
    [quote.customer_name, quote.customer_phone],
  );
  const arabicMap = useProductionQuoteArabicMap(
    lines,
    locale,
    fetchProductionQuoteArabicTranslations,
    arabicExtraPhrases,
  );
  const customerName = productionQuoteDetailCustomerLabel(
    quote,
    tUi,
    locale,
    arabicMap,
    displayQuoteFieldValue,
  );

  const onAccept = async () => {
    const snapshot = quote;
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
    setBusy(true);
    try {
      await acceptCarpentryQuote(quoteId, { productionLineSet });
    } catch (e) {
      setAccepted(Boolean(snapshot.accepted_at));
      setQuote(snapshot);
      const msg = e?.message || '';
      if (isFloor2ManufactureBlockError(msg)) {
        Alert.alert(
          tUi('quoteOrderFailed', locale),
          msg,
          [
            { text: tUi('quoteOpenManufacture', locale), onPress: () => navigation.navigate('Manufacture') },
            { text: tUi('close', locale), style: 'cancel' },
          ],
        );
      } else {
        Alert.alert(tUi('quoteOrderFailed', locale), msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPause = async () => {
    const snapshot = quote;
    const pausedAt = new Date().toISOString();
    setQuote((prev) => ({
      ...prev,
      timer_status: 'paused',
      run_paused_at: pausedAt,
      accumulated_ms: accumulatedMs,
    }));
    setBusy(true);
    try {
      const result = await pauseCarpentryQuote(quoteId, { productionLineSet });
      const acc = Math.max(0, Number(result?.accumulated_ms) || accumulatedMs);
      setQuote((prev) => ({
        ...prev,
        timer_status: 'paused',
        run_paused_at: result?.paused_at || pausedAt,
        accumulated_ms: acc,
      }));
    } catch (e) {
      setQuote(snapshot);
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
    const snapshot = quote;
    const resumedAt = new Date().toISOString();
    setQuote((prev) => ({
      ...prev,
      timer_status: 'running',
      run_paused_at: null,
      run_started_at: resumedAt,
      accumulated_ms: accumulatedMs,
    }));
    setTick(Date.now());
    setBusy(true);
    try {
      const result = await resumeCarpentryQuote(quoteId, { productionLineSet });
      const acc = Math.max(0, Number(result?.accumulated_ms) || accumulatedMs);
      setQuote((prev) => ({
        ...prev,
        timer_status: 'running',
        run_paused_at: null,
        run_started_at: result?.resumed_at || resumedAt,
        accumulated_ms: acc,
      }));
    } catch (e) {
      setQuote(snapshot);
      const msg = String(e?.message || '');
      const body = /unknown op/i.test(msg)
        ? tUi('quoteOrderPauseServerStale', locale)
        : msg;
      Alert.alert(tUi('quoteOrderFailed', locale), body);
    } finally {
      setBusy(false);
    }
  };

  const freezeTimerIfOrderComplete = useCallback(() => {
    if (!isQuoteOrderFullyCompleteLines(lines)) return;
    setQuote((prev) => applyQuoteOrderTimerFrozenPatch(prev, { tick }));
    setCompleted(true);
  }, [lines, tick]);

  const finishQuote = async ({ sendToPainting = false, destination = 'delivery' } = {}) => {
    setQuote((prev) => applyQuoteOrderTimerFrozenPatch(prev, { tick }));
    setCompleted(true);
    setBusy(true);
    const finishNotice = sendToPainting
      ? tUi('carpentryQuoteSentToPainting', locale)
      : tUi('quoteOrderCompleteDone', locale);
    try {
      const result = await completeCarpentryQuote(quoteId, {
        deferDeliveryQueue: Boolean(sendToPainting),
        destination: sendToPainting ? 'delivery' : destination,
        sendToPainting: Boolean(sendToPainting),
        productionLineSet,
      });
      if (sendToPainting && !result?.sent_to_painting) {
        await sendCarpentryQuoteToPainting(quoteId);
      }
      setBusy(false);
      navigation.navigate({
        name: 'Quotes',
        params: { finishNotice },
        merge: true,
      });
    } catch (e) {
      setBusy(false);
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
    }
  };

  const showEndDestinationAlert = () => {
    setEndDestVisible(true);
  };

  const onComplete = () => {
    setEndConfirmVisible(true);
  };

  const bottomPad = kioskFooterBottomPad(insets) + 32;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={[kiosk.screen, styles.scroll]}
        contentContainerStyle={[kioskScreenEdgesSafe(insets, 16), { paddingBottom: bottomPad }]}
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
        <QuoteProductionOrderBadges quote={quote} textAlign={textAlign} tUi={tUi} locale={locale} />
        <QuoteProductionLineSetBadge quote={quote} textAlign={textAlign} tUi={tUi} locale={locale} />
        <QuoteProductionFloor2ShortfallBanner quote={quote} textAlign={textAlign} tUi={tUi} locale={locale} />
        <Text style={[styles.name, { textAlign }]}>{customerName}</Text>
        <Text style={[styles.phone, { textAlign }]}>{quote.customer_phone || '—'}</Text>
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
        {!completed && quote.sent_to_production_at && productionLineSet !== 'floor2_wip' ? (
          <Text style={[styles.materialsHint, { textAlign }]}>
            {tUi('quoteOrderMaterialsFloor2Hint', locale)}
          </Text>
        ) : null}
        <Text style={[kiosk.label, styles.section, { textAlign }]}>{tUi('quoteOrderLines', locale)}</Text>
        <QuoteProductionWorkshopLineRows
          lines={lines}
          route="carpentry"
          textAlign={textAlign}
          tUi={tUi}
          locale={locale}
          arabicMap={arabicMap}
          orderOpen={accepted && !completed}
          allowPaintingHandoff
          allowFloor1Handoff
          allowDeliveryHandoff={false}
          onMarkReady={async (line, qty) => {
            const markResult = await markCarpentryQuoteLineReady(quoteId, line.id, qty, { productionLineSet });
            alertQuoteFloor2QtyCappedIfNeeded(markResult, { tUi, locale });
            const add = Math.max(
              1,
              Math.floor(Number(markResult?.ready_qty ?? qty) || 0),
            );
            setQuote((prev) => {
              const nextLines = (Array.isArray(prev.lines) ? prev.lines : []).map((row) => {
                if (String(row.id) !== String(line.id)) return row;
                const ordered = Math.max(
                  Number(row.ordered_qty) || Number(row.quantity) || 1,
                  1,
                );
                const done = Math.max(Number(row.production_completed_qty) || 0, 0) + add;
                return {
                  ...row,
                  production_completed_qty: done,
                  production_remaining_qty: Math.max(0, ordered - done),
                };
              });
              return { ...prev, lines: nextLines };
            });
            void reloadQuote({ quiet: true });
            return markResult;
          }}
          onHandoffWillStart={freezeTimerIfOrderComplete}
          onHandoff={async (line, target, qty) => {
            const result = await handoffCarpentryQuoteLine(quoteId, line.id, target, qty);
            if (result?.order_completed) {
              navigation.goBack();
              return;
            }
            const list = await fetchCarpentryProductionQuotes();
            const found = (Array.isArray(list) ? list : []).find(
              (q) => String(q.production_card_id || q.quote_id) === cardListId,
            );
            const nextLines = Array.isArray(found?.lines) ? found.lines : [];
            if (found) {
              setQuote(found);
              setAccepted(Boolean(found.accepted_at));
              setCompleted(Boolean(found.completed_at));
            }
            if (isQuoteOrderFullyCompleteLines(nextLines) && !found?.completed_at) {
              setQuote((prev) => applyQuoteOrderTimerFrozenPatch(prev, { tick }));
              setCompleted(true);
              setEndDestVisible(true);
              return;
            }
            void reloadQuote({ quiet: true });
          }}
        />
      </ScrollView>
      <ConfirmTypeOkModal
        visible={endConfirmVisible}
        title={tUi('quoteOrderEndConfirmTitle', locale)}
        message={tUi('quoteOrderEndConfirmBody', locale)}
        typeHint={tUi('quoteOrderEndTypeOkHint', locale)}
        confirmLabel={tUi('quoteOrderEnd', locale)}
        cancelLabel={tUi('cancel', locale)}
        textAlign={textAlign}
        onCancel={() => setEndConfirmVisible(false)}
        onConfirm={() => {
          setEndConfirmVisible(false);
          showEndDestinationAlert();
        }}
      />
      <QuoteProductionDispositionModal
        visible={endDestVisible}
        title={tUi('quoteOrderDispositionTitle', locale)}
        message={tUi('quoteOrderCarpentryDispositionPrompt', locale)}
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
        choices={[
          { key: 'floor1', label: tUi('quoteLineHandoffFloor1', locale) },
          { key: 'painting', label: tUi('quoteLineHandoffPainting', locale) },
        ]}
        onPick={(key) => {
          setEndDestVisible(false);
          if (key === 'painting') void finishQuote({ sendToPainting: true });
          else void finishQuote({ destination: 'floor1' });
        }}
        onCancel={() => setEndDestVisible(false)}
      />
      <ProductionJobMaterialsModal
        visible={materialsOpen}
        locale={locale}
        textAlign={textAlign}
        jobKind="quote"
        jobId={quoteId}
        productionRoute="carpentry"
        initialLines={quote.manual_material_lines || []}
        allowFloor2WipDeduction={false}
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
  wrenchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wrenchRowText: { marginLeft: 4 },
});
