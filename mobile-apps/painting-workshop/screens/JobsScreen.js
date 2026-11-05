import { useCallback, useEffect, useState } from 'react';
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
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import ProductionPressableHint from '../lib/ProductionPressableHint';
import {
  fetchPaintingProductionJobs,
  finishPaintingProductionJob,
  pausePaintingProductionJob,
  resumePaintingProductionJob,
} from '../services/paintingApi';
import { theme } from '../shared/theme';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function JobCard({ job, locale, textAlign, busy, onPause, onPlay, onFinish }) {
  const elapsed = formatElapsed(job.elapsed_ms);
  const isRunning = job.status === 'running';
  const canPlay = job.status === 'ready' || job.status === 'paused';
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));

  return (
    <ProductionPressableHint
      hintKey="hintJobCard"
      locale={locale}
      textAlign={textAlign}
      style={[kiosk.card, styles.jobCard]}
    >
      <Text style={[styles.jobTitle, { textAlign }]}>{textForDisplay(job.product_name, '—')}</Text>
      <Text style={[styles.jobMeta, { textAlign }]}>
        {textForDisplay(job.product_sku || '', '')}
        {qty > 1 ? ` · ×${qty}` : ''}
      </Text>
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
        <Text style={styles.timerValue}>{elapsed}</Text>
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
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color={theme.primary} />
          </ProductionPressableHint>
        ) : null}
        <ProductionPressableHint
          hintKey="hintJobFinish"
          locale={locale}
          textAlign={textAlign}
          disabled={busy}
          onPress={() => onFinish(job)}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="stop-circle" size={52} color={theme.danger} />
        </ProductionPressableHint>
      </View>
      <Text style={[kiosk.hint, { textAlign }]}>{tUi('paintingJobControlsHint', locale)}</Text>
    </ProductionPressableHint>
  );
}

export default function JobsScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [tick, setTick] = useState(0);

  const loadJobs = useCallback(async () => {
    if (!allowed) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setError('');
    try {
      const list = await fetchPaintingProductionJobs({ activeOnly: true });
      setJobs(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('upholsteryJobLoadFailed', locale));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadJobs();
    }, [loadJobs]),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTick((n) => n + 1);
      setJobs((prev) => prev.map((j) => {
        if (j.status !== 'running' || !j.timer_started_at) return j;
        const base = Number(j.accumulated_ms) || 0;
        const extra = Date.now() - new Date(j.timer_started_at).getTime();
        return { ...j, elapsed_ms: base + Math.max(0, extra) };
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
    wrapBusy(jobId, () => resumePaintingProductionJob(jobId));
  };

  const onPause = (jobId) => {
    wrapBusy(jobId, () => pausePaintingProductionJob(jobId));
  };

  const onFinish = (job) => {
    const jobId = job.job_id || job.id;
    const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
    const name = job.product_name || 'product';
    Alert.alert(
      tUi('upholsteryJobFinishTitle', locale),
      tUi('paintingJobFinishBody', locale)
        .replace('{name}', name)
        .replace('{qty}', String(qty)),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('upholsteryJobFinish', locale),
          style: 'destructive',
          onPress: () => wrapBusy(jobId, async () => {
            await finishPaintingProductionJob(jobId);
            Alert.alert(tUi('upholsteryJobFinish', locale), tUi('paintingJobFinishDone', locale));
          }),
        },
      ],
    );
  };

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('paintingJobsTitle', locale)}
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
        title={tUi('paintingJobsTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {loading && jobs.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        data={jobs}
        keyExtractor={(item) => String(item.job_id || item.id)}
        refreshing={loading}
        onRefresh={() => {
          setLoading(true);
          loadJobs();
        }}
        extraData={tick}
        contentContainerStyle={jobs.length === 0 ? styles.listEmpty : { paddingBottom: 24 }}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            locale={locale}
            textAlign={textAlign}
            busy={busyId === String(item.job_id || item.id)}
            onPlay={onPlay}
            onPause={onPause}
            onFinish={onFinish}
          />
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('paintingJobEmpty', locale)}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { marginTop: 24 },
  jobCard: { marginBottom: 12 },
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
