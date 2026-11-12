import { useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';
import { tUi } from '../lib/productionKioskI18n';

/**
 * Scan / pick → product summary + qty → add to cart (farm transfer flows).
 */
export default function DeliveryFarmQtyAddModal({
  visible,
  locale,
  textAlign = 'left',
  productName = '',
  productSku = '',
  maxQty = 0,
  onConfirm,
  onClose,
}) {
  const [qty, setQty] = useState('1');

  useEffect(() => {
    if (visible) setQty('1');
  }, [visible, productName, productSku]);

  if (!visible) return null;

  const maxLine = maxQty > 0
    ? tUi('deliveryFarmQtyMax', locale).replace('{n}', String(maxQty))
    : '';

  const submit = () => {
    Keyboard.dismiss();
    onConfirm?.(qty);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, { textAlign }]}>
            {tUi('deliveryFarmScanAddTitle', locale)}
          </Text>
          <Text style={[styles.name, { textAlign }]} numberOfLines={3}>
            {productName || '—'}
          </Text>
          {productSku ? (
            <Text style={[styles.sku, { textAlign }]} numberOfLines={1}>
              {productSku}
            </Text>
          ) : null}
          {maxLine ? (
            <Text style={[styles.maxLine, { textAlign }]}>{maxLine}</Text>
          ) : null}
          <Text style={[kiosk.label, { textAlign, marginTop: 14 }]}>
            {tUi('deliveryFarmQtyLabel', locale)}
          </Text>
          <TextInput
            style={[kiosk.input, { textAlign, marginTop: 6 }]}
            keyboardType="number-pad"
            value={qty}
            onChangeText={setQty}
            selectTextOnFocus
          />
          <Pressable style={[kiosk.btnPrimaryBlock, { marginTop: 16 }]} onPress={submit}>
            <Text style={kiosk.btnPrimaryBlockText}>
              {tUi('deliveryFarmAddToCart', locale)}
            </Text>
          </Pressable>
          <Pressable style={[kiosk.btnOutlinePrimary, { marginTop: 10 }]} onPress={onClose}>
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
  name: { fontSize: 17, fontWeight: '700', color: theme.text, marginTop: 10 },
  sku: { fontSize: 13, fontWeight: '600', color: theme.textMuted, marginTop: 4 },
  maxLine: { fontSize: 13, color: theme.primary, marginTop: 8, fontWeight: '600' },
});
