import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import {
  acceptCarpentryQuote,
  completeCarpentryQuote,
  scanCarpentryQuoteMaterial,
} from '../services/carpentryApi';
import { theme } from '../shared/theme';
import {
  QuoteProductionDrawingSection,
  QuoteProductionLineRows,
} from '../shared/quoteProductionOrderUi';

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function QuoteDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const quote = route.params?.quote || {};
  const quoteId = String(quote.quote_id || '');
  const startedAt = quote.run_started_at || quote.accepted_at;
  const [accepted, setAccepted] = useState(Boolean(quote.accepted_at));
  const [completed, setCompleted] = useState(Boolean(quote.completed_at));
  const [tick, setTick] = useState(Date.now());
  const [scan, setScan] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accepted || completed || !startedAt) return undefined;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [accepted, completed, startedAt]);

  const elapsedLabel = useMemo(() => {
    if (!startedAt || !accepted || completed) return '—';
    return formatElapsed(tick - new Date(startedAt).getTime());
  }, [startedAt, accepted, completed, tick]);

  const lines = Array.isArray(quote.lines) ? quote.lines : [];

  const onAccept = async () => {
    setBusy(true);
    try {
      await acceptCarpentryQuote(quoteId);
      setAccepted(true);
      quote.accepted_at = new Date().toISOString();
      quote.run_started_at = quote.accepted_at;
    } catch (e) {
      Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = () => {
    Alert.alert(
      tUi('quoteOrderEndConfirmTitle', locale),
      tUi('quoteOrderEndConfirmBody', locale),
      [
        { text: tUi('cancel', locale), style: 'cancel' },
        {
          text: tUi('quoteOrderEnd', locale),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await completeCarpentryQuote(quoteId);
              setCompleted(true);
              Alert.alert(tUi('quoteOrderEndConfirmTitle', locale), tUi('quoteOrderCompleteDone', locale));
              navigation.goBack();
            } catch (e) {
              Alert.alert(tUi('quoteOrderFailed', locale), e?.message || '');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const onScanSubmit = async () => {
    const value = scan.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (!accepted) await acceptCarpentryQuote(quoteId);
      setAccepted(true);
      await scanCarpentryQuoteMaterial(quoteId, value, 1);
      setScan('');
      Alert.alert(tUi('quoteOrderMaterials', locale), tUi('quoteOrderScanDeducted', locale));
    } catch (e) {
      Alert.alert(tUi('quoteOrderScanFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={[kiosk.screen, styles.flex]}
      contentContainerStyle={[kioskScreenEdgesSafe(insets, 16), { paddingBottom: 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <ProductionKioskTopBar
        title={tUi('quoteOrderScreenTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[styles.quoteNum, { textAlign }]}>{quote.quote_number || quoteId}</Text>
      <Text style={[styles.name, { textAlign }]}>{quote.customer_name}</Text>
      <Text style={[styles.phone, { textAlign }]}>{quote.customer_phone || '—'}</Text>
      <QuoteProductionDrawingSection
        drawingUrl={quote.drawing_url}
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
      />
      <View style={styles.timerBox}>
        <Text style={[styles.timerLabel, { textAlign }]}>{tUi('quoteOrderTimer', locale)}</Text>
        <Text style={styles.timer}>{elapsedLabel}</Text>
      </View>
      {!accepted && !completed ? (
        <Pressable style={[kiosk.btn, styles.actionBtn]} disabled={busy} onPress={onAccept}>
          <Text style={kiosk.btnText}>{tUi('quoteOrderAcceptStart', locale)}</Text>
        </Pressable>
      ) : null}
      {accepted && !completed ? (
        <Pressable style={[kiosk.btn, styles.actionBtn, styles.danger]} disabled={busy} onPress={onComplete}>
          <Text style={kiosk.btnText}>{tUi('quoteOrderEnd', locale)}</Text>
        </Pressable>
      ) : null}
      <Text style={[kiosk.label, styles.section, { textAlign }]}>{tUi('quoteOrderMaterials', locale)}</Text>
      <TextInput
        style={[kiosk.input, { textAlign: locale === 'ar' ? 'right' : 'left' }]}
        placeholder={tUi('quoteOrderScanPlaceholder', locale)}
        placeholderTextColor="#94a3b8"
        value={scan}
        onChangeText={setScan}
        onSubmitEditing={onScanSubmit}
        editable={!completed && !busy}
      />
      <Pressable style={[kiosk.btn, styles.actionBtn]} disabled={busy || completed} onPress={onScanSubmit}>
        <Text style={kiosk.btnText}>{tUi('quoteOrderDeductScan', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.label, styles.section, { textAlign }]}>{tUi('quoteOrderLines', locale)}</Text>
      <QuoteProductionLineRows
        lines={lines}
        route="carpentry"
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  quoteNum: { color: theme.primary, fontWeight: '700', fontSize: 18, marginBottom: 4 },
  name: { color: theme.text, fontSize: 17, fontWeight: '600' },
  phone: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
  timerBox: { marginVertical: 16, padding: 16, backgroundColor: theme.surface, borderRadius: 12 },
  timerLabel: { color: theme.textMuted },
  timer: { color: theme.primary, fontSize: 28, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  actionBtn: { alignSelf: 'stretch', marginBottom: 8 },
  danger: { backgroundColor: '#7f1d1d' },
  section: { marginTop: 16, marginBottom: 8 },
  line: { color: theme.textSecondary, marginBottom: 4 },
});
