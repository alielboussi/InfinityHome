// @refresh reset — full remount (avoids stale jobFilter after chips were removed).
import QuoteOrderElapsed from '../shared/components/QuoteOrderElapsed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk, KIOSK_ICON_BLUE_ON_DARK } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { isJobAwaitingDelivery } from '../shared/lib/deliveryAdminDisplayStatus';
import { tUi, textForDisplay } from '../productionKiosk/lib/productionKioskI18n';
import ProductionPressableHint from '../productionKiosk/lib/ProductionPressableHint';
import {
  fetchCarpentryProductionJobs,
  fetchCarpentryProductionQuotes,
  finishCarpentryProductionJob,
  fetchProductionStoreroomMaterials,
  pauseCarpentryProductionJob,
  resumeCarpentryProductionJob,
  acceptCarpentryQuote,
  pauseCarpentryQuote,
  resumeCarpentryQuote,
  completeCarpentryQuote,
  markCarpentryQuoteLineReady,
  handoffCarpentryQuoteLine,
} from '../services/carpentryApi';
import StoreroomDeductionPromptModal from '../productionKiosk/shared/components/StoreroomDeductionPromptModal';
import ConfirmTypeOkModal from '../productionKiosk/shared/components/ConfirmTypeOkModal';
import {
  carpentryFinishNeedsStoreroomPick,
  parseStoreroomsFromMaterialsApi,
  storeroomDeductionStrings,
} from '../productionKiosk/shared/lib/storeroomDeductionFlow';
import ProductionJobMaterialsModal from '../productionKiosk/components/ProductionJobMaterialsModal';
import { QuoteProductionOrderBadges } from '../shared/quoteProductionOrderUi';
import { QuoteProductionDispositionModal, QuoteProductionWorkshopLineRows } from '../productionKiosk/shared/quoteProductionPartialUi';
import { theme } from '../shared/theme';
import RunningJobElapsed from '../productionKiosk/components/RunningJobElapsed';
import JobMaterialsInlineList from '../shared/components/JobMaterialsInlineList';
import { subscribeProductionRefresh } from '../productionKiosk/lib/productionRefreshBus';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { Image } from 'react-native';
import {
  mergeJobInList,
  optimisticPauseJobPatch,
  optimisticResumeJobPatch,
  serverJobPatchFromResponse,
} from '../shared/lib/productionJobTimerOptimistic';
import { alertProductionFinishDisposition } from '../shared/lib/productionFinishDispositionAlert';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import {
  mergeReturnOrderRow,
  optimisticReturnTimerRow,
} from '../shared/lib/repairReturnQueueUi';
import WorkshopRepairInboxCard from '../shared/components/WorkshopRepairInboxCard';
import { WorkshopJobInboxBadges } from '../shared/components/WorkshopInboxKindBadges';
import { repairSearchBlob } from '../shared/lib/productionInboxKinds';
import RunningRepairElapsed from '../productionKiosk/components/RunningRepairElapsed';

function normalizeSearchDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeQuoteKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^qt[#\s]*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function jobsSearchBlob(item) {
  if (item?._kind === 'repair') {
    return repairSearchBlob(item.repair);
  }
  if (item?._kind === 'quote') {
    const quote = item.quote || {};
    return {
      quoteKeys: [quote.quote_number, quote.quote_id, quote.id].map(normalizeQuoteKey).filter(Boolean),
      name: String(quote.customer_name || '').toLowerCase(),
      phone: normalizeSearchDigits(quote.customer_phone),
    };
  }
  const job = item?.job || {};
  const meta = job.metadata && typeof job.metadata === 'object' ? job.metadata : {};
  return {
    quoteKeys: [job.quote_number, meta.quote_number, job.quote_id, meta.quote_id]
      .map(normalizeQuoteKey)
      .filter(Boolean),
    name: String(job.customer_name || meta.customer_name || '').toLowerCase(),
    phone: normalizeSearchDigits(job.customer_phone || meta.customer_phone),
  };
}

function matchesJobsSearch(item, rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return true;
  const blob = jobsSearchBlob(item);
  const qLower = query.toLowerCase();
  const qQuote = normalizeQuoteKey(query);
  const qDigits = normalizeSearchDigits(query);
  if (qQuote && blob.quoteKeys.some((key) => key.includes(qQuote))) return true;
  if (qLower && blob.name.includes(qLower)) return true;
  if (qDigits.length >= 3 && blob.phone.includes(qDigits)) return true;
  if (qDigits && blob.quoteKeys.some((key) => key.includes(qDigits))) return true;
  return false;
}

function QuoteOrderJobCard({
  quote, locale, textAlign, busy, onMaterials, onPlay, onPause, onStop, onQuoteLinesChanged,
}) {
  const canMaterials = Boolean(quote?.sent_to_production_at || quote?.sent_to_production) && !quote?.completed_at;
  const accepted = Boolean(quote?.accepted_at);
  const paused = String(quote?.timer_status || '').toLowerCase() === 'paused' || Boolean(quote?.run_paused_at);
  const canPlay = !accepted || paused;
  const canPause = accepted && !paused;
  const showroom = String(quote?.showroom_order) === 'true' || quote?.showroom_order === true;
  const orderOpen = accepted && !quote?.completed_at;
  return (
    <View style={[kiosk.card, styles.jobCard]}>
        <Text style={styles.quoteBadgeRight}>
          {quote.quote_number || quote.quote_id}
        </Text>
        <QuoteProductionOrderBadges quote={quote} textAlign={textAlign} tUi={tUi} locale={locale} align="center" />
        <Text style={styles.jobTitleCenter}>
          {showroom
            ? tUi('showroomOrderDetailLabel', locale)
            : (quote.customer_name || '—')}
        </Text>
        <Text style={styles.jobMetaCenter}>
          {showroom ? '—' : (quote.customer_phone || '—')}
        </Text>
        <View style={styles.timerRowCenter}>
          <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
          <QuoteOrderElapsed quote={quote} style={styles.timerValue} />
          <Text style={styles.statusChip}>
            {quote.accepted_at ? tUi('carpentryQuoteInProduction', locale) : tUi('carpentryQuoteAwaiting', locale)}
          </Text>
        </View>
        <QuoteProductionWorkshopLineRows
          lines={quote.lines}
          route="carpentry"
          textAlign={textAlign}
          tUi={tUi}
          locale={locale}
          orderOpen={orderOpen}
          allowPaintingHandoff
          allowFloor1Handoff
          allowDeliveryHandoff={false}
          onMarkReady={(line, qty) => markCarpentryQuoteLineReady(
            quote.quote_id,
            line.id,
            qty,
            { productionLineSet: quote.production_line_set },
          )}
          onHandoff={async (line, target, qty) => {
            await handoffCarpentryQuoteLine(quote.quote_id, line.id, target, qty);
            onQuoteLinesChanged?.();
          }}
        />
      {quote?.completed_at ? (
        <Text style={[kiosk.metaLine, { textAlign: 'center' }]}>
          {tUi('quoteOrderLockedViewOnly', locale)}
        </Text>
      ) : (
      <View style={styles.iconRow}>
        {canPlay ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onPlay?.(quote)}
            accessibilityLabel={tUi('quoteOrderAcceptStart', locale)}
          >
            <MaterialCommunityIcons name="play-circle" size={52} color="#22c55e" />
            <Text style={styles.iconCaption}>{tUi('quoteOrderAcceptStart', locale)}</Text>
          </Pressable>
        ) : null}
        {canPause ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onPause?.(quote)}
            accessibilityLabel={tUi('quoteOrderPause', locale)}
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color="#f59e0b" />
            <Text style={styles.iconCaption}>{tUi('quoteOrderPause', locale)}</Text>
          </Pressable>
        ) : null}
        {canMaterials ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onMaterials?.(quote)}
            accessibilityLabel={tUi('quoteOrderMaterials', locale)}
          >
            <MaterialCommunityIcons name="wrench" size={48} color="#38bdf8" />
            <Text style={styles.iconCaption}>{tUi('quoteOrderMaterials', locale)}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.iconBtn}
          disabled={busy || !accepted}
          onPress={() => onStop?.(quote)}
          accessibilityLabel={tUi('quoteOrderEnd', locale)}
        >
          <MaterialCommunityIcons name="stop-circle" size={52} color={theme.danger} />
          <Text style={styles.iconCaption}>{tUi('quoteOrderEnd', locale)}</Text>
        </Pressable>
      </View>
      )}
    </View>
  );
}

function resolveCarpentryJobImage(job) {
  const raw = String(
    job?.floor2_image_url || job?.product_image_url || job?.image_url || '',
  ).trim();
  return raw ? resolveProductImageUrl(raw) : '';
}

function JobCard({
  job, locale, textAlign, busy, timerLocked, onPause, onPlay, onFinish, onMaterials,
}) {
  const isCompleted = job.status === 'completed';
  const isRunning = job.status === 'running';
  const thumb = resolveCarpentryJobImage(job);
  const showJobPhoto = Boolean(thumb) && !isCompleted;
  const canPlay = job.status === 'ready' || job.status === 'paused';

  return (
    <ProductionPressableHint
      hintKey="hintJobCard"
      locale={locale}
      textAlign={textAlign}
      style={[kiosk.card, styles.jobCard]}
    >
      <WorkshopJobInboxBadges job={job} locale={locale} textAlign={textAlign} tUi={tUi} />
      <View style={styles.productRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.jobTitle, { textAlign }]}>{textForDisplay(job.product_name || job.raw_name, '—')}</Text>
          <Text style={[styles.jobMeta, { textAlign }]}>
            {textForDisplay(job.product_sku || job.raw_name || '', '')}
          </Text>
        </View>
        {showJobPhoto ? (
          <Image source={{ uri: thumb }} style={styles.thumbInline} resizeMode="cover" />
        ) : null}
      </View>
      {job.dimensions_display ? (
        <Text style={[styles.jobDims, { textAlign }]}>{job.dimensions_display}</Text>
      ) : null}
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
        <RunningJobElapsed job={job} style={styles.timerValue} />
        <Text style={styles.statusChip}>
          {isJobAwaitingDelivery(job)
            ? tUi('upholsteryJobStatus_completedAwaitingDelivery', locale)
            : tUi(`upholsteryJobStatus_${job.status}`, locale)}
        </Text>
      </View>

      <View style={styles.iconRow}>
        {canPlay ? (
          <ProductionPressableHint
            hintKey="hintJobPlay"
            locale={locale}
            textAlign={textAlign}
            disabled={busy || Boolean(timerLocked)}
            onPress={() => onPlay(job.job_id || job.id)}
            style={styles.iconBtn}
            accessibilityLabel={tUi('upholsteryJobResume', locale)}
          >
            <MaterialCommunityIcons name="play-circle" size={52} color="#22c55e" />
          </ProductionPressableHint>
        ) : null}
        {isRunning ? (
          <ProductionPressableHint
            hintKey="hintJobPause"
            locale={locale}
            textAlign={textAlign}
            disabled={busy || Boolean(timerLocked)}
            onPress={() => onPause(job.job_id || job.id)}
            style={styles.iconBtn}
            accessibilityLabel={tUi('upholsteryJobPause', locale)}
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color="#f59e0b" />
          </ProductionPressableHint>
        ) : null}
        {!isCompleted ? (
          <ProductionPressableHint
            hintKey="hintJobMaterials"
            locale={locale}
            textAlign={textAlign}
            disabled={busy}
            onPress={() => onMaterials?.(job)}
            style={styles.iconBtn}
            accessibilityLabel={tUi('quoteOrderMaterials', locale)}
          >
            <MaterialCommunityIcons name="wrench" size={48} color="#38bdf8" />
          </ProductionPressableHint>
        ) : null}
        <ProductionPressableHint
          hintKey="hintJobFinish"
          locale={locale}
          textAlign={textAlign}
          disabled={busy}
          onPress={() => onFinish(job)}
          style={styles.iconBtn}
          accessibilityLabel={tUi('upholsteryJobFinish', locale)}
        >
          <MaterialCommunityIcons name="stop-circle" size={52} color={theme.danger} />
        </ProductionPressableHint>
      </View>
      <Text style={[kiosk.hint, { textAlign }]}>{tUi('upholsteryJobControlsHint', locale)}</Text>
      <JobMaterialsInlineList
        lines={job.manual_material_lines}
        locale={locale}
        tUi={tUi}
        textAlign={textAlign}
        canEdit={!isCompleted}
        onEditMaterials={() => onMaterials?.(job)}
      />
    </ProductionPressableHint>
  );
}

export default function JobsScreen({ route, navigation, allowed, accessHint, onRefreshAccess }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState(() => {
    const seed = route.params?.initialJob;
    return seed?.job_id || seed?.id ? [seed] : [];
  });
  const [quoteOrders, setQuoteOrders] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [repairBusyId, setRepairBusyId] = useState('');
  const [repairMaterials, setRepairMaterials] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [timerBusyId, setTimerBusyId] = useState('');
  const timerOpsRef = useRef(new Set());
  const jobsSnapshotRef = useRef([]);
  const [materialsTarget, setMaterialsTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [storerooms, setStorerooms] = useState([]);
  const [storeroomFinishJobId, setStoreroomFinishJobId] = useState('');
  const [storeroomPromptVisible, setStoreroomPromptVisible] = useState(false);
  const [finishConfirmJob, setFinishConfirmJob] = useState(null);
  const [quoteStopTarget, setQuoteStopTarget] = useState(null);
  const [quoteTimerBusyId, setQuoteTimerBusyId] = useState('');

  const storeroomCopy = useMemo(() => storeroomDeductionStrings(tUi, locale), [locale]);

  const loadJobs = useCallback(async ({ showLoading = true } = {}) => {
    if (!allowed) {
      setJobs([]);
      setQuoteOrders([]);
      setRepairs([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [jobPayload, quotes, repairPayload] = await Promise.all([
        fetchCarpentryProductionJobs({ activeOnly: true }),
        fetchCarpentryProductionQuotes().catch((quoteErr) => {
          if (__DEV__) console.warn('[JobsScreen] production-quotes-list failed', quoteErr?.message);
          return null;
        }),
        warehouseMobileRequest('return-order-list', {
          for_production: true,
          repair_department: 'carpentry',
        }).catch((repairErr) => {
          if (__DEV__) console.warn('[JobsScreen] return-order-list failed', repairErr?.message);
          return null;
        }),
      ]);
      const list = jobPayload?.jobs || [];
      const quotesFromJobs = jobPayload?.quoteOrders || [];
      const quotesFromList = Array.isArray(quotes) ? quotes : [];
      const mergedQuotesById = new Map();
      for (const q of [...quotesFromJobs, ...quotesFromList]) {
        const id = String(q?.quote_id || '').trim();
        if (id) mergedQuotesById.set(id, q);
      }
      setJobs(Array.isArray(list) ? list : []);
      setQuoteOrders([...mergedQuotesById.values()]);
      const repairRows = repairPayload?.return_orders || [];
      setRepairs(Array.isArray(repairRows)
        ? repairRows.filter((r) => r.status !== 'completed' && r.status !== 'cancelled')
        : []);
    } catch (e) {
      const msg = e?.message || tUi('upholsteryJobLoadFailed', locale);
      setError(msg);
      setJobs((prev) => {
        const seed = route.params?.initialJob;
        if (prev.length) return prev;
        if (seed?.job_id || seed?.id) return [seed];
        return [];
      });
    } finally {
      setLoading(false);
    }
  }, [allowed, locale, route.params?.initialJob]);

  useFocusEffect(
    useCallback(() => {
      const hasCached = jobs.length > 0 || quoteOrders.length > 0 || repairs.length > 0;
      loadJobs({ showLoading: !hasCached });
    }, [loadJobs, jobs.length, quoteOrders.length, repairs.length]),
  );

  useEffect(() => subscribeProductionRefresh(() => loadJobs({ showLoading: false })), [loadJobs]);

  const wrapBusy = async (jobId, fn) => {
    setBusyId(jobId);
    try {
      await fn();
      await loadJobs();
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || '');
    } finally {
      setBusyId('');
    }
  };

  const runOptimisticTimerOp = useCallback(async (jobId, mode) => {
    const id = String(jobId || '').trim();
    if (!id || timerOpsRef.current.has(id)) return;

    let applied = false;
    setJobs((prev) => {
      const job = prev.find((j) => String(j.job_id || j.id) === id);
      if (!job) return prev;
      applied = true;
      jobsSnapshotRef.current = prev;
      const patch = mode === 'pause' ? optimisticPauseJobPatch(job) : optimisticResumeJobPatch();
      return mergeJobInList(prev, id, patch);
    });
    if (!applied) return;

    timerOpsRef.current.add(id);
    setTimerBusyId(id);
    try {
      const result = mode === 'pause'
        ? await pauseCarpentryProductionJob(id)
        : await resumeCarpentryProductionJob(id);
      const serverPatch = serverJobPatchFromResponse(result);
      if (serverPatch) {
        setJobs((prev) => mergeJobInList(prev, id, serverPatch));
      }
    } catch (e) {
      setJobs(jobsSnapshotRef.current);
      Alert.alert(tUi('manufactureFailed', locale), e?.message || '');
    } finally {
      timerOpsRef.current.delete(id);
      setTimerBusyId((cur) => (cur === id ? '' : cur));
    }
  }, [locale]);

  const onPlay = (jobId) => {
    void runOptimisticTimerOp(jobId, 'resume');
  };

  const patchQuoteOrder = (quoteId, patch) => {
    setQuoteOrders((prev) => prev.map((q) => (
      String(q.quote_id) === String(quoteId) ? { ...q, ...patch } : q
    )));
  };

  const runQuoteTimer = async (quote, mode) => {
    const id = String(quote?.quote_id || '').trim();
    if (!id || quoteTimerBusyId) return;
    setQuoteTimerBusyId(id);
    const snapshot = quote;
    try {
      if (mode === 'play') {
        if (!quote.accepted_at) {
          await acceptCarpentryQuote(id, { productionLineSet: quote.production_line_set });
        } else {
          await resumeCarpentryQuote(id, { productionLineSet: quote.production_line_set });
        }
        patchQuoteOrder(id, {
          accepted_at: quote.accepted_at || new Date().toISOString(),
          timer_status: 'running',
          run_paused_at: null,
          run_started_at: new Date().toISOString(),
        });
      } else if (mode === 'pause') {
        const acc = Math.max(0, Number(quote.accumulated_ms) || 0);
        patchQuoteOrder(id, {
          timer_status: 'paused',
          run_paused_at: new Date().toISOString(),
          accumulated_ms: acc,
        });
        await pauseCarpentryQuote(id, { productionLineSet: quote.production_line_set });
      }
      void loadJobs({ showLoading: false });
    } catch (e) {
      patchQuoteOrder(id, snapshot);
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
    } finally {
      setQuoteTimerBusyId('');
    }
  };

  const finishQuoteFromCard = async (quote, { sendToPainting = false, destination = 'floor1' } = {}) => {
    const id = String(quote?.quote_id || '').trim();
    if (!id) return;
    setQuoteTimerBusyId(id);
    try {
      await completeCarpentryQuote(id, {
        deferDeliveryQueue: Boolean(sendToPainting),
        destination: sendToPainting ? 'delivery' : destination,
        sendToPainting: Boolean(sendToPainting),
        productionLineSet: quote.production_line_set,
      });
      setQuoteOrders((prev) => prev.filter((q) => String(q.quote_id) !== id));
    } catch (e) {
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
      void loadJobs({ showLoading: false });
    } finally {
      setQuoteTimerBusyId('');
    }
  };

  const onPause = (jobId) => {
    void runOptimisticTimerOp(jobId, 'pause');
  };

  const completeFinishJob = async (jobId, preferredStoreroomLocationId, destination) => {
    const result = await finishCarpentryProductionJob(jobId, {
      preferredStoreroomLocationId,
      destination,
    });
    const dest = result?.finish_destination || destination;
    const warn = String(result?.label_print_warning || '').trim();
    if (warn) {
      Alert.alert(tUi('upholsteryJobFinish', locale), warn);
      return;
    }
    const doneKey = dest === 'floor1' ? 'paintingJobFinishDoneFloor1' : 'paintingJobFinishDoneDelivery';
    Alert.alert(tUi('upholsteryJobFinish', locale), tUi(doneKey, locale));
  };

  const promptJobFinishDisposition = (jobId, preferredStoreroomLocationId) => {
    alertProductionFinishDisposition({
      tUi,
      locale,
      onFloor1: () => wrapBusy(jobId, () => completeFinishJob(jobId, preferredStoreroomLocationId, 'floor1')),
      onDelivery: () => wrapBusy(jobId, () => completeFinishJob(jobId, preferredStoreroomLocationId, 'delivery')),
    });
  };

  const proceedFinishJob = (job) => {
    const jobId = job.job_id || job.id;
    const needsStoreroom = carpentryFinishNeedsStoreroomPick(job);
    if (needsStoreroom) {
      void (async () => {
        try {
          const payload = await fetchProductionStoreroomMaterials();
          setStorerooms(parseStoreroomsFromMaterialsApi(payload));
        } catch {
          setStorerooms([]);
        }
        setStoreroomFinishJobId(String(jobId));
        setStoreroomPromptVisible(true);
      })();
      return;
    }
    promptJobFinishDisposition(jobId, null);
  };

  const onFinish = (job) => {
    setFinishConfirmJob(job);
  };

  const finishConfirmMessage = useMemo(() => {
    if (!finishConfirmJob) return '';
    const matCount = (finishConfirmJob.manual_material_lines || []).length;
    let body = tUi('upholsteryJobFinishBody', locale).replace(
      '{name}',
      finishConfirmJob.product_name || finishConfirmJob.raw_name || '',
    );
    if (matCount === 0) body = `${body}\n\n${tUi('jobFinishNoMaterialsHint', locale)}`;
    return body;
  }, [finishConfirmJob, locale]);

  const runRepairOp = async (row, op, body, { timerAction } = {}) => {
    const optimistic = timerAction ? optimisticReturnTimerRow(row, timerAction) : null;
    if (optimistic) mergeReturnOrderRow(setRepairs, optimistic);
    setRepairBusyId(row.id);
    try {
      const res = await warehouseMobileRequest(op, { return_order_id: row.id, ...body });
      if (res?.return_order) mergeReturnOrderRow(setRepairs, res.return_order);
      void loadJobs({ showLoading: false });
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || '');
      void loadJobs({ showLoading: false });
    } finally {
      setRepairBusyId('');
    }
  };

  const onRepairPlay = (row) => {
    if (row.status === 'submitted') {
      void runRepairOp(row, 'return-order-accept', {}, { timerAction: 'accept' });
      return;
    }
    void runRepairOp(row, 'return-order-resume', {}, { timerAction: 'resume' });
  };

  const onRepairPause = (row) => {
    void runRepairOp(row, 'return-order-pause', {}, { timerAction: 'pause' });
  };

  const onRepairStop = (row) => {
    Alert.alert(
      tUi('repairCompleteConfirm', locale),
      tUi('repairCompleteFloor2Hint', locale),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('repairCompleteConfirmBtn', locale),
          onPress: () => runRepairOp(row, 'return-order-complete'),
        },
      ],
    );
  };

  const combinedItems = useMemo(() => {
    const quoteRows = quoteOrders.map((q) => ({ _kind: 'quote', _key: `quote-${q.quote_id}`, quote: q }));
    const jobRows = jobs.map((j) => ({ _kind: 'job', _key: `job-${j.job_id || j.id}`, job: j }));
    const repairRows = repairs.map((r) => ({ _kind: 'repair', _key: `repair-${r.id}`, repair: r }));
    const all = [...quoteRows, ...jobRows, ...repairRows];
    return all.filter((row) => matchesJobsSearch(row, search));
  }, [quoteOrders, jobs, repairs, search]);

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('dashUnifiedOrders', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', locale)}</Text>
        {accessHint ? <Text style={[kiosk.hint, { textAlign }]}>{accessHint}</Text> : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess({ background: false })}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', locale)}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[kiosk.screen, styles.flex, kioskScreenEdgesSafe(insets, 16)]}>
      <ProductionKioskTopBar
        title={tUi('dashUnifiedOrders', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <TextInput
        style={[kiosk.input, styles.searchInput, { textAlign: locale === 'ar' ? 'right' : 'left' }]}
        placeholder={tUi('jobsSearchPlaceholder', locale)}
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
        accessibilityLabel={tUi('jobsSearchPlaceholder', locale)}
      />
      {search.trim() && !loading && combinedItems.length === 0 && !error ? (
        <Text style={[kiosk.hint, { textAlign }]}>{tUi('jobsSearchNoMatch', locale)}</Text>
      ) : null}
      {loading && combinedItems.length === 0 && !search.trim() ? (
        <ActivityIndicator color={KIOSK_ICON_BLUE_ON_DARK} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        data={combinedItems}
        keyExtractor={(item) => item._key}
        keyboardShouldPersistTaps="handled"
        refreshing={loading}
        onRefresh={() => loadJobs({ showLoading: true })}
        contentContainerStyle={combinedItems.length === 0 ? styles.listEmpty : { paddingBottom: 24 }}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        renderItem={({ item }) => (
          item._kind === 'repair' ? (
            <WorkshopRepairInboxCard
              row={item.repair}
              locale={locale}
              textAlign={textAlign}
              busy={repairBusyId === item.repair.id}
              onPlay={onRepairPlay}
              onPause={onRepairPause}
              onStop={onRepairStop}
              onMaterials={(row) => setRepairMaterials(row)}
              tUi={tUi}
              textForDisplay={textForDisplay}
              RunningRepairElapsed={RunningRepairElapsed}
            />
          ) : item._kind === 'quote' ? (
            <QuoteOrderJobCard
              quote={item.quote}
              locale={locale}
              textAlign={textAlign}
              busy={quoteTimerBusyId === String(item.quote.quote_id)}
              onQuoteLinesChanged={() => loadJobs({ showLoading: false })}
              onPlay={(q) => runQuoteTimer(q, 'play')}
              onPause={(q) => runQuoteTimer(q, 'pause')}
              onStop={(q) => setQuoteStopTarget(q)}
              onMaterials={(q) => setMaterialsTarget({
                jobKind: 'quote',
                jobId: String(q.quote_id || ''),
                productionRoute: 'carpentry',
                initialLines: q.manual_material_lines || [],
                allowFloor2WipDeduction: true,
              })}
            />
          ) : (
            <JobCard
              job={item.job}
              locale={locale}
              textAlign={textAlign}
              busy={busyId === String(item.job.job_id || item.job.id)}
              timerLocked={timerBusyId === String(item.job.job_id || item.job.id)}
              onPlay={onPlay}
              onPause={onPause}
              onFinish={onFinish}
              onMaterials={(jobRow) => setMaterialsTarget({
                jobKind: 'carpentry',
                jobId: String(jobRow.job_id || jobRow.id || ''),
                initialLines: jobRow.manual_material_lines || [],
              })}
            />
          )
        )}
        ListEmptyComponent={
          !loading && !error && !search.trim() ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('upholsteryJobEmpty', locale)}
            </Text>
          ) : null
        }
      />
      <ProductionJobMaterialsModal
        visible={Boolean(repairMaterials)}
        locale={locale}
        textAlign={textAlign}
        jobKind="repair"
        jobId={repairMaterials?.id || ''}
        returnOrderId={repairMaterials?.id || ''}
        initialLines={repairMaterials?.manual_material_lines
          || repairMaterials?.metadata?.manual_material_lines
          || []}
        onClose={() => setRepairMaterials(null)}
        onSaved={() => {
          setRepairMaterials(null);
          loadJobs();
        }}
      />
      <ProductionJobMaterialsModal
        visible={Boolean(materialsTarget)}
        locale={locale}
        textAlign={textAlign}
        jobKind={materialsTarget?.jobKind || 'carpentry'}
        jobId={materialsTarget?.jobId || ''}
        productionRoute={materialsTarget?.productionRoute || ''}
        allowFloor2WipDeduction={materialsTarget?.jobKind === 'quote' || materialsTarget?.allowFloor2WipDeduction !== false}
        initialLines={materialsTarget?.initialLines || []}
        onClose={() => setMaterialsTarget(null)}
        onSaved={() => {
          setMaterialsTarget(null);
          loadJobs();
        }}
      />
      <ConfirmTypeOkModal
        visible={Boolean(finishConfirmJob)}
        title={tUi('upholsteryJobFinishTitle', locale)}
        message={finishConfirmMessage}
        typeHint={tUi('jobFinishTypeOkHint', locale)}
        confirmLabel={tUi('upholsteryJobFinish', locale)}
        cancelLabel={tUi('cancel', locale)}
        textAlign={textAlign}
        onCancel={() => setFinishConfirmJob(null)}
        onConfirm={() => {
          const job = finishConfirmJob;
          setFinishConfirmJob(null);
          if (job) proceedFinishJob(job);
        }}
      />
      <QuoteProductionDispositionModal
        visible={Boolean(quoteStopTarget)}
        title={tUi('quoteOrderDispositionTitle', locale)}
        message={tUi('quoteOrderCarpentryDispositionPrompt', locale)}
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
        choices={[
          { key: 'delivery', label: tUi('quoteLineHandoffDelivery', locale) },
          { key: 'painting', label: tUi('quoteLineHandoffPainting', locale) },
        ]}
        onPick={(key) => {
          const q = quoteStopTarget;
          setQuoteStopTarget(null);
          if (!q) return;
          if (key === 'painting') void finishQuoteFromCard(q, { sendToPainting: true });
          else void finishQuoteFromCard(q, { destination: 'delivery' });
        }}
        onCancel={() => setQuoteStopTarget(null)}
      />
      <StoreroomDeductionPromptModal
        visible={storeroomPromptVisible}
        locale={locale}
        textAlign={textAlign}
        storerooms={storerooms}
        {...storeroomCopy}
        onCancel={() => {
          setStoreroomPromptVisible(false);
          setStoreroomFinishJobId('');
        }}
        onConfirm={(preferredId) => {
          const jobId = storeroomFinishJobId;
          setStoreroomPromptVisible(false);
          setStoreroomFinishJobId('');
          if (jobId) promptJobFinishDisposition(jobId, preferredId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginBottom: 8 },
  searchInput: { marginBottom: 12 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { marginTop: 24 },
  jobCard: { marginBottom: 12 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  thumbInline: { width: 56, height: 56, borderRadius: 8, backgroundColor: theme.surfaceElevated },
  jobThumb: { width: '100%', height: 120, borderRadius: 10, marginBottom: 8, backgroundColor: theme.surfaceElevated },
  quoteBadge: { fontSize: 14, fontWeight: '700', color: theme.primary, marginBottom: 4 },
  quoteBadgeRight: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.primary,
    textAlign: 'right',
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  jobTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 4 },
  jobTitleCenter: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 4, textAlign: 'center' },
  jobMeta: { fontSize: 13, color: theme.muted, marginBottom: 4 },
  jobMetaCenter: { fontSize: 13, color: theme.muted, marginBottom: 8, textAlign: 'center' },
  timerRowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  iconCaption: { color: '#e2e8f0', fontSize: 11, fontWeight: '700', marginTop: 2, textAlign: 'center', maxWidth: 88 },
  jobDims: { fontSize: 12, color: theme.textMuted, marginBottom: 10, fontWeight: '600' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  timerLabel: { fontSize: 13, color: theme.muted },
  timerValue: { fontSize: 22, fontWeight: '800', color: theme.primary },
  statusChip: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 4,
    marginBottom: 8,
  },
  iconBtn: { padding: 4 },
});
