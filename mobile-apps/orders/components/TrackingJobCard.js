import { StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import RunningRepairElapsed, { computeRepairElapsedMs } from '../shared/components/RunningRepairElapsed';
import { formatProductionElapsed } from '../shared/lib/formatProductionElapsed';
import {
  deliveryAdminStageLabel,
  formatDateTime,
  repairDepartmentLabel,
  resolveReturnRepairDepartment,
  returnOrderLifecycleBadge,
  returnOrderUnitLabel,
} from '../lib/warehouseReturnUi';

function quoteNumber(row) {
  const meta = row?.metadata || {};
  return String(meta.quote_number || meta.quote_id || '').trim();
}

function startedAt(row) {
  return row?.work_started_at || row?.accepted_at || null;
}

function endedAt(row) {
  return row?.work_completed_at || null;
}

function staticElapsedLabel(row) {
  const end = endedAt(row);
  const start = startedAt(row);
  if (end && start) {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      return formatProductionElapsed(b - a);
    }
  }
  const ms = Number(row?.elapsed_ms) || 0;
  if (ms > 0) return formatProductionElapsed(ms);
  return '—';
}

function timerStatusLabel(row) {
  const s = String(row?.timer_status || '').trim();
  if (s === 'running') return 'Running';
  if (s === 'paused') return 'Paused';
  if (s === 'completed') return 'Completed';
  return '';
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
  const admin = row?.metadata?.delivery_admin;
  const stage = admin?.stage ? deliveryAdminStageLabel(admin.stage) : '';
  const deptId = row.repair_department || resolveReturnRepairDepartment(row);
  const badge = returnOrderLifecycleBadge(row);
  const quote = quoteNumber(row);
  const inProgress = String(row?.status || '') === 'in_progress';
  const timerNote = timerStatusLabel(row);
  const liveRunning = inProgress && row?.timer_status === 'running';

  return (
    <View style={[kiosk.card, styles.card]}>
      <View style={styles.badgeRow}>
        <Text style={styles.deptBadge}>{repairDepartmentLabel(deptId)}</Text>
        {stage ? <Text style={styles.stageBadge}>{stage}</Text> : null}
        {timerNote && inProgress ? <Text style={styles.timerChip}>{timerNote}</Text> : null}
      </View>

      <Text style={styles.jobTitle}>{returnOrderUnitLabel(row)}</Text>
      <Text style={styles.statusLine}>{String(row?.status || '').replace(/_/g, ' ')}</Text>

      <DetailRow always label="Quote #" value={quote} emphasize />
      <DetailRow
        always
        label="Product"
        value={[
          row?.assembly_name,
          row?.assembly_sku ? `SKU ${row.assembly_sku}` : '',
          row?.quantity != null ? `Qty ${row.quantity}` : '',
        ].filter(Boolean).join(' · ')}
      />
      <DetailRow always label="Customer" value={row?.customer_name} />
      <DetailRow always label="Phone" value={row?.customer_phone} />
      <DetailRow always label="Started" value={formatDateTime(startedAt(row))} />
      <DetailRow always label="Ended" value={formatDateTime(endedAt(row))} />

      <View style={styles.timerBlock}>
        <Text style={styles.timerLabel}>Time elapsed</Text>
        {liveRunning ? (
          <RunningRepairElapsed row={row} style={styles.timerValue} />
        ) : (
          <Text style={styles.timerValue}>
            {inProgress
              ? formatProductionElapsed(computeRepairElapsedMs(row))
              : staticElapsedLabel(row)}
          </Text>
        )}
      </View>

      {row?.reason ? (
        <Text style={kiosk.hint}>
          Reason: {row.reason}
          {row.leather_code ? ` · Leather: ${row.leather_code}` : ''}
        </Text>
      ) : null}
      {row?.outbound_delivery_number ? (
        <Text style={kiosk.hint}>Delivery note {row.outbound_delivery_number}</Text>
      ) : null}
      {badge ? <Text style={styles.lifecycle}>{badge}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  deptBadge: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#1e3a8a',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stageBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  timerChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  jobTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 2 },
  statusLine: { fontSize: 13, color: '#64748b', textTransform: 'capitalize', marginBottom: 10 },
  detailRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  detailLabel: {
    width: 76,
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 19,
  },
  detailEmphasis: { color: '#1d4ed8' },
  timerBlock: {
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  timerLabel: { fontSize: 12, fontWeight: '700', color: '#1e40af', marginBottom: 4 },
  timerValue: { fontSize: 22, fontWeight: '800', color: '#1d4ed8', fontVariant: ['tabular-nums'] },
  lifecycle: { marginTop: 6, fontSize: 13, fontWeight: '700', color: '#0369a1' },
});
