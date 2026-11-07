import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../productionKiosk/lib/productionKioskI18n';
import ProductionPressableHint from '../productionKiosk/lib/ProductionPressableHint';
import {
  fetchCarpentryProductionJobs,
  fetchCarpentryProductionQuotes,
  finishCarpentryProductionJob,
  pauseCarpentryProductionJob,
  resumeCarpentryProductionJob,
} from '../services/carpentryApi';
import ProductionJobMaterialsModal from '../productionKiosk/components/ProductionJobMaterialsModal';
import { QuoteProductionCardExtras } from '../shared/quoteProductionOrderUi';
import { theme } from '../shared/theme';
import RunningJobElapsed from '../productionKiosk/components/RunningJobElapsed';
import { subscribeProductionRefresh } from '../productionKiosk/lib/productionRefreshBus';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { Image } from 'react-native';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function QuoteOrderJobCard({ quote, locale, textAlign, onPress }) {
  const startedRaw = quote?.run_started_at || quote?.accepted_at;
  const elapsedMs = startedRaw ? Math.max(0, Date.now() - new Date(startedRaw).getTime()) : 0;
  const elapsed = formatElapsed(elapsedMs);
  return (
    <Pressable
      style={({ pressed }) => [kiosk.card, styles.jobCard, pressed && { opacity: 0.92 }]}
      onPress={onPress}
    >
      <Text style={[styles.quoteBadge, { textAlign }]}>
        {quote.quote_number || quote.quote_id}
      </Text>
      <Text style={[styles.jobTitle, { textAlign }]}>
        {textForDisplay(quote.customer_name || tUi('dashCarpentryQuoteOrders', locale), '—')}
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
        route="carpentry"
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
      />
    </Pressable>
  );
}

function JobCard({ job, locale, textAlign, busy, onPause, onPlay, onFinish, onMaterials }) {
  const isCompleted = job.status === 'completed';
  const isRunning = job.status === 'running';
  const thumb = resolveProductImageUrl(job.floor2_image_url || job.product_image_url || job.image_url);
  const canPlay = job.status === 'ready' || job.status === 'paused';

  return (
    <ProductionPressableHint
      hintKey="hintJobCard"
      locale={locale}
      textAlign={textAlign}
      style={[kiosk.card, styles.jobCard]}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.jobThumb} resizeMode="cover" />
      ) : null}
      <Text style={[styles.jobTitle, { textAlign }]}>{textForDisplay(job.product_name || job.raw_name, '—')}</Text>
      <Text style={[styles.jobMeta, { textAlign }]}>
        {textForDisplay(job.product_sku || job.raw_name || '', '')}
      </Text>
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
        <RunningJobElapsed job={job} style={styles.timerValue} />
        <Text style={styles.statusChip}>{tUi(`upholsteryJobStatus_${job.status}`, locale)}</Text>
      </View>

      <View style={styles.iconRow}>
        {canPlay ? (
          <ProductionPressableHint
            hintKey="hintJobPlay"
            locale={locale}
            textAlign={textAlign}
            disabled={busy}
            onPress={() => onPlay(job.job_id || job.id)}
            style={styles.iconBtn}
            accessibilityLabel={tUi('upholsteryJobResume', locale)}
          >
            <MaterialCommunityIcons name="play-circle" size={52} color={theme.primary} />
          </ProductionPressableHint>
        ) : null}
        {isRunning ? (
          <ProductionPressableHint
            hintKey="hintJobPause"
            locale={locale}
            textAlign={textAlign}
            disabled={busy}
            onPress={() => onPause(job.job_id || job.id)}
            style={styles.iconBtn}
            accessibilityLabel={tUi('upholsteryJobPause', locale)}
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color={theme.primary} />
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
            <MaterialCommunityIcons name="wrench" size={48} color={theme.primary} />
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
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [materialsJob, setMaterialsJob] = useState(null);
  const [jobFilter, setJobFilter] = useState('all');

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
        fetchCarpentryProductionJobs({ activeOnly: true }),
        fetchCarpentryProductionQuotes().catch(() => []),
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

  const onPlay = (jobId) => {
    wrapBusy(jobId, () => resumeCarpentryProductionJob(jobId));
  };

  const onPause = (jobId) => {
    wrapBusy(jobId, () => pauseCarpentryProductionJob(jobId));
  };

  const onFinish = (job) => {
    const jobId = job.job_id || job.id;
    const matCount = (job.manual_material_lines || []).length;
    let body = tUi('upholsteryJobFinishBody', locale).replace('{name}', job.product_name || job.raw_name || '');
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
            const result = await finishCarpentryProductionJob(jobId);
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
          title={tUi('carpentryJobsTitle', locale)}
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
              onPress={() => navigation.navigate('QuoteDetail', { quote: item.quote })}
            />
          ) : (
            <JobCard
              job={item.job}
              locale={locale}
              textAlign={textAlign}
              busy={busyId === String(item.job.job_id || item.job.id)}
              onPlay={onPlay}
              onPause={onPause}
              onFinish={onFinish}
              onMaterials={(jobRow) => setMaterialsJob(jobRow)}
            />
          )
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('upholsteryJobEmpty', locale)}
            </Text>
          ) : null
        }
      />
      <ProductionJobMaterialsModal
        visible={!!materialsJob}
        locale={locale}
        textAlign={textAlign}
        jobKind="carpentry"
        jobId={materialsJob?.job_id || materialsJob?.id || ''}
        initialLines={materialsJob?.manual_material_lines || []}
        onClose={() => setMaterialsJob(null)}
        onSaved={() => {
          setMaterialsJob(null);
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
});
