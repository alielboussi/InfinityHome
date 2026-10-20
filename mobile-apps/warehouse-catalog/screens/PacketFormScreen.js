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
import { useWarehouseCatalog } from '../shared/WarehouseCatalogContext';
import { fetchWarehouseCatalogCached } from '../shared/warehouseCatalogStore';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import { WAREHOUSE_LABEL_OCR_FIELD } from '../shared/warehouseLabelFieldOcr';
import LabelFieldWithOcrCamera from '../shared/LabelFieldWithOcrCamera';
import { LABEL_NAME_MEMORY_KIND } from '../shared/warehouseLabelOcrName';
import { rememberLabelName } from '../shared/warehouseLabelNameMemory';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { theme } from '../shared/theme';

export default function PacketFormScreen({ route, navigation }) {
  const prefill = route.params?.prefill || {};
  const packetId = prefill.id != null ? String(prefill.id) : '';
  const isEdit = Boolean(packetId);
  const [catalog, setCatalog] = useState(null);

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

  const warehouseLocationId = useMemo(
    () => catalog?.warehouseLocationId || route.params?.warehouseLocationId || null,
    [catalog, route.params?.warehouseLocationId],
  );

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

  const { refresh: refreshGlobalCatalog } = useWarehouseCatalog();

  const refreshCatalog = useCallback(async () => {
    try {
      const data = await fetchWarehouseCatalogCached({ force: false });
      setCatalog(data);
    } catch {
      /* keep route params if refresh fails */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!catalog) refreshCatalog();
      if (isEdit) applyPrefill();
      else focusSku();
    }, [applyPrefill, catalog, focusSku, isEdit, refreshCatalog]),
  );

  useFocusEffect(
    useCallback(() => {
      const field = route.params?.labelOcrField;
      const value = route.params?.labelFieldValue;
      if (!field || value == null || value === '') return;
      if (field === WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU) {
        const nextSku = String(value);
        setSku(nextSku);
        setNotice('Packet SKU from label OCR — edit if needed.');
        const key = normalizeWarehouseWedgeScanInput(nextSku, 'packet') || nextSku.trim();
        if (key && name?.trim()) {
          rememberLabelName({
            sku: key,
            kind: LABEL_NAME_MEMORY_KIND.PACKET,
            name: name.trim(),
          }).catch(() => {});
        }
      } else if (field === WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME) {
        const nextName = String(value);
        setName(nextName);
        setNotice('Packet name from label OCR — edit if needed.');
        const key = normalizeWarehouseWedgeScanInput(sku, 'packet') || String(sku || '').trim();
        if (key && nextName.trim()) {
          rememberLabelName({
            sku: key,
            kind: LABEL_NAME_MEMORY_KIND.PACKET,
            name: nextName.trim(),
          }).catch(() => {});
        }
      }
      navigation.setParams({
        labelOcrField: undefined,
        labelFieldValue: undefined,
      });
    }, [name, navigation, route.params?.labelFieldValue, route.params?.labelOcrField, sku]),
  );

  const openOcrCamera = useCallback((field) => {
    navigation.navigate('WarehouseLabelCapture', {
      ocrField: field,
      returnScreen: 'PacketForm',
    });
  }, [navigation]);

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
        await rememberLabelName({
          sku: normalizedSku,
          kind: LABEL_NAME_MEMORY_KIND.PACKET,
          name: name.trim(),
        });
        refreshGlobalCatalog({ force: true, background: true }).catch(() => {});
        setNotice('Changes saved.');
        navigation.goBack();
        return;
      }
      await warehouseMobileRequest('packet-create', {
        ...payload,
        initial_quantity: Number(initialQty) || 0,
      });
      await rememberLabelName({
        sku: normalizedSku,
        kind: LABEL_NAME_MEMORY_KIND.PACKET,
        name: name.trim(),
      });
      refreshGlobalCatalog({ force: true, background: true }).catch(() => {});
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
      <Text style={styles.hint}>
        Use 📷 OCR on each field for Lenor, Prizma, or Serra labels — printed text only (not barcodes). Edit before saving.
      </Text>
      <LabelFieldWithOcrCamera
        label="SKU (printed on label)"
        ocrField={WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU}
        onOpenOcrCamera={openOcrCamera}
        inputRef={skuInputRef}
        value={sku}
        onChangeText={wedgeAwareTextChange(setSku, {
          stripScanTerminator,
          keepFocusAfterSubmit: keepSkuKeyboard,
          transform: (v) => v.toUpperCase(),
          onWedgeComplete: (v) => {
            const normalized = normalizeWarehouseWedgeScanInput(v, 'packet');
            if (normalized) setSku(normalized);
          },
        })}
        editable
        mono
        onBlur={wrapSkuBlur(normalizeSkuField)}
        returnKeyType="done"
        onSubmitEditing={onSkuSubmit}
      />
      <LabelFieldWithOcrCamera
        label="Name (English)"
        ocrField={WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME}
        onOpenOcrCamera={openOcrCamera}
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
        autoCapitalize={mono ? 'none' : 'sentences'}
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
  labelScanBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  labelScanBtnText: { color: '#7dd3fc', fontWeight: '600', fontSize: 13 },
});
