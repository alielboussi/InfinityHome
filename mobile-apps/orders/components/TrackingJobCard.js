import { StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import RunningJobElapsed, { computeJobElapsedMs } from '../shared/components/RunningJobElapsed';
import { formatProductionElapsed } from '../shared/lib/formatProductionElapsed';
import { formatDateTime } from '../lib/warehouseReturnUi';

const TRACKING_DEPARTMENTS = [
  { id: 'all', label: 'All' },
  { id: 'upholstery', label: 'Upholstery' },
  { id: 'carpentry', label: 'Carpentry' },
  { id: 'painting', label: 'Painting' },
];

export { TRACKING_DEPARTMENTS };

function timerJobForElapsed(row) {
  const running = row?.timer_status === 'running';
  return {
    ...row,
    status: row?.timer_status || row?.status,
    job_id: row?.production_job_id || row?.id,
    accumulated_ms: row?.accumulated_ms,
    elapsed_ms: running ? undefined : row?.elapsed_ms,
    timer_started_at: row?.timer_started_at,
  };
}

function staticElapsedLabel(row) {
  const end = row?.completed_at;
  const start = row?.started_at;
  if (end && start) {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      return formatProductionElapsed(b - a);
    }
  }
  const job = timerJobForElapsed(row);
  const ms = computeJobElapsedMs(job);
  if (ms > 0) return formatProductionElapsed(ms);
  return '—';
}

function DetailRow({ label, value, emphasize, always = false }) {
  const display = value != null && String(value).trim() ? String(value).trim() : '—';
  if (!always && display === '—') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, emphasize && styles.detailEmphasis]} numberOfLines={3}>
        {display}
      </Text>
    </View>
  );
}

export default function TrackingJobCard({ row }) {
  const liveRunning = row?.timer_status === 'running';
  const livePaused = row?.timer_status === 'paused';
  const jobForTimer = timerJobForElapsed(row);
  const productLine = [
    row?.product_name,
    row?.product_sku ? `SKU ${row.product_sku}` : '',
    row?.product_qty != null ? `Qty ${row.product_qty}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={[kiosk.card, styles.card]}>
      <View style={styles.badgeRow}>
        <Text style={styles.deptBadge}>{row?.department_label || row?.department || '—'}</Text>
        {livePaused ? <Text style={styles.timerChip}>Paused</Text> : null}
        {liveRunning ? <Text style={styles.timerChip}>Running</Text> : null}
      </View>

      <Text style={styles.jobTitle}>{row?.product_name || '—'}</Text>
      <Text style={styles.statusLine}>{row?.flow_status || '—'}</Text>

      <DetailRow always label="Product" value={productLine} emphasize />
      <DetailRow always label="Department" value={row?.department_label} />
      <DetailRow always label="Started" value={formatDateTime(row?.started_at)} />
      <DetailRow always label="Completed" value={formatDateTime(row?.completed_at)} />

      <View style={styles.timerBlock}>
        <Text style={styles.timerLabel}>Time elapsed</Text>
        {liveRunning ? (
          <RunningJobElapsed job={jobForTimer} style={styles.timerValue} />
        ) : (
          <Text style={styles.timerValue}>{staticElapsedLabel(row)}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  deptBadge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  timerChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
  },
  jobTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  statusLine: { fontSize: 15, fontWeight: '600', color: '#0369a1', marginBottom: 10 },
  detailRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  detailLabel: { width: 92, color: '#64748b', fontSize: 13 },
  detailValue: { flex: 1, fontSize: 13 },
  detailEmphasis: { fontWeight: '600' },
  timerBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#cbd5e1' },
  timerLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  timerValue: { fontSize: 18, fontWeight: '700', color: '#0369a1' },
});
