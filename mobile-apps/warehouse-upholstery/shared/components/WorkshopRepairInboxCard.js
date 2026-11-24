import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { repairInboxCustomerLabel } from '../lib/productionInboxKinds';
import { WorkshopRepairKindBadge } from './WorkshopInboxKindBadges';
import { isCompletedAwaitingDelivery } from '../lib/deliveryAdminDisplayStatus';

function returnCardTitle(row) {
  const meta = row?.metadata || {};
  const total = Number(meta.batch_line_count) || 0;
  const index = Number(meta.batch_line_index) || 0;
  if (total > 1 && index > 0) {
    return `${row.return_number} · unit ${index}/${total}`;
  }
  return row.return_number;
}

export default function WorkshopRepairInboxCard({
  row,
  locale,
  textAlign,
  busy,
  onPlay,
  onPause,
  onStop,
  onMaterials,
  tUi,
  textForDisplay,
  RunningRepairElapsed,
}) {
  const display = typeof textForDisplay === 'function' ? textForDisplay : (v) => String(v ?? '');
  const status = row.status;
  const timerStatus = row.timer_status || 'ready';
  const isSubmitted = status === 'submitted';
  const isRunning = timerStatus === 'running';
  const isPaused = timerStatus === 'paused';
  const canPlay = isSubmitted || isPaused;
  const inRepair = status === 'in_progress';
  const canMaterials = isSubmitted || inRepair;
  const awaitingDelivery = isCompletedAwaitingDelivery(row);
  const customerLabel = repairInboxCustomerLabel(row, tUi, locale);

  return (
    <View style={styles.card}>
      <WorkshopRepairKindBadge locale={locale} textAlign={textAlign} tUi={tUi} />
      <Text style={[styles.title, { textAlign }]}>{returnCardTitle(row)}</Text>
      {awaitingDelivery ? (
        <Text style={[styles.awaitingChip, { textAlign }]}>
          {tUi('deliveryStatus_completedAwaiting', locale)}
        </Text>
      ) : null}
      <Text style={[styles.customerName, { textAlign }]}>{customerLabel}</Text>
      <Text style={[styles.product, { textAlign }]}>
        {display(row.assembly_name, '—')} × {row.quantity}
      </Text>
      <Text style={[styles.meta, { textAlign }]}>
        {tUi('returnReason', locale)}: {row.reason}
      </Text>
      {row.customer_phone ? (
        <Text style={[styles.meta, { textAlign }]}>{row.customer_phone}</Text>
      ) : null}
      {(inRepair || row.elapsed_ms > 0) && RunningRepairElapsed ? (
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>{tUi('quoteOrderTimer', locale)}</Text>
          <RunningRepairElapsed row={row} style={styles.timerValue} />
          {inRepair ? (
            <Text style={styles.statusChip}>
              {tUi(`repairTimerStatus_${timerStatus}`, locale)}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.iconRow}>
        {canPlay ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onPlay(row)}
            accessibilityLabel={tUi('returnAccept', locale)}
          >
            <MaterialCommunityIcons name="play-circle" size={52} color={theme.primary} />
          </Pressable>
        ) : null}
        {isRunning ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onPause(row)}
            accessibilityLabel={tUi('upholsteryJobPause', locale)}
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color={theme.primary} />
          </Pressable>
        ) : null}
        {canMaterials ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onMaterials?.(row)}
            accessibilityLabel={tUi('quoteOrderMaterials', locale)}
          >
            <MaterialCommunityIcons name="wrench" size={48} color={theme.primary} />
          </Pressable>
        ) : null}
        {inRepair ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onStop(row)}
            accessibilityLabel={tUi('returnComplete', locale)}
          >
            <MaterialCommunityIcons name="stop-circle" size={52} color={theme.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: { fontSize: 16, fontWeight: '800', color: theme.primary, marginBottom: 4 },
  customerName: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 4 },
  product: { fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 4 },
  meta: { fontSize: 13, color: theme.muted, marginBottom: 4 },
  awaitingChip: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 6,
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  timerLabel: { fontSize: 13, color: theme.muted },
  timerValue: { fontSize: 20, fontWeight: '800', color: theme.primary },
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
    paddingBottom: 12,
  },
  iconBtn: { padding: 12, minWidth: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
});