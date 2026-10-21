import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import WarehouseCatalogFormScroll, { useScrollFieldIntoView } from '../shared/WarehouseCatalogFormScroll';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from '../shared/warehouseScanResolver';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  listWarehouseLabelSkuSuggestions,
  resolveWarehouseLabelFromText,
  WAREHOUSE_LABEL_SCAN_MODE,
} from '../shared/warehouseLabelScanResolve';
import {
  extractWarehouseLabelFieldFromOcr,
  warehouseLabelOcrFieldHint,
  WAREHOUSE_LABEL_OCR_FIELD,
} from '../shared/warehouseLabelFieldOcr';
import {
  normalizeSlashedZeroGlyphs,
  normalizeSupplierZeroAndLetterOcrText,
} from '../shared/warehouseLabelOcrZeroO';
import { LABEL_NAME_MEMORY_KIND } from '../shared/warehouseLabelOcrName';
import { pickLabelNameForSku } from '../shared/warehouseLabelNameMemory';

const CAMERA_HEIGHT = 320;

const MODE_HINTS = {
  [WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON]:
    'Point at the packet label and capture. You do not need the whole label in frame — include the barcode or SKU text if you can.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY]:
    'Point at the unit label (family SKU text and/or YY barcode). Partial capture is fine — tap a suggested SKU if we are unsure.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_HEADER]:
    'Capture the label. Include the top SKU and/or YY barcode when possible; we read whatever is in the photo.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_NUMERIC]:
    'Capture the numeric barcode on the label. The full sticker does not need to fit in the frame.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO]:
    'Finished product: title (e.g. Lenor Ortasehpa 1B or Prizma Sandalye 2LI Turkuaz) plus small bottom barcode — numeric SKU (Type 1) or TU… code (Type 2). Partial label OK.',
};

export default function WarehouseLabelCaptureScreen({ navigation, route }) {
  const ocrField = route.params?.ocrField || null;
  const mode = route.params?.mode || WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO;
  const returnScreen = route.params?.returnScreen || 'PacketForm';
  const passthroughFormDraft = route.params?.formDraft;
  const labelScanTarget = route.params?.labelScanTarget;
  const cameraRef = useRef(null);
  const scrollRef = useRef(null);
  const inputLayoutY = useRef(0);
  const scrollFieldIntoView = useScrollFieldIntoView(scrollRef);
  const [permission, requestPermission] = useCameraPermissions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [manualText, setManualText] = useState('');
  const [lastRead, setLastRead] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const hint = useMemo(() => {
    if (ocrField) return warehouseLabelOcrFieldHint(ocrField);
    return MODE_HINTS[mode] || MODE_HINTS[WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO];
  }, [mode, ocrField]);

  const applyFieldValue = useCallback((value) => {
    if (!value) {
      setMessage('No text found for this field. Frame the printed line and try again.');
      return;
    }
    setLastRead(value);
    navigation.navigate({
      name: returnScreen,
      params: {
        labelOcrField: ocrField,
        labelFieldValue: value,
        ...(passthroughFormDraft ? { formDraft: passthroughFormDraft } : {}),
      },
      merge: true,
    });
  }, [navigation, ocrField, passthroughFormDraft, returnScreen]);

  const fieldValueFromManualText = useCallback((raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed || !ocrField) return '';
    const { value, candidates } = extractWarehouseLabelFieldFromOcr(trimmed, ocrField);
    if (value) return value;
    if (
      ocrField === WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_TURKISH
      || ocrField === WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME
    ) {
      const line = trimmed.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || trimmed;
      return line.slice(0, 200);
    }
    if (ocrField === WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU) {
      const fromList = candidates.find(Boolean);
      if (fromList) return fromList;
      return normalizeWarehousePacketScan(trimmed) || '';
    }
    if (ocrField === WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU) {
      const fromList = candidates.find(Boolean);
      if (fromList) return fromList;
      return normalizeWarehouseProductSku(trimmed) || '';
    }
    return '';
  }, [ocrField]);

  const resolveFieldFromText = useCallback(async (text, { allowManualFallback = false } = {}) => {
    const raw = String(text || '').trim();
    setManualText(raw);
    if (!raw) {
      setSuggestions([]);
      setMessage('Paste or capture label text first.');
      return false;
    }
    const { value, candidates } = extractWarehouseLabelFieldFromOcr(raw, ocrField);
    const alts = candidates.filter((c) => c && c !== value);
    setSuggestions(alts.map((c) => ({ sku: c })));
    if (value) {
      setMessage('');
      applyFieldValue(value);
      return true;
    }
    if (allowManualFallback) {
      const manual = fieldValueFromManualText(raw);
      if (manual) {
        setMessage('');
        setSuggestions([]);
        applyFieldValue(manual);
        return true;
      }
    }
    if (alts.length) {
      setMessage('Tap the best match below, or edit the text.');
    } else {
      setMessage('Could not read this field from the text. Adjust framing and try again.');
    }
    return false;
  }, [applyFieldValue, fieldValueFromManualText, ocrField]);

  const applyResolved = useCallback(async (result) => {
    if (!result?.sku) {
      setMessage('No SKU found in this text. Adjust the camera or edit the text below, then try again.');
      return;
    }
    setSuggestions([]);
    const kind = result.nameIntent === 'packet'
      ? LABEL_NAME_MEMORY_KIND.PACKET
      : LABEL_NAME_MEMORY_KIND.PRODUCT_TURKISH;
    const { name, nameSource } = await pickLabelNameForSku({
      sku: result.sku,
      kind,
      suggestedName: result.suggestedName,
    });
    const preview = name ? `${result.sku} — ${name}` : result.sku;
    setLastRead(preview);
    navigation.navigate({
      name: returnScreen,
      params: {
        labelScanSku: result.sku,
        ...(name ? { labelScanName: name } : {}),
        ...(nameSource ? { labelScanNameSource: nameSource } : {}),
        ...(labelScanTarget ? { labelScanTarget } : {}),
        ...(passthroughFormDraft ? { formDraft: passthroughFormDraft } : {}),
      },
      merge: true,
    });
  }, [labelScanTarget, navigation, passthroughFormDraft, returnScreen]);

  const resolveFromText = useCallback(async (text, { keepMessage, allowManualFallback = false } = {}) => {
    if (ocrField) {
      await resolveFieldFromText(text, { allowManualFallback });
      return;
    }
    const raw = String(text || '').trim();
    setManualText(raw);
    if (!raw) {
      setSuggestions([]);
      setMessage('Paste or capture label text first.');
      return;
    }
    const result = resolveWarehouseLabelFromText(raw, mode, { target: labelScanTarget });
    if (result.sku) {
      setMessage('');
      setSuggestions([]);
      await applyResolved(result);
      return;
    }
    const guesses = listWarehouseLabelSkuSuggestions(raw, mode, { target: labelScanTarget });
    setSuggestions(guesses);
    if (guesses.length) {
      setMessage(
        keepMessage
          ? ''
          : 'We read the photo but could not pick one SKU automatically. Tap the best match below, or edit the text.',
      );
    } else if (!keepMessage) {
      setMessage(
        'Could not find a SKU in this capture. Move closer to the barcode or printed code and try again.',
      );
    }
  }, [applyResolved, labelScanTarget, mode, ocrField, resolveFieldFromText]);

  const useManualText = useCallback(async () => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    setMessage('');
    try {
      await resolveFromText(manualText, { allowManualFallback: true });
    } finally {
      setBusy(false);
    }
  }, [busy, manualText, resolveFromText]);

  const applySuggestion = useCallback(async (sku) => {
    if (ocrField) {
      applyFieldValue(sku);
      return;
    }
    const base = resolveWarehouseLabelFromText(manualText, mode, { target: labelScanTarget });
    await applyResolved({ ...base, sku, source: 'user_pick' });
  }, [applyResolved, applyFieldValue, labelScanTarget, manualText, mode, ocrField]);

  const runOcrOnPhoto = useCallback(async (uri) => {
    try {
      const result = await TextRecognition.recognize(uri);
      const rawText = String(result?.text || '').trim();
      const raw = ocrField === WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_TURKISH
        || ocrField === WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME
        ? normalizeSlashedZeroGlyphs(rawText)
        : normalizeSupplierZeroAndLetterOcrText(rawText, 'sku');
      if (!raw) {
        setMessage(
          ocrField
            ? 'No text detected. Frame the printed line for this field and capture again.'
            : 'No text detected. Point at the barcode or SKU and capture again.',
        );
        return;
      }
      await resolveFromText(raw);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes("doesn't seem to be linked") || msg.includes('Expo managed')) {
        setMessage(
          'On-device text recognition needs a rebuilt APK (not Expo Go). Paste label text below.',
        );
      } else {
        setMessage(msg || 'Could not read the label.');
      }
    }
  }, [ocrField, resolveFromText]);

  const captureAndScan = useCallback(async () => {
    if (busy || !cameraRef.current) {
      setMessage('Wait for the camera to load.');
      return;
    }
    setBusy(true);
    setMessage('');
    setSuggestions([]);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        setMessage('Could not capture photo.');
        return;
      }
      await runOcrOnPhoto(photo.uri);
    } catch (err) {
      setMessage(err?.message || 'Capture failed.');
    } finally {
      setBusy(false);
    }
  }, [busy, runOcrOnPhoto]);

  if (!permission) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>{hint}</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  const trimmedManual = manualText.trim();
  const canUseText = trimmedManual.length > 0 && !busy;
  const cameraHeight = keyboardVisible ? 140 : CAMERA_HEIGHT;

  return (
    <WarehouseCatalogFormScroll
      scrollRef={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.wrap}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 72}
    >
      <Text style={styles.lead}>{hint}</Text>
      <View style={[styles.cameraBox, { height: cameraHeight }]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} autofocus="on" />
        <View pointerEvents="none" style={styles.frameOverlay}>
          <Text style={styles.frameHint}>
            {ocrField ? 'Printed text only — partial label OK' : 'Aim at barcode or SKU — partial label OK'}
          </Text>
        </View>
      </View>
      <Pressable style={styles.btn} onPress={captureAndScan} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Reading…' : (ocrField ? 'Capture text' : 'Capture label')}</Text>
      </Pressable>

      <Text style={styles.or}>Or paste / edit text from the label</Text>
      <TextInput
        style={styles.input}
        value={manualText}
        onChangeText={(t) => {
          setManualText(t);
          setSuggestions([]);
          if (message) setMessage('');
        }}
        placeholder="Barcodes and printed codes"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        onLayout={(e) => {
          inputLayoutY.current = e.nativeEvent.layout.y;
        }}
        onFocus={() => {
          setKeyboardVisible(true);
          scrollFieldIntoView(inputLayoutY.current);
        }}
        onBlur={() => setKeyboardVisible(false)}
      />
      <Pressable
        style={[styles.btnSecondary, !canUseText && styles.btnDisabled]}
        onPress={useManualText}
        disabled={!canUseText}
        accessibilityState={{ disabled: !canUseText }}
      >
        <Text style={[styles.btnText, !canUseText && styles.btnTextDisabled]}>Use this text</Text>
      </Pressable>

      {suggestions.length ? (
        <View style={styles.suggestBlock}>
          <Text style={styles.suggestTitle}>
            {ocrField ? 'Other readings from this capture' : 'Possible SKUs from this capture'}
          </Text>
          {suggestions.map((item) => (
            <Pressable
              key={item.sku}
              style={styles.suggestChip}
              onPress={() => applySuggestion(item.sku)}
            >
              <Text style={styles.suggestChipText}>{item.sku}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {lastRead ? (
        <Text style={styles.preview} numberOfLines={2}>
          Resolved SKU: {lastRead}
        </Text>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </WarehouseCatalogFormScroll>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0f172a' },
  wrap: { padding: 16, paddingBottom: 32 },
  lead: { color: '#94a3b8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  hint: { color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  cameraBox: {
    height: CAMERA_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(250, 204, 21, 0.45)',
    borderRadius: 12,
    justifyContent: 'flex-end',
    padding: 8,
  },
  frameHint: {
    color: '#fde68a',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingVertical: 4,
    borderRadius: 6,
  },
  btn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnSecondary: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnDisabled: {
    backgroundColor: '#334155',
    borderColor: '#475569',
    opacity: 0.55,
  },
  btnText: { color: '#f8fafc', fontWeight: '700', fontSize: 15 },
  btnTextDisabled: { color: '#94a3b8' },
  or: { color: '#64748b', fontSize: 12, marginVertical: 10, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 10,
    color: '#f1f5f9',
    minHeight: 120,
    maxHeight: 220,
    fontFamily: 'monospace',
    fontSize: 13,
    marginBottom: 8,
  },
  suggestBlock: { marginTop: 4, marginBottom: 8 },
  suggestTitle: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  suggestChip: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  suggestChipText: { color: '#e0f2fe', fontFamily: 'monospace', fontSize: 14 },
  preview: { color: '#86efac', marginTop: 8, fontFamily: 'monospace', fontSize: 13 },
  message: { color: '#fbbf24', marginTop: 10, fontSize: 13, lineHeight: 18 },
});
