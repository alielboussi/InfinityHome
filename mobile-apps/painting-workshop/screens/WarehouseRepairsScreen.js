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
import { kiosk, KIOSK_ICON_BLUE_ON_DARK } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';
import ProductionJobMaterialsModal from '../components/ProductionJobMaterialsModal';
import RunningRepairElapsed from '../components/RunningRepairElapsed';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function returnCardTitle(row) {
  const meta = row?.metadata || {};
  const total = Number(meta.batch_line_count) || 0;
  const index = Number(meta.batch_line_index) || 0;
  if (total > 1 && index > 0) {
    return `${row.return_number} · unit ${index}/${total}`;
  }
  return row.return_number;
}

export function RepairCard({
  row,
  locale,
  textAlign,
  busy,
  onPlay,
  onPause,
  onStop,
  onMaterials,
}) {
  const status = row.status;
  const timerStatus = row.timer_status || 'ready';
  const isSubmitted = status === 'submitted';
  const isRunning = timerStatus === 'running';
  const isPaused = timerStatus === 'paused';
  const canPlay = isSubmitted || isPaused;
  const inRepair = status === 'in_progress';
  const canMaterials = isSubmitted || inRepair;

  return (
    <View style={[kiosk.card, styles.card]}>
      <Text style={[styles.title, { textAlign }]}>{returnCardTitle(row)}</Text>
      <Text style={[styles.product, { textAlign }]}>
        {textForDisplay(row.assembly_name, '—')} × {row.quantity}
      </Text>
      <Text style={[styles.meta, { textAlign }]}>
        {tUi('returnReason', locale)}: {row.reason}
      </Text>
      {row.customer_name ? (
        <View style={styles.customerBlock}>
          <Text style={[styles.customerName, { textAlign }]}>
            {textForDisplay(row.customer_name, '')}
          </Text>
          {row.customer_phone ? (
            <Text style={[styles.customerPhone, { textAlign }]}>{row.customer_phone}</Text>
          ) : null}
        </View>
      ) : null}
      {row.leather_code ? (
        <Text style={[styles.meta, { textAlign }]}>
          {tUi('returnLeather', locale)}: {row.leather_code}
        </Text>
      ) : null}
      {(inRepair || row.elapsed_ms > 0) ? (
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
            <MaterialCommunityIcons name="play-circle" size={52} color={KIOSK_ICON_BLUE_ON_DARK} />
          </Pressable>
        ) : null}
        {isRunning ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onPause(row)}
            accessibilityLabel={tUi('upholsteryJobPause', locale)}
          >
            <MaterialCommunityIcons name="pause-circle" size={52} color={KIOSK_ICON_BLUE_ON_DARK} />
          </Pressable>
        ) : null}
        {canMaterials ? (
          <Pressable
            style={styles.iconBtn}
            disabled={busy}
            onPress={() => onMaterials?.(row)}
            accessibilityLabel={tUi('quoteOrderMaterials', locale)}
          >
            <MaterialCommunityIcons name="wrench" size={48} color={KIOSK_ICON_BLUE_ON_DARK} />
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

export default function WarehouseRepairsScreen({
  route,
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
  const repairDepartment = route.params?.repairDepartment || 'upholstery';
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [repairMaterials, setRepairMaterials] = useState(null);

  const load = useCallback(async () => {
    if (!allowed) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('return-order-list', {
        for_production: true,
        repair_department: repairDepartment,
        hassan_only: true,
      });
      setRows(res?.return_orders || []);
    } catch (err) {
      setError(err?.message || tUi('returnLoadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, repairDepartment, locale]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const runOp = async (row, op, body) => {
    setBusyId(row.id);
    setError('');
    try {
      await warehouseMobileRequest(op, { return_order_id: row.id, ...body });
      await load();
    } catch (err) {
      setError(err?.message || tUi('returnAcceptFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const onPlay = (row) => {
    if (row.status === 'submitted') {
      runOp(row, 'return-order-accept');
      return;
    }
    runOp(row, 'return-order-resume');
  };

  const onPause = (row) => runOp(row, 'return-order-pause');

  const onStop = (row) => {
    const hasCustomer = Boolean(String(row.customer_name || '').trim());
    Alert.alert(
      tUi('repairCompleteConfirm', locale),
      tUi('repairDispositionPrompt', locale),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('repairDispositionFloor1', locale),
          onPress: () => runOp(row, 'return-order-complete'),
        },
        {
          text: tUi('repairDispositionDelivery', locale),
          onPress: () => completeAndDispatch(row, hasCustomer),
        },
      ],
    );
  };

  const completeAndDispatch = async (row, hasCustomer) => {
    setBusyId(row.id);
    setError('');
    try {
      await warehouseMobileRequest('return-order-complete', { return_order_id: row.id });
      const prepOp = hasCustomer
        ? 'return-order-customer-delivery-prepare'
        : 'return-order-ship-prepare';
      const prep = await warehouseMobileRequest(prepOp, { return_order_id: row.id });
      navigation.navigate('RepairReturnSignature', {
        dispatchKind: hasCustomer ? 'customer' : 'kitwe',
        returnOrderId: row.id,
        returnNumber: row.return_number,
        sessionId: prep.session_id,
        deliveryNumber: prep.delivery_number,
        printGroups: prep.print_groups || [],
        documentKind: prep.document_kind,
        customerName: prep.customer_name || row.customer_name,
        customerPhone: prep.customer_phone || row.customer_phone,
      });
    } catch (err) {
      setError(err?.message || tUi('returnCompleteFailed', locale));
      await load();
    } finally {
      setBusyId('');
    }
  };

  const titleKey = route.params?.titleKey || 'dashRepairs';

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.root]}>
        <ProductionKioskTopBar
          title={tUi(titleKey, locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={[kiosk.noticeErr, { textAlign: 'center', marginTop: 24 }]}>
          {tUi('accessDenied', locale)}
        </Text>
        {accessHint ? <Text style={[styles.hint, { textAlign: 'center' }]}>{accessHint}</Text> : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16, alignSelf: 'center' }]} onPress={() => onRefreshAccess()}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', locale)}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 16), styles.root]}>
      <ProductionKioskTopBar
        title={tUi(titleKey, locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={KIOSK_ICON_BLUE_ON_DARK} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={(
            <Text style={[kiosk.hint, { textAlign }]}>{tUi('repairQueueEmpty', locale)}</Text>
          )}
          renderItem={({ item }) => (
            <RepairCard
              row={item}
              locale={locale}
              textAlign={textAlign}
              busy={busyId === item.id}
              onPlay={onPlay}
              onPause={onPause}
              onStop={onStop}
              onMaterials={(row) => setRepairMaterials(row)}
            />
          )}
        />
      )}
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
          load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  product: { fontSize: 16, marginTop: 6, color: theme.text },
  meta: { fontSize: 14, marginTop: 4, color: theme.textMuted },
  customerBlock: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: theme.surface2 || '#f1f5f9',
  },
  customerName: { fontSize: 16, fontWeight: '700', color: theme.text },
  customerPhone: { fontSize: 15, marginTop: 4, color: theme.textMuted },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  timerLabel: { fontSize: 14, color: theme.textMuted },
  timerValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], color: theme.text },
  statusChip: { fontSize: 13, fontWeight: '600', color: theme.primaryDark },
  iconRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 16 },
  iconBtn: { alignItems: 'center' },
  hint: { color: theme.textMuted, marginTop: 10, fontSize: 13 },
});
