import { formatProductionElapsed as formatElapsed } from '../shared/lib/formatProductionElapsed';
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
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk, KIOSK_ICON_BLUE_ON_DARK } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import {
  fetchUpholsteryProductionJobs,
  fetchUpholsteryProductionQuotes,
  finishUpholsteryProductionJob,
  pauseUpholsteryProductionJob,
  resumeUpholsteryProductionJob,
  toggleUpholsteryProductionJobUnit,
} from '../services/productionApi';
import ProductionJobMaterialsModal from '../components/ProductionJobMaterialsModal';
import { QuoteProductionCardExtras } from '../shared/quoteProductionOrderUi';
import { theme } from '../shared/theme';
import RunningJobElapsed from '../components/RunningJobElapsed';
import JobMaterialsInlineList from '../shared/components/JobMaterialsInlineList';
import { subscribeProductionRefresh } from '../lib/productionRefreshBus';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import {
  mergeJobInList,
  optimisticPauseJobPatch,
  optimisticResumeJobPatch,
  serverJobPatchFromResponse,
} from '../shared/lib/productionJobTimerOptimistic';



function QuoteOrderJobCard({ quote, locale, textAlign, onPress, onMaterials }) {
  const startedRaw = quote?.run_started_at || quote?.accepted_at;
  const elapsedMs = startedRaw ? Math.max(0, Date.now() - new Date(startedRaw).getTime()) : 0;
  const elapsed = formatElapsed(elapsedMs);
  const canMaterials = Boolean(quote?.sent_to_production_at || quote?.sent_to_production) && !quote?.completed_at;
  return (
    <View style={[kiosk.card, styles.jobCard]}>
      <Pressable style={({ pressed }) => [pressed && { opacity: 0.92 }]} onPress={onPress}>
      <Text style={[styles.quoteBadge, { textAlign }]}>
        {quote.quote_number || quote.quote_id}
      </Text>
      <Text style={[styles.jobTitle, { textAlign }]}>
        {textForDisplay(quote.customer_name || tUi('dashUpholsteryQuoteOrders', locale), '—')}
      </Text>
      {quote.customer_phone ? (
        <Text style={[styles.jobMeta, { textAlign }]}>{quote.customer_phone}</Text>
      ) : null}
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
        <Text style={styles.timerValue}>{elapsed}</Text>
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
  onToggleUnit,
}) {
  const isRunning = job.status === 'running';
  const thumb = resolveProductImageUrl(job.floor2_image_url || job.product_image_url || job.image_url);
  const canPlay = job.status === 'ready' || job.status === 'paused';
  const isCompleted = job.status === 'completed';
  const productQty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const showUnitChecks = productQty > 1;
  const checkedSet = useMemo(() => {
    const raw = job.checked_unit_indexes || [];
    return new Set((Array.isArray(raw) ? raw : []).map((n) => Math.floor(Number(n))).filter((n) => n >= 1));
  }, [job.checked_unit_indexes]);

  return (
    <View style={[kiosk.card, styles.jobCard]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.jobThumb} resizeMode="cover" resizeMethod="resize" fadeDuration={0} />
      ) : null}
      <Text style={[styles.jobTitle, { textAlign }]}>{textForDisplay(job.finished_name || job.raw_name, '—')}</Text>
      <Text style={[styles.jobMeta, { textAlign }]}>
        {textForDisplay(job.raw_name || job.finished_sku, '')}
      </Text>
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
        <RunningJobElapsed job={job} style={styles.timerValue} />
        <Text style={styles.statusChip}>{tUi(`upholsteryJobStatus_${job.status}`, locale)}</Text>
      </View>

      {showUnitChecks ? (
        <View style={styles.unitBlock}>
          <Text style={[styles.unitLabel, { textAlign }]}>
            {tUi('upholsteryUnitsCheckedLabel', locale)}
            {': '}
            {checkedSet.size}
            {' / '}
            {productQty}
          </Text>
          {!isCompleted ? (
            <Text style={[kiosk.hint, { textAlign, marginBottom: 6 }]}>
              {tUi('upholsteryUnitTapHint', locale)}
            </Text>
          ) : null}
          <View style={styles.unitChipRow}>
            {Array.from({ length: productQty }, (_, i) => i + 1).map((unitN) => {
              const on = checkedSet.has(unitN);
              const jobId = String(job.job_id || job.id);
              return (
                <Pressable
                  key={unitN}
                  style={[styles.unitChip, on && styles.unitChipOn]}
                  disabled={isCompleted || unitBusy || busy}
                  onPress={() => onToggleUnit?.(jobId, unitN)}
                >
                  <Text style={[styles.unitChipText, on && styles.unitChipTextOn]}>{unitN}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [timerBusyId, setTimerBusyId] = useState('');
  const [unitBusyId, setUnitBusyId] = useState('');
  const [materialsTarget, setMaterialsTarget] = useState(null);
  const [jobFilter, setJobFilter] = useState('all');
  const timerOpsRef = useRef(new Set());
  const jobsSnapshotRef = useRef([]);

  const loadJobs = useCallback(async ({ showLoading = true } = {}) => {
    if (!allowed) {
      setJobs([]);
      setQuoteOrders([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [list, quotes] = await Promise.all([
        fetchUpholsteryProductionJobs({ activeOnly: true }),
        fetchUpholsteryProductionQuotes().catch(() => []),
      ]);
      setJobs(Array.isArray(list) ? list : []);
      setQuoteOrders((Array.isArray(quotes) ? quotes : []).filter((q) => !q.completed_at));
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
      const hasCached = jobs.length > 0 || quoteOrders.length > 0;
      loadJobs({ showLoading: !hasCached });
    }, [loadJobs, jobs.length, quoteOrders.length]),
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

  const onToggleUnit = useCallback(async (jobId, unitIndex) => {
    const id = String(jobId || '').trim();
    if (!id) return;
    setUnitBusyId(id);
    try {
      const result = await toggleUpholsteryProductionJobUnit(id, unitIndex);
      const patch = serverJobPatchFromResponse(result);
      if (patch) {
        setJobs((prev) => mergeJobInList(prev, id, patch));
      }
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || '');
    } finally {
      setUnitBusyId('');
    }
  }, [locale]);

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
          onPress: () => wrapBusy(jobId, async () => {
            const result = await finishUpholsteryProductionJob(jobId);
            const warn = String(result?.label_print_warning || '').trim();
            if (warn) {
              Alert.alert(tUi('upholsteryJobFinish', locale), warn);
            } else {
              Alert.alert(tUi('upholsteryJobFinish', locale), tUi('upholsteryJobFinishDone', locale));
            }
          }),
        },
      ],
    );
  };

  const combinedItems = useMemo(() => {
    const quoteRows = quoteOrders.map((q) => ({ _kind: 'quote', _key: `quote-${q.quote_id}`, quote: q }));
    const jobRows = jobs.map((j) => ({ _kind: 'job', _key: `job-${j.job_id || j.id}`, job: j }));
    if (jobFilter === 'quotes') return quoteRows;
    if (jobFilter === 'floor2') {
      return jobRows.filter((row) => row.job?.floor2_push || row.job?.metadata?.floor2_push);
    }
    if (jobFilter === 'active') {
      return jobRows.filter((row) => ['ready', 'running', 'paused'].includes(row.job?.status));
    }
    return [...quoteRows, ...jobRows];
  }, [quoteOrders, jobs, jobFilter]);

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('upholsteryJobsTitle', locale)}
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
        title={tUi('upholsteryJobsTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('upholsteryJobIntro', locale)}</Text>
      <View style={styles.filterRow}>
        {['all', 'quotes', 'floor2', 'active'].map((key) => (
          <Pressable
            key={key}
            style={[styles.filterChip, jobFilter === key && styles.filterChipOn]}
            onPress={() => setJobFilter(key)}
          >
            <Text style={[styles.filterChipText, jobFilter === key && styles.filterChipTextOn]}>
              {tUi(`jobsFilter_${key}`, locale)}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading && combinedItems.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        data={combinedItems}
        keyExtractor={(item) => item._key}
        refreshing={loading}
        onRefresh={() => loadJobs({ showLoading: true })}
        contentContainerStyle={combinedItems.length === 0 ? styles.listEmpty : { paddingBottom: 24 }}
        renderItem={({ item }) => (
          item._kind === 'quote' ? (
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
              onToggleUnit={onToggleUnit}
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
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('upholsteryJobEmpty', locale)}
            </Text>
          ) : null
        }
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
          loadJobs();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginBottom: 8 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { marginTop: 24 },
  jobCard: { marginBottom: 12 },
  jobThumb: { width: '100%', height: 120, borderRadius: 10, marginBottom: 8, backgroundColor: theme.surfaceElevated },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.border },
  filterChipOn: { borderColor: theme.primary, backgroundColor: theme.primaryBg },
  filterChipText: { fontSize: 13, fontWeight: '600', color: theme.muted },
  filterChipTextOn: { color: theme.primary },
  quoteBadge: { fontSize: 14, fontWeight: '700', color: theme.primary, marginBottom: 4 },
  jobTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 4 },
  jobMeta: { fontSize: 13, color: theme.muted, marginBottom: 10 },
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
  unitLabel: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 4 },
  unitChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: {
    minWidth: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceElevated,
  },
  unitChipOn: { borderColor: theme.primary, backgroundColor: theme.primaryBg },
  unitChipText: { fontSize: 16, fontWeight: '700', color: theme.muted },
  unitChipTextOn: { color: theme.primary },
});
