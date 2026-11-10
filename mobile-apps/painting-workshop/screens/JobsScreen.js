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
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk, KIOSK_ICON_BLUE_ON_DARK } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import ProductionPressableHint from '../lib/ProductionPressableHint';
import {
  fetchPaintingProductionJobs,
  fetchPaintingReturnOrders,
  finishPaintingProductionJob,
  pausePaintingProductionJob,
  resumePaintingProductionJob,
} from '../services/paintingApi';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import ProductionJobMaterialsModal from '../components/ProductionJobMaterialsModal';
import { theme } from '../shared/theme';
import RunningJobElapsed from '../components/RunningJobElapsed';
import JobMaterialsInlineList from '../shared/components/JobMaterialsInlineList';
import { subscribeProductionRefresh } from '../lib/productionRefreshBus';
import { RepairCard } from './WarehouseRepairsScreen';

function JobCard({ job, locale, textAlign, busy, onPause, onPlay, onFinish, onMaterials }) {
  const isRunning = job.status === 'running';
  const canPlay = job.status === 'ready' || job.status === 'paused';
  const isCompleted = job.status === 'completed';
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const fromQuote = Boolean(String(job.carpentry_quote_id || job.metadata?.carpentry_quote_id || '').trim());
  const invSource = String(job.inventory_source || '').trim().toLowerCase();
  let sourceKey = 'paintingQueueBadgeFloor2';
  if (fromQuote) {
    sourceKey = invSource === 'floor1' ? 'paintingQueueBadgeCarpentryOrderFinished' : 'paintingQueueBadgeCarpentryOrder';
  }

  return (
    <ProductionPressableHint
      hintKey="hintJobCard"
      locale={locale}
      textAlign={textAlign}
      style={[kiosk.card, styles.jobCard]}
    >
      <Text style={[styles.kindChip, { alignSelf: textAlign === 'right' ? 'flex-end' : 'flex-start' }]}>
        {tUi(sourceKey, locale)}
      </Text>
      <Text style={[styles.jobTitle, { textAlign }]}>{textForDisplay(job.product_name, '—')}</Text>
      <Text style={[styles.jobMeta, { textAlign }]}>
        {textForDisplay(job.product_sku || '', '')}
        {qty > 1 ? ` · ×${qty}` : ''}
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
          >
            <MaterialCommunityIcons name="play-circle" size={52} color={KIOSK_ICON_BLUE_ON_DARK} />
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
            <MaterialCommunityIcons name="pause-circle" size={52} color={KIOSK_ICON_BLUE_ON_DARK} />
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
          >
            <MaterialCommunityIcons name="wrench" size={48} color={KIOSK_ICON_BLUE_ON_DARK} />
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

function mergeQueueRows(jobs, returns) {
  const jobRows = (jobs || []).map((job) => ({
    kind: 'job',
    sortKey: `j:${job.job_id || job.id}`,
    job,
  }));
  const returnRows = (returns || []).map((row) => ({
    kind: 'return',
    sortKey: `r:${row.id}`,
    row,
  }));
  return [...returnRows, ...jobRows];
}

export default function JobsScreen({ navigation, route, allowed, accessHint, onRefreshAccess }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [returns, setReturns] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [materialsJob, setMaterialsJob] = useState(null);
  const [repairMaterials, setRepairMaterials] = useState(null);

  const listData = useMemo(() => mergeQueueRows(jobs, returns), [jobs, returns]);

  const loadQueue = useCallback(async ({ showLoading = true } = {}) => {
    if (!allowed) {
      setJobs([]);
      setReturns([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [jobList, returnList] = await Promise.all([
        fetchPaintingProductionJobs({ activeOnly: true }),
        fetchPaintingReturnOrders(),
      ]);
      setJobs(Array.isArray(jobList) ? jobList : []);
      setReturns(Array.isArray(returnList) ? returnList : []);
    } catch (e) {
      setError(e?.message || tUi('upholsteryJobLoadFailed', locale));
      setJobs([]);
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      const hasCached = listData.length > 0;
      loadQueue({ showLoading: !hasCached });
    }, [loadQueue, listData.length]),
  );

  useEffect(() => subscribeProductionRefresh(() => loadQueue({ showLoading: false })), [loadQueue]);

  const wrapJobBusy = async (jobId, fn) => {
    setBusyId(`job:${jobId}`);
    try {
      await fn();
      await loadQueue();
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || '');
    } finally {
      setBusyId('');
    }
  };

  const onPlay = (jobId) => wrapJobBusy(jobId, () => resumePaintingProductionJob(jobId));
  const onPause = (jobId) => wrapJobBusy(jobId, () => pausePaintingProductionJob(jobId));

  const onFinish = (job) => {
    const jobId = job.job_id || job.id;
    const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
    const name = job.product_name || 'product';
    const matCount = (job.manual_material_lines || []).length;
    let body = tUi('paintingJobFinishBody', locale)
      .replace('{name}', name)
      .replace('{qty}', String(qty));
    if (matCount === 0) body = `${body}\n\n${tUi('jobFinishNoMaterialsHint', locale)}`;
    Alert.alert(
      tUi('upholsteryJobFinishTitle', locale),
      body,
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('upholsteryJobFinish', locale),
          style: 'destructive',
          onPress: () => wrapJobBusy(jobId, async () => {
            await finishPaintingProductionJob(jobId);
            Alert.alert(tUi('upholsteryJobFinish', locale), tUi('paintingJobFinishDone', locale));
          }),
        },
      ],
    );
  };

  const runReturnOp = async (row, op, body) => {
    setBusyId(`return:${row.id}`);
    setError('');
    try {
      await warehouseMobileRequest(op, { return_order_id: row.id, ...body });
      await loadQueue();
    } catch (err) {
      setError(err?.message || tUi('returnAcceptFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const onReturnPlay = (row) => {
    if (row.status === 'submitted') {
      runReturnOp(row, 'return-order-accept');
      return;
    }
    runReturnOp(row, 'return-order-resume');
  };

  const onReturnPause = (row) => runReturnOp(row, 'return-order-pause');

  const onReturnStop = (row) => {
    Alert.alert(
      tUi('repairCompleteConfirm', locale),
      tUi('repairCompleteFloor2Hint', locale),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('repairCompleteConfirmBtn', locale),
          onPress: () => runReturnOp(row, 'return-order-complete'),
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
      <View style={styles.toolbar}>
        <Pressable
          style={styles.toolbarBtn}
          onPress={() => navigation.navigate('PushSettings')}
        >
          <MaterialCommunityIcons name="bell-cog-outline" size={22} color={KIOSK_ICON_BLUE_ON_DARK} />
          <Text style={styles.toolbarBtnText}>{tUi('paintingOpenPushSettings', locale)}</Text>
        </Pressable>
      </View>
      {loading && listData.length === 0 ? (
        <ActivityIndicator color={KIOSK_ICON_BLUE_ON_DARK} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.sortKey}
        refreshing={loading}
        onRefresh={() => {
          setLoading(true);
          loadQueue();
        }}
        contentContainerStyle={listData.length === 0 ? styles.listEmpty : { paddingBottom: 24 }}
        renderItem={({ item }) => {
          if (item.kind === 'return') {
            const row = item.row;
            return (
              <View>
                <Text style={[styles.kindChip, styles.kindChipReturn, { alignSelf: textAlign === 'right' ? 'flex-end' : 'flex-start' }]}>
                  {tUi('paintingQueueBadgeReturn', locale)}
                </Text>
                <RepairCard
                  row={row}
                  locale={locale}
                  textAlign={textAlign}
                  busy={busyId === `return:${row.id}`}
                  onPlay={onReturnPlay}
                  onPause={onReturnPause}
                  onStop={onReturnStop}
                  onMaterials={(r) => setRepairMaterials(r)}
                />
              </View>
            );
          }
          const jobRow = item.job;
          return (
            <JobCard
              job={jobRow}
              locale={locale}
              textAlign={textAlign}
              busy={busyId === `job:${jobRow.job_id || jobRow.id}`}
              onPlay={onPlay}
              onPause={onPause}
              onFinish={onFinish}
              onMaterials={(job) => setMaterialsJob(job)}
            />
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('paintingJobEmpty', locale)}
            </Text>
          ) : null
        }
      />
      <ProductionJobMaterialsModal
        visible={!!materialsJob}
        locale={locale}
        textAlign={textAlign}
        jobKind="painting"
        jobId={materialsJob?.job_id || materialsJob?.id || ''}
        initialLines={materialsJob?.manual_material_lines || []}
        onClose={() => setMaterialsJob(null)}
        onSaved={() => {
          setMaterialsJob(null);
          loadQueue();
        }}
      />
      <ProductionJobMaterialsModal
        visible={!!repairMaterials}
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
          loadQueue();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { marginTop: 24 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  toolbarBtnText: { fontSize: 14, fontWeight: '600', color: theme.primary },
  kindChip: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: theme.primaryDark,
    marginBottom: 4,
  },
  kindChipReturn: { color: theme.danger },
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
