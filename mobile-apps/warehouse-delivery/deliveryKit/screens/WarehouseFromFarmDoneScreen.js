import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  buildFarmReturnWhatsAppText,
  shareFarmTransferReceipt,
} from '../lib/shareFarmTransferReceipt';

export default function WarehouseFromFarmDoneScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const transferRef = route.params?.transferRef || '';
  const driverName = route.params?.driverName || '';
  const dispatchedByName = route.params?.dispatchedByName || '';
  const shareGroups = route.params?.shareGroups || [];
  const submittedAt = route.params?.submittedAt || '';
  const [sharing, setSharing] = useState(false);

  const whatsappText = useMemo(() => buildFarmReturnWhatsAppText({
    transferRef,
    driverName,
    dispatchedByName,
    submittedAt,
    shareGroups,
  }), [transferRef, driverName, dispatchedByName, submittedAt, shareGroups]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!whatsappText || cancelled) return;
      setSharing(true);
      try {
        await shareFarmTransferReceipt(whatsappText);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('مشاركة', e?.message || 'تعذرت المشاركة');
        }
      } finally {
        if (!cancelled) setSharing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [whatsappText]);

  const handleShareAgain = async () => {
    setSharing(true);
    try {
      await shareFarmTransferReceipt(whatsappText);
    } catch (e) {
      Alert.alert('مشاركة', e?.message || 'تعذرت المشاركة');
    } finally {
      setSharing(false);
    }
  };

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar
        title="تم الإرسال إلى المستودع"
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <View style={styles.centerBlock}>
        <View style={kiosk.card}>
          <Text style={[kiosk.title, { textAlign, fontSize: 22 }]}>تم النقل</Text>
          <Text style={[styles.ref, { textAlign }]}>{transferRef}</Text>
          <Text style={[kiosk.metaLine, { textAlign }]}>
            لا يوجد طباعة A4 — شارك الإيصال عبر واتساب أو أي تطبيق من قائمة المشاركة.
          </Text>
        </View>
        <Pressable
          style={[kiosk.btnOutlinePrimary, styles.shareAgain]}
          onPress={handleShareAgain}
          disabled={sharing}
        >
          <Text style={kiosk.btnOutlinePrimaryText}>
            {sharing ? '…' : 'مشاركة مرة أخرى (واتساب)'}
          </Text>
        </Pressable>
        <Pressable style={[kiosk.btnPrimaryBlock, styles.btn]} onPress={() => navigation.popToTop()}>
          <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryBackDashboard', locale)}</Text>
        </Pressable>
      </View>
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 320,
  },
  ref: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.primary,
    marginVertical: 12,
  },
  shareAgain: { marginTop: 16 },
  btn: { marginTop: 12 },
});
