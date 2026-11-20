// @refresh reset — full remount on save (avoids stale jobFilter chip state after filter removal).
import QuoteOrderElapsed from '../shared/components/QuoteOrderElapsed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk, KIOSK_ICON_BLUE_ON_DARK } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { isJobAwaitingDelivery } from '../shared/lib/deliveryAdminDisplayStatus';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import {
  fetchUpholsteryProductionJobs,
  fetchUpholsteryProductionQuotes,
  finishUpholsteryProductionJob,
  pauseUpholsteryProductionJob,
  resumeUpholsteryProductionJob,
  setUpholsteryProductionJobUnitsCompleted,
} from '../services/productionApi';
import ProductionJobMaterialsModal from '../components/ProductionJobMaterialsModal';
import { QuoteProductionCardExtras } from '../shared/quoteProductionOrderUi';
import { theme } from '../shared/theme';
import RunningJobElapsed from '../components/RunningJobElapsed';
import JobMaterialsInlineList from '../shared/components/JobMaterialsInlineList';
import { subscribeProductionRefresh } from '../lib/productionRefreshBus';
import { alertProductionFinishDisposition } from '../shared/lib/productionFinishDispositionAlert';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import {
  mergeJobInList,
  optimisticPauseJobPatch,
  optimisticResumeJobPatch,
  optimisticSetUnitsCompletedPatch,
  serverJobPatchFromResponse,
} from '../shared/lib/productionJobTimerOptimistic';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import {
  mergeReturnOrderRow,
  optimisticReturnTimerRow,
} from '../shared/lib/repairReturnQueueUi';
import WorkshopRepairInboxCard from '../shared/components/WorkshopRepairInboxCard';
import { WorkshopJobInboxBadges } from '../shared/components/WorkshopInboxKindBadges';
import { QuoteProductionOrderBadges } from '../shared/quoteProductionOrderUi';
import { repairSearchBlob } from '../shared/lib/productionInboxKinds';
import RunningRepairElapsed from '../components/RunningRepairElapsed';

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

function QuoteOrderJobCard({ quote, locale, textAlign, onPress, onMaterials }) {
  const canMaterials = Boolean(quote?.sent_to_production_at || quote?.sent_to_production) && !quote?.completed_at;
  return (
    <View style={[kiosk.card, styles.jobCard]}>
      <Pressable style={({ pressed }) => [pressed && { opacity: 0.92 }]} onPress={onPress}>
      <QuoteProductionOrderBadges quote={quote} textAlign={textAlign} tUi={tUi} locale={locale} />
      <Text style={[styles.quoteBadge, { textAlign }]}>
        {quote.quote_number || quote.quote_id}
      </Text>
      <Text style={[styles.jobTitle, { textAlign }]}>
        {textForDisplay(quote.customer_name || tUi('showroomOrderDetailLabel', locale), '—')}
      </Text>
      {quote.customer_phone ? (
        <Text style={[styles.jobMeta, { textAlign }]}>{quote.customer_phone}</Text>
      ) : null}
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
        <QuoteOrderElapsed quote={quote} style={styles.timerValue} />
        <Text style={styles.statusChip}>
          {quote.accepted_at ? tUi('carpentryQuoteInProduction', locale) : tUi('carpentryQuoteAwaiting', locale)}
        </Text>
      </View>
      <QuoteProductionCardExtras
        quote={quote}
        route="upholstery"
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
      />
      </Pressable>
      {canMaterials ? (
        <View style={styles.iconRow}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => onMaterials?.(quote)}
            accessibilityLabel={tUi('quoteOrderMaterials', locale)}
          >
            <MaterialCommunityIcons name="wrench" size={48} color={KIOSK_ICON_BLUE_ON_DARK} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function JobCompletedUnitsRow({
  jobId,
  productQty,
  savedCount,
  locale,
  textAlign,
  disabled,
  onApply,
}) {
  const [draft, setDraft] = useState(String(savedCount));
  useEffect(() => {
    setDraft(String(savedCount));
  }, [savedCount, jobId]);

  const clamp = (n) => Math.max(0, Math.min(productQty, n));
  const parsed = () => clamp(Math.floor(Number(String(draft).replace(/\D/g, '')) || 0));

  return (
    <View style={styles.unitBlock}>
      <Text style={[styles.unitHeader, { textAlign }]}>
        {tUi('upholsteryCompletedItemsLabel', locale)}
        <Text style={styles.unitHeaderMuted}>
          {` (${savedCount} / ${productQty})`}
        </Text>
      </Text>
      <Text style={[kiosk.hint, { textAlign, marginBottom: 8 }]}>
        {tUi('upholsteryCompletedItemsHint', locale)}
      </Text>
      <View style={styles.unitEntryRow}>
        <Pressable
          style={styles.unitStepBtn}
          disabled={disabled}
          onPress={() => setDraft(String(clamp(parsed() - 1)))}
          accessibilityLabel="-"
        >
          <MaterialCommunityIcons name="minus" size={28} color={KIOSK_ICON_BLUE_ON_DARK} />
        </Pressable>
        <TextInput
          style={styles.unitCountInput}
          value={draft}
          onChangeText={setDraft}
          keyboardType="number-pad"
          editable={!disabled}
          selectTextOnFocus
          maxLength={4}
        />
        <Pressable
          style={styles.unitStepBtn}
          disabled={disabled}
          onPress={() => setDraft(String(clamp(parsed() + 1)))}
          accessibilityLabel="+"
        >
          <MaterialCommunityIcons name="plus" size={28} color={KIOSK_ICON_BLUE_ON_DARK} />
        </Pressable>
        <Pressable
          style={[styles.unitConfirmBtn, disabled && styles.unitConfirmBtnDisabled]}
          disabled={disabled}
          onPress={() => onApply?.(jobId, parsed())}
          accessibilityLabel={tUi('upholsteryCompletedItemsApply', locale)}
        >
          <MaterialCommunityIcons name="check-circle" size={46} color="#22c55e" />
        </Pressable>
      </View>
    </View>
  );
}

function JobCard({
  job,
  locale,
  textAlign,
  busy,
  timerLocked,
  unitBusy,
  onPause,
  onPlay,
  onFinish,
  onMaterials,
  onSetUnitsCompleted,
}) {
  const isRunning = job.status === 'running';
  const thumb = resolveProductImageUrl(job.floor2_image_url || job.product_image_url || job.image_url);
  const canPlay = job.status === 'ready' || job.status === 'paused';
  const isCompleted = job.status === 'completed';
  const productQty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const showCompletedItems = !isCompleted;
  const savedCount = useMemo(() => {
    const raw = job.checked_unit_indexes || [];
    const arr = (Array.isArray(raw) ? raw : []).map((n) => Math.floor(Number(n))).filter((n) => n >= 1);
    return arr.length;
  }, [job.checked_unit_indexes]);
  const jobId = String(job.job_id || job.id);

  return (
    <View style={[kiosk.card, styles.jobCard]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.jobThumb} resizeMode="contain" resizeMethod="resize" fadeDuration={0} />
      ) : null}
      <WorkshopJobInboxBadges job={job} locale={locale} textAlign={textAlign} tUi={tUi} />
      <Text style={[styles.jobTitle, { textAlign }]}>{textForDisplay(job.finished_name || job.raw_name, '—')}</Text>
      <Text style={[styles.jobMeta, { textAlign }]}>
        {textForDisplay(job.raw_name || job.finished_sku, '')}
      </Text>
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

      {showCompletedItems ? (
        <JobCompletedUnitsRow
          jobId={jobId}
          productQty={productQty}
          savedCount={savedCount}
          locale={locale}
          textAlign={textAlign}
          disabled={Boolean(unitBusy || busy)}
          onApply={onSetUnitsCompleted}
        />
      ) : null}

      <View style={styles.iconRow}>
        {canPlay ? (
          <Pressable
            style={styles.iconBtn}
            disabled={Boolean(timerLocked)}
            onPress={() => onPlay(job.job_id || job.id)}
            accessibilityLabel={tUi('upholsteryJobResume', locale)}
          >
            <MaterialCommunityIcons name="play-circle" size={52} color={KIOSK_ICON_BLUE_ON_DARK} />
          </Pressable>
        ) : null}
        {isRunning ? (
          <Pressable
            style={styles.iconBtn}
            disabled={Boolean(timerLocked)}
            onPress={() => onPause(job.job_id || job.id)}
            accessibilityLabel={tUi('upholsteryJobPause', locale)}
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color={KIOSK_ICON_BLUE_ON_DARK} />
          </Pressable>
        ) : null}
        {!isCompleted ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onMaterials?.(job)}
            accessibilityLabel={tUi('quoteOrderMaterials', locale)}
          >
            <MaterialCommunityIcons name="wrench" size={48} color={KIOSK_ICON_BLUE_ON_DARK} />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.iconBtn}
          disabled={busy}
          onPress={() => onFinish(job)}
          accessibilityLabel={tUi('upholsteryJobFinish', locale)}
        >
          <MaterialCommunityIcons name="stop-circle" size={52} color={theme.danger} />
        </Pressable>
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
    </View>
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
  const [unitBusyId, setUnitBusyId] = useState('');
  const [materialsTarget, setMaterialsTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const timerOpsRef = useRef(new Set());
  const jobsSnapshotRef = useRef([]);
  const hasListDataRef = useRef(false);

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
      const [list, quotes, repairPayload] = await Promise.all([
        fetchUpholsteryProductionJobs({ activeOnly: true }),
        fetchUpholsteryProductionQuotes().catch(() => []),
        warehouseMobileRequest('return-order-list', {
          for_production: true,
          repair_department: 'upholstery',
        }).catch(() => null),
      ]);
      const nextJobs = Array.isArray(list) ? list : [];
      const nextQuotes = (Array.isArray(quotes) ? quotes : []).filter((q) => !q.completed_at);
      const repairRows = repairPayload?.return_orders || [];
      const nextRepairs = Array.isArray(repairRows)
        ? repairRows.filter((r) => r.status !== 'completed' && r.status !== 'cancelled')
        : [];
      setJobs(nextJobs);
      setQuoteOrders(nextQuotes);
      setRepairs(nextRepairs);
      hasListDataRef.current = nextJobs.length > 0 || nextQuotes.length > 0 || nextRepairs.length > 0;
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
      loadJobs({ showLoading: !hasListDataRef.current });
    }, [loadJobs]),
  );

  useEffect(() => subscribeProductionRefresh(() => loadJobs({ showLoading: false })), [loadJobs]);

  const wrapBusy = async (jobId, fn) => {
    setBusyId(jobId);
    try {
      await fn();
      await loadJobs({ showLoading: false });
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
        ? await pauseUpholsteryProductionJob(id)
        : await resumeUpholsteryProductionJob(id);
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

  const onPause = (jobId) => {
    void runOptimisticTimerOp(jobId, 'pause');
  };

  const onSetUnitsCompleted = useCallback(async (jobId, completedCount) => {
    const id = String(jobId || '').trim();
    if (!id) return;
    let snapshot = null;
    setJobs((prev) => {
      const job = prev.find((j) => String(j.job_id || j.id) === id);
      if (!job) return prev;
      snapshot = prev;
      const patch = optimisticSetUnitsCompletedPatch(job, completedCount);
      if (!patch) return prev;
      return mergeJobInList(prev, id, patch);
    });
    setUnitBusyId(id);
    try {
      const result = await setUpholsteryProductionJobUnitsCompleted(id, completedCount);
      const patch = serverJobPatchFromResponse(result);
      if (patch) {
        setJobs((prev) => mergeJobInList(prev, id, patch));
      }
    } catch (e) {
      if (snapshot) setJobs(snapshot);
      Alert.alert(tUi('manufactureFailed', locale), e?.message || '');
    } finally {
      setUnitBusyId('');
    }
  }, [locale]);

  const completeJobFinish = (jobId, destination) => {
    wrapBusy(jobId, async () => {
      const result = await finishUpholsteryProductionJob(jobId, { destination });
      const dest = result?.finish_destination || destination;
      const warn = String(result?.label_print_warning || '').trim();
      if (warn) {
        Alert.alert(tUi('upholsteryJobFinish', locale), warn);
        return;
      }
      const doneKey = dest === 'floor1' ? 'paintingJobFinishDoneFloor1' : 'paintingJobFinishDoneDelivery';
      Alert.alert(tUi('upholsteryJobFinish', locale), tUi(doneKey, locale));
    });
  };

  const onFinish = (job) => {
    const jobId = job.job_id || job.id;
    const matCount = (job.manual_material_lines || []).length;
    let body = tUi('upholsteryJobFinishBody', locale).replace('{name}', job.finished_name || job.raw_name || '');
    if (matCount === 0) body = `${body}\n\n${tUi('jobFinishNoMaterialsHint', locale)}`;
    Alert.alert(
      tUi('upholsteryJobFinishTitle', locale),
      body,
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('upholsteryJobFinish', locale),
          style: 'destructive',
          onPress: () => {
            alertProductionFinishDisposition({
              tUi,
              locale,
              onFloor1: () => completeJobFinish(jobId, 'floor1'),
              onDelivery: () => completeJobFinish(jobId, 'delivery'),
            });
          },
        },
      ],
    );
  };

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
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('upholsteryJobIntro', locale)}</Text>
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
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        data={combinedItems}
        keyExtractor={(item) => item._key}
        keyboardShouldPersistTaps="handled"
        refreshing={pullRefreshing}
        onRefresh={async () => {
          setPullRefreshing(true);
          try {
            await loadJobs({ showLoading: false });
          } finally {
            setPullRefreshing(false);
          }
        }}
        contentContainerStyle={combinedItems.length === 0 ? styles.listEmpty : { paddingBottom: 24 }}
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
              onPress={() => navigation.navigate('UpholsteryQuoteDetail', { quote: item.quote })}
              onMaterials={(q) => setMaterialsTarget({
                jobKind: 'quote',
                jobId: String(q.quote_id || ''),
                productionRoute: 'upholstery',
                initialLines: q.manual_material_lines || [],
              })}
            />
          ) : (
            <JobCard
              job={item.job}
              locale={locale}
              textAlign={textAlign}
              busy={busyId === String(item.job.job_id || item.job.id)}
              timerLocked={timerBusyId === String(item.job.job_id || item.job.id)}
              unitBusy={unitBusyId === String(item.job.job_id || item.job.id)}
              onPlay={onPlay}
              onPause={onPause}
              onSetUnitsCompleted={onSetUnitsCompleted}
                onFinish={onFinish}
                onMaterials={(jobRow) => setMaterialsTarget({
                  jobKind: 'upholstery',
                  jobId: String(jobRow.job_id || jobRow.id || ''),
                  initialLines: jobRow.manual_material_lines || [],
                })}
              />
          )
        )}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
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
          loadJobs({ showLoading: false });
        }}
      />
      <ProductionJobMaterialsModal
        visible={Boolean(materialsTarget)}
        locale={locale}
        textAlign={textAlign}
        jobKind={materialsTarget?.jobKind || 'upholstery'}
        jobId={materialsTarget?.jobId || ''}
        productionRoute={materialsTarget?.productionRoute || ''}
        initialLines={materialsTarget?.initialLines || []}
        onClose={() => setMaterialsTarget(null)}
        onSaved={() => {
          setMaterialsTarget(null);
          loadJobs({ showLoading: false });
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
  jobThumb: { width: '100%', height: 120, borderRadius: 10, marginBottom: 8, backgroundColor: theme.surfaceElevated },
  quoteBadge: { fontSize: 14, fontWeight: '700', color: theme.primary, marginBottom: 4 },
  jobTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 4 },
  jobMeta: { fontSize: 13, color: theme.muted, marginBottom: 4 },
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
  unitBlock: { marginBottom: 12 },
  unitHeader: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 4 },
  unitHeaderMuted: { fontSize: 14, fontWeight: '600', color: theme.textMuted },
  unitEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceElevated,
  },
  unitCountInput: {
    flex: 1,
    minWidth: 56,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceElevated,
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  unitConfirmBtn: { padding: 2 },
  unitConfirmBtnDisabled: { opacity: 0.45 },
});
