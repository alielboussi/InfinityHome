import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';

function mapReturnLoadError(err, locale) {
  const msg = String(err?.message || '').trim();
  if (/unknown op/i.test(msg)) {
    return tUi('returnServerNotDeployed', locale);
  }
  return msg || tUi('returnLoadFailed', locale);
}

function formatElapsed(startIso, endIso) {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  if (!Number.isFinite(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function ReturnCard({
  row,
  locale,
  textAlign,
  onAccept,
  onComplete,
  onShip,
  onCustomerLabel,
  onCustomerNote,
  labelBusyId,
}) {
  const inProgress = row.status === 'in_progress';
  const timerStopped = Boolean(row.work_completed_at) && row.status === 'completed';
  const showCustomerLabel = Boolean(String(row.customer_name || '').trim()) && timerStopped;
  const timerLabel = inProgress
    ? formatElapsed(row.work_started_at || row.accepted_at)
    : row.work_completed_at
      ? formatElapsed(row.work_started_at, row.work_completed_at)
      : null;

  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { textAlign }]}>{row.return_number}</Text>
      <Text style={[styles.cardProduct, { textAlign }]}>
        {row.assembly_name} × {row.quantity}
      </Text>
      <Text style={[styles.cardMeta, { textAlign }]}>
        {tUi('returnReason', locale)}: {row.reason}
      </Text>
      {row.customer_name ? (
        <Text style={[styles.cardMeta, { textAlign }]}>
          {tUi('returnCustomer', locale)}: {row.customer_name}
          {row.customer_phone ? ` · ${row.customer_phone}` : ''}
        </Text>
      ) : null}
      {row.leather_code ? (
        <Text style={[styles.cardMeta, { textAlign }]}>
          {tUi('returnLeather', locale)}: {row.leather_code}
        </Text>
      ) : null}
      {timerLabel ? (
        <Text style={[styles.timer, { textAlign }]}>
          ⏱ {timerLabel}
          {inProgress ? ` ${tUi('returnTimerRunning', locale)}` : ''}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {row.status === 'submitted' ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onAccept(row)}
            accessibilityLabel={tUi('returnAccept', locale)}
          >
            <MaterialCommunityIcons name="play-circle-outline" size={36} color={theme.primaryDark} />
            <Text style={styles.iconLabel}>{tUi('returnAccept', locale)}</Text>
          </Pressable>
        ) : null}
        {inProgress ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onComplete(row)}
            accessibilityLabel={tUi('returnComplete', locale)}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={36} color="#15803d" />
            <Text style={styles.iconLabel}>{tUi('returnComplete', locale)}</Text>
          </Pressable>
        ) : null}
        {row.status === 'completed' ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => onShip(row)}
            accessibilityLabel={tUi('returnShip', locale)}
          >
            <MaterialCommunityIcons name="truck-delivery-outline" size={36} color="#b45309" />
            <Text style={styles.iconLabel}>{tUi('returnShip', locale)}</Text>
          </Pressable>
        ) : null}
        {showCustomerLabel ? (
          <>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onCustomerNote(row)}
              accessibilityLabel={tUi('returnCustomerNote', locale)}
            >
              <Text style={styles.emojiIcon}>👤</Text>
              <Text style={styles.iconLabel}>{tUi('returnCustomerNote', locale)}</Text>
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onCustomerLabel(row)}
              disabled={labelBusyId === row.id}
              accessibilityLabel={tUi('returnCustomerLabel', locale)}
            >
              {labelBusyId === row.id ? (
                <ActivityIndicator size={32} />
              ) : (
                <MaterialCommunityIcons name="printer-outline" size={36} color="#7c3aed" />
              )}
              <Text style={styles.iconLabel}>{tUi('returnCustomerLabel', locale)}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

export default function ReturnOrdersScreen({ navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [labelBusyId, setLabelBusyId] = useState('');
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('return-order-list', { for_production: true });
      setRows(res?.return_orders || []);
    } catch (err) {
      setError(mapReturnLoadError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const accept = async (row) => {
    try {
      await warehouseMobileRequest('return-order-accept', { return_order_id: row.id });
      await load();
    } catch (err) {
      setError(err?.message || tUi('returnAcceptFailed', locale));
    }
  };

  const complete = async (row) => {
    setError('');
    try {
      await warehouseMobileRequest('return-order-complete', { return_order_id: row.id });
      await load();
    } catch (err) {
      setError(err?.message || tUi('returnCompleteFailed', locale));
    }
  };

  const ship = async (row) => {
    try {
      const prep = await warehouseMobileRequest('return-order-ship-prepare', {
        return_order_id: row.id,
      });
      navigation.navigate('ReturnOrderSignature', {
        mode: 'ship',
        returnOrderId: row.id,
        returnNumber: row.return_number,
        sessionId: prep.session_id,
        deliveryNumber: prep.delivery_number,
        printGroups: prep.print_groups || [],
      });
    } catch (err) {
      setError(err?.message || tUi('returnShipFailed', locale));
    }
  };

  const printCustomerLabel = async (row) => {
    setLabelBusyId(row.id);
    setError('');
    try {
      await warehouseMobileRequest('return-order-customer-label-print', {
        return_order_id: row.id,
      });
      await load();
    } catch (err) {
      setError(err?.message || tUi('returnLabelFailed', locale));
    } finally {
      setLabelBusyId('');
    }
  };

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar
        title={tUi('returnOrdersTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      {!loading && !rows.length ? (
        <Text style={[kiosk.metaLine, { textAlign, marginTop: 16 }]}>{tUi('returnEmpty', locale)}</Text>
      ) : null}
      <View style={styles.list}>
        {rows.map((row) => (
          <ReturnCard
            key={row.id}
            row={row}
            locale={locale}
            textAlign={textAlign}
            onAccept={accept}
            onComplete={complete}
            onShip={ship}
            onCustomerLabel={printCustomerLabel}
            onCustomerNote={(row) => navigation.navigate('ReturnCustomerNote', { row })}
            labelBusyId={labelBusyId}
          />
        ))}
      </View>
      <Pressable style={[kiosk.btnOutlinePrimary, { marginTop: 16 }]} onPress={load}>
        <Text style={kiosk.btnOutlinePrimaryText}>{tUi('returnRefresh', locale)}</Text>
      </Pressable>
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 8 },
  list: { gap: 12, marginTop: 12 },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: theme.surface,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  cardProduct: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  cardMeta: { fontSize: 14, color: theme.textMuted, marginTop: 4 },
  timer: { fontSize: 15, fontWeight: '700', color: theme.primaryDark, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 12 },
  iconBtn: { alignItems: 'center' },
  iconLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  emojiIcon: { fontSize: 34, lineHeight: 38 },
});
