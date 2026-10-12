import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import WarehouseCatalogFormScroll, {
  useScrollFieldIntoView,
} from '../shared/WarehouseCatalogFormScroll';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { normalizeWarehousePacketScan } from '../shared/warehouseScanResolver';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { theme } from '../shared/theme';

export default function PacketFormScreen({ route, navigation }) {
  const prefill = route.params?.prefill || {};
  const packetId = prefill.id != null ? String(prefill.id) : '';
  const isEdit = Boolean(packetId);
  const warehouseLocationId = route.params?.warehouseLocationId;

  const [sku, setSku] = useState(prefill.sku || '');
  const [name, setName] = useState(prefill.name || '');
  const [packetNumber, setPacketNumber] = useState(
    prefill.packet_number != null ? String(prefill.packet_number) : '',
  );
  const [qtyPerProduct, setQtyPerProduct] = useState(
    prefill.qty_per_unit != null ? String(prefill.qty_per_unit) : '1',
  );
  const [initialQty, setInitialQty] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const skuInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const scrollRef = useRef(null);
  const qtySectionY = useRef(0);
  const scrollFieldIntoView = useScrollFieldIntoView(scrollRef);
  const {
    keepFocusAfterSubmit: keepSkuKeyboard,
    wrapOnBlur: wrapSkuBlur,
    stripScanTerminator,
  } = useKeepSoftKeyboardOnScanSubmit(skuInputRef);

  const title = useMemo(() => (isEdit ? 'Edit packet' : 'New packet'), [isEdit]);

  const applyPrefill = useCallback(() => {
    const p = route.params?.prefill || {};
    setSku(p.sku || '');
    setName(p.name || '');
    setPacketNumber(p.packet_number != null ? String(p.packet_number) : '');
    setQtyPerProduct(p.qty_per_unit != null ? String(p.qty_per_unit) : '1');
    setError('');
    setNotice('');
  }, [route.params?.prefill]);

  const focusSku = useCallback(() => {
    setTimeout(() => {
      skuInputRef.current?.focus?.();
    }, 50);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isEdit) applyPrefill();
      else focusSku();
    }, [applyPrefill, focusSku, isEdit]),
  );

  useEffect(() => {
    if (!isEdit) focusSku();
  }, [focusSku, isEdit]);

  const normalizeSkuField = () => {
    const normalized = normalizeWarehousePacketScan(sku);
    if (normalized && normalized !== sku.trim()) setSku(normalized);
  };

  const resetForNextPacket = () => {
    setSku('');
    setName('');
    setPacketNumber('');
    setQtyPerProduct('1');
    setInitialQty('0');
    keepSkuKeyboard();
  };

  const onSave = async () => {
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured.');
      return;
    }
    const normalizedSku = normalizeWarehousePacketScan(sku);
    if (!normalizedSku) {
      setError('Packet SKU is required.');
      return;
    }
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        sku: normalizedSku,
        name: name.trim(),
        packet_number: Number(packetNumber),
        qty_per_unit: Math.max(1, Math.floor(Number(qtyPerProduct) || 1)),
        warehouse_location_id: warehouseLocationId,
      };
      if (isEdit) {
        await warehouseMobileRequest('packet-update', {
          ...payload,
          packet_id: packetId,
        });
        setNotice('Changes saved.');
        navigation.goBack();
        return;
      }
      await warehouseMobileRequest('packet-create', {
        ...payload,
        initial_quantity: Number(initialQty) || 0,
      });
      setNotice('Packet saved. Scan the next packet SKU.');
      resetForNextPacket();
    } catch (err) {
      setError(err?.message || 'Save failed.');
      if (!isEdit) keepSkuKeyboard();
    } finally {
      setBusy(false);
    }
  };

  const onSkuSubmit = () => {
    normalizeSkuField();
    keepSkuKeyboard();
  };

  return (
    <WarehouseCatalogFormScroll scrollRef={scrollRef} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Field
        label="SKU (Code 128)"
        inputRef={skuInputRef}
        value={sku}
        onChangeText={wedgeAwareTextChange(setSku, {
          stripScanTerminator,
          keepFocusAfterSubmit: keepSkuKeyboard,
          transform: (v) => v.toUpperCase(),
        })}
        editable
        mono
        onBlur={wrapSkuBlur(normalizeSkuField)}
        returnKeyType="done"
        onSubmitEditing={onSkuSubmit}
      />
      <Field
        label="Name"
        inputRef={nameInputRef}
        value={name}
        onChangeText={setName}
        returnKeyType="next"
      />
      <View
        onLayout={(e) => {
          qtySectionY.current = e.nativeEvent.layout.y;
        }}
      >
        <Field
          label="Packet #"
          value={packetNumber}
          onChangeText={setPacketNumber}
          keyboardType="number-pad"
          onFocus={() => scrollFieldIntoView(qtySectionY.current)}
        />
        <Field
          label="Qty per product"
          value={qtyPerProduct}
          onChangeText={setQtyPerProduct}
          keyboardType="number-pad"
          onFocus={() => scrollFieldIntoView(qtySectionY.current)}
        />
        {!isEdit && (
          <Field
            label="Qty on hand (warehouse)"
            value={initialQty}
            onChangeText={setInitialQty}
            keyboardType="number-pad"
            onFocus={() => scrollFieldIntoView(qtySectionY.current)}
          />
        )}
      </View>
      {isEdit ? (
        <Text style={styles.hint}>
          Carton on-hand qty is adjusted on the packets list. SKU, name, packet #, and qty per product save here.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable style={styles.btn} onPress={onSave} disabled={busy}>
        <Text style={styles.btnText}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create packet'}
        </Text>
      </Pressable>
    </WarehouseCatalogFormScroll>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType,
  mono,
  onBlur,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  onFocus,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, !editable && styles.inputDisabled, mono && styles.mono]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholderTextColor="#64748b"
        autoCapitalize={mono ? 'characters' : 'sentences'}
        autoComplete="off"
        blurOnSubmit={false}
        showSoftInputOnFocus
        onBlur={onBlur}
        onFocus={onFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: theme.space.lg, flexGrow: 1 },
  title: { color: theme.text, fontSize: 22, fontWeight: '800', marginBottom: theme.space.lg },
  field: { marginBottom: 14 },
  label: { color: theme.textMuted, marginBottom: 6, fontWeight: '600', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
  },
  mono: { fontFamily: 'monospace' },
  inputDisabled: { opacity: 0.7 },
  btn: {
    backgroundColor: theme.primaryBg,
    borderRadius: theme.radiusSm,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.primaryDark,
  },
  btnText: { color: theme.text, fontWeight: '700' },
  error: { color: theme.danger, marginTop: 8 },
  notice: { color: theme.success, marginTop: 8 },
  hint: { color: theme.textDim, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 4 },
});
