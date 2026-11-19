import { StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import RunningJobElapsed, { computeJobElapsedMs } from '../shared/components/RunningJobElapsed';
import { formatProductionElapsed } from '../shared/lib/formatProductionElapsed';
import { formatDateTime } from '../lib/warehouseReturnUi';
import {
  QuoteProductionOrderBadges,
  orderBadgeTextStyle,
} from '../shared/quoteProductionOrderUi';
import {
  isProductionQuoteCustomerOrder,
  isProductionQuoteShowroomOrder,
} from '../shared/quoteShowroomOrder';

const TRACKING_DEPARTMENTS = [
  { id: 'all', label: 'All' },
  { id: 'upholstery', label: 'Upholstery' },
  { id: 'carpentry', label: 'Carpentry' },
  { id: 'painting', label: 'Painting' },
];

const TRACKING_KINDS = [
  { id: 'all', label: 'All types' },
  { id: 'factory', label: 'Factory job' },
  { id: 'quote', label: 'Quote order' },
  { id: 'showroom', label: 'Showroom' },
  { id: 'repair', label: 'Repair' },
];

export { TRACKING_DEPARTMENTS, TRACKING_KINDS };

function trackingRowAsQuote(row) {
  const quote = {
    showroom_order: row?.showroom_order === true || row?.track_kind === 'showroom_order',
    customer_order: row?.customer_order === true,
    track_kind: row?.track_kind,
  };
  if (quote.showroom_order) {
    quote.customer_order = false;
  } else if (row?.track_kind === 'quote_order' || row?.track_kind === 'quote') {
    quote.customer_order = true;
  }
  return quote;
}

function trackingKindLabel(row, tUi, locale) {
  const k = String(row?.track_kind || 'factory').toLowerCase();
  if (k === 'showroom_order' || k === 'showroom') return tUi('badgeShowroomOrder', locale);
  if (k === 'quote_order' || k === 'quote') return tUi('trackingKindQuoteOrder', locale);
  if (k === 'repair') return tUi('trackingKindRepair', locale);
  return tUi('trackingKindFactoryJob', locale);
}

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
      <Text style={[styles.detailValue, emphasize && styles.detailEmphasis]} numberOfLines={4}>
        {display}
      </Text>
    </View>
  );
}

export default function TrackingJobCard({
  row,
  locale = 'en',
  tUi = (key) => key,
  textAlign = 'left',
}) {
  const liveRunning = row?.timer_status === 'running';
  const livePaused = row?.timer_status === 'paused';
  const jobForTimer = timerJobForElapsed(row);
  const productLine = [
    row?.product_name,
    row?.product_sku ? `SKU ${row.product_sku}` : '',
    row?.product_qty != null ? `Qty ${row.product_qty}` : '',
  ].filter(Boolean).join(' · ');

  const refLine = row?.quote_number
    ? `Quote ${row.quote_number}`
    : (row?.return_number ? `Return ${row.return_number}` : null);

  const quoteShape = trackingRowAsQuote(row);
  const showCustomerShowroomBadges = isProductionQuoteShowroomOrder(quoteShape)
    || isProductionQuoteCustomerOrder(quoteShape);

  return (
    <View style={[kiosk.card, styles.card]}>
      <View style={styles.badgeRow}>
        {showCustomerShowroomBadges ? (
          <QuoteProductionOrderBadges
            quote={quoteShape}
            textAlign={textAlign}
            tUi={tUi}
            locale={locale}
          />
        ) : (
          <Text style={[styles.kindBadge, orderBadgeTextStyle(locale)]}>
            {trackingKindLabel(row, tUi, locale)}
          </Text>
        )}
        <Text style={styles.deptBadge}>{row?.department_label || row?.department || '—'}</Text>
        {livePaused ? <Text style={styles.timerChip}>Paused</Text> : null}
        {liveRunning ? <Text style={styles.timerChip}>Running</Text> : null}
      </View>

      <Text style={styles.jobTitle}>{row?.product_name || '—'}</Text>
      <Text style={styles.statusLine}>{row?.flow_status || '—'}</Text>

      {refLine ? <DetailRow always label="Reference" value={refLine} emphasize /> : null}
      <DetailRow always label="Product" value={productLine} emphasize />
      {row?.customer_name ? <DetailRow label="Customer" value={row.customer_name} /> : null}
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
  kindBadge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    overflow: 'hidden',
  },
  deptBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },
  timerChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
  },
  jobTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  statusLine: { fontSize: 14, fontWeight: '700', color: '#38bdf8', marginBottom: 8 },
  detailRow: { marginBottom: 6 },
  detailLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  detailValue: { fontSize: 14, color: '#e2e8f0' },
  detailEmphasis: { fontWeight: '700' },
  timerBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#334155' },
  timerLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  timerValue: { fontSize: 18, fontWeight: '800', color: '#38bdf8', fontVariant: ['tabular-nums'] },
});