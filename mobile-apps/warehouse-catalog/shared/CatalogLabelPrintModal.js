import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from './theme';
import {
  fetchWarehouseCatalogLabelPreview,
  printWarehouseCatalogLabel,
} from './warehouseCatalogLabelApi';

export default function CatalogLabelPrintModal({
  visible,
  item,
  onClose,
}) {
  const name = String(item?.name || '').trim();
  const sku = String(item?.sku || '').trim();
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelPng, setLabelPng] = useState('');
  const [labelCopies, setLabelCopies] = useState(1);
  const [printWarning, setPrintWarning] = useState('');

  useEffect(() => {
    if (!visible) return;
    const n = Math.max(1, Math.floor(Number(item?.defaultCopies) || 1));
    setCopies(n);
    setError('');
    setBusy(false);
    setPreviewOpen(false);
    setLabelPreview(null);
    setLabelPng('');
    setPrintWarning('');
  }, [visible, item?.defaultCopies, name, sku]);

  const closeAll = () => {
    setPreviewOpen(false);
    onClose();
  };

  const onPrint = async () => {
    if (!name || !sku || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await printWarehouseCatalogLabel({ name, sku, copies });
      const warning = String(result?.labelPrintWarning || '').trim();
      setPrintWarning(warning);
      setLabelCopies(result?.labelCopies || copies);
      let label = result?.label;
      let png = result?.labelPreviewPngBase64 || '';
      if (!png && label?.sku && label?.name) {
        try {
          const prev = await fetchWarehouseCatalogLabelPreview({
            name: label.name,
            sku: label.sku,
            printedAt: label.printed_at,
          });
          png = prev?.label_preview_png_base64 || '';
          if (!label && prev?.label) label = prev.label;
        } catch {
          // preview optional
        }
      }
      setLabelPreview(label || { name, sku });
      setLabelPng(png);
      setPreviewOpen(true);
    } catch (err) {
      setError(err?.message || 'Label print failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const previewUri = labelPng ? `data:image/png;base64,${labelPng}` : null;
  const previewSub = printWarning
    ? 'Preview only — labels were not sent to the printer. Check Zebra settings on the server.'
    : (labelCopies > 1
      ? `${labelCopies} labels sent to the printer.`
      : 'Label sent to the printer.');

  return (
    <>
      <Modal visible={visible && !previewOpen} transparent animationType="fade" onRequestClose={closeAll}>
        <Pressable style={styles.backdrop} onPress={closeAll}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="printer" size={24} color={theme.primary} />
              <Text style={styles.title}>Print warehouse label</Text>
            </View>
            <Text style={styles.name} numberOfLines={3}>{name}</Text>
            <Text style={styles.sku}>{sku}</Text>

            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Copies</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => setCopies((n) => Math.max(1, n - 1))}
                accessibilityLabel="Decrease copies"
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyVal}>{copies}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => setCopies((n) => n + 1)}
                accessibilityLabel="Increase copies"
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryBtn, busy && styles.btnBusy]}
              onPress={onPrint}
              disabled={busy || !name || !sku}
            >
              {busy ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text style={styles.primaryBtnText}>Print on Zebra</Text>
              )}
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={closeAll} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={closeAll}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Label preview</Text>
            <Text style={styles.previewSub}>{previewSub}</Text>
            {printWarning ? <Text style={styles.warn}>{printWarning}</Text> : null}
            {previewUri ? (
              <ScrollView horizontal contentContainerStyle={styles.imageWrap}>
                <Image
                  source={{ uri: previewUri }}
                  style={styles.labelImage}
                  resizeMode="contain"
                  accessibilityLabel="Printed label preview"
                />
              </ScrollView>
            ) : labelPreview ? (
              <View style={styles.fallback}>
                <Text style={styles.fallbackSku}>{labelPreview.sku}</Text>
                <Text style={styles.fallbackName}>{labelPreview.name}</Text>
              </View>
            ) : null}
            <Pressable style={styles.primaryBtn} onPress={closeAll}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function CatalogLabelPrintIconButton({ onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={[styles.iconBtn, disabled && styles.iconBtnDisabled]}
      accessibilityLabel="Print Zebra label"
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name="printer" size={20} color={disabled ? '#475569' : '#38bdf8'} />
    </Pressable>
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
    padding: 18,
    maxHeight: '92%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: theme.text },
  name: { fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 4 },
  sku: { fontSize: 13, color: theme.textMuted, fontFamily: 'monospace', marginBottom: 14 },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  qtyLabel: { color: theme.textMuted, fontSize: 14, flex: 1 },
  qtyBtn: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  qtyBtnText: { fontSize: 20, fontWeight: '700', color: theme.text },
  qtyVal: { fontSize: 18, fontWeight: '800', minWidth: 32, textAlign: 'center', color: theme.text },
  error: { color: theme.danger, fontSize: 13, marginBottom: 10 },
  primaryBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 15 },
  btnBusy: { opacity: 0.65 },
  cancelBtn: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  cancelText: { color: '#38bdf8', fontWeight: '600', fontSize: 14 },
  previewSub: { fontSize: 13, color: theme.textMuted, marginBottom: 8 },
  warn: { fontSize: 13, color: theme.danger, marginBottom: 10, lineHeight: 18 },
  imageWrap: { alignItems: 'center', paddingVertical: 8 },
  labelImage: { width: 300, height: 255, borderRadius: 6, backgroundColor: '#fff' },
  fallback: { padding: 12, alignItems: 'center' },
  fallbackSku: { fontSize: 18, fontWeight: '700', color: theme.text },
  fallbackName: { fontSize: 14, color: theme.text, marginTop: 6, textAlign: 'center' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.4 },
});
