import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function DeliveryFarmQtyAddModal({
  visible,
  locale,
  textAlign = 'left',
  productName = '',
  productSku = '',
  maxQty = 0,
  onClose,
  onConfirm,
}) {
  const [qty, setQty] = useState('1');

  useEffect(() => {
    if (visible) setQty('1');
  }, [visible, productSku, productName]);

  const handleConfirm = () => {
    const n = Math.max(1, Math.floor(Number(qty) || 0));
    const max = Math.max(0, Math.floor(Number(maxQty) || 0));
    if (max > 0 && n > max) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', String(max)),
      );
      return;
    }
    if (typeof onConfirm === 'function') onConfirm(n);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, { textAlign }]}>{tUi('deliveryFarmScanTitle', locale)}</Text>
          {productName ? (
            <Text style={[styles.product, { textAlign }]}>{productName}</Text>
          ) : null}
          {productSku ? (
            <Text style={[styles.sku, { textAlign }]}>{productSku}</Text>
          ) : null}
          <Text style={[kiosk.label, { textAlign, marginTop: 12 }]}>
            {tUi('deliveryFarmQtyLabel', locale)}
          </Text>
          <TextInput
            style={[kiosk.input, { textAlign }]}
            keyboardType="number-pad"
            value={qty}
            onChangeText={setQty}
            selectTextOnFocus
          />
          <Text style={[kiosk.metaLine, { textAlign }]}>
            {tUi('deliveryFarmQtyMax', locale).replace('{n}', String(Math.max(0, Math.floor(Number(maxQty) || 0))))}
          </Text>
          <Pressable style={[kiosk.btnPrimaryBlock, styles.confirmBtn]} onPress={handleConfirm}>
            <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryFarmAddToCart', locale)}</Text>
          </Pressable>
          <Pressable style={[kiosk.btnOutlinePrimary, styles.closeBtn]} onPress={onClose}>
            <Text style={kiosk.btnOutlinePrimaryText}>{tUi('presetPickerClose', locale)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.text },
  product: { color: theme.text, marginTop: 10, fontWeight: '700', fontSize: 16 },
  sku: { color: theme.muted, marginTop: 4, fontSize: 13 },
  confirmBtn: { marginTop: 14 },
  closeBtn: { marginTop: 10 },
});