import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProductionLabelPreviewModal from './ProductionLabelPreviewModal';
import { kiosk } from './kioskStyles';
import { tUi } from '../lib/productionKioskI18n';
import {
  fetchProductionLabelPreview,
  printProductionLabel,
} from '../services/productionApi';
import { theme } from '../shared/theme';

/**
 * Dialog: choose label copy count → print warehouse production label (Zebra / worker).
 */
export default function ProductionLabelPrintModal({
  visible,
  locale,
  textAlign = 'left',
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
  }, [visible, item?.defaultCopies, name, sku]);

  const closeAll = () => {
    setPreviewOpen(false);
    setLabelPreview(null);
    setLabelPng('');
    setPrintWarning('');
    onClose();
  };

  const onPrint = async () => {
    if (!name || !sku || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await printProductionLabel({ name, sku, copies });
      const warning = String(result?.labelPrintWarning || '').trim();
      setPrintWarning(warning);
      setLabelCopies(result?.labelCopies || copies);
      let label = result?.label;
      let png = result?.labelPreviewPngBase64 || '';
      if (!png && label?.sku && label?.name) {
        try {
          const prev = await fetchProductionLabelPreview({
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
      setError(err?.message || tUi('deliveryLabelPrintFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible && !previewOpen} transparent animationType="fade" onRequestClose={closeAll}>
        <Pressable style={styles.backdrop} onPress={closeAll}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="label-outline" size={26} color={theme.primary} />
              <Text style={[styles.title, { textAlign }]}>{tUi('deliveryLabelPrintTitle', locale)}</Text>
            </View>
            <Text style={[styles.name, { textAlign }]} numberOfLines={3}>{name}</Text>
            <Text style={[styles.sku, { textAlign }]}>{sku}</Text>

            <View style={styles.qtyRow}>
              <Text style={[kiosk.label, { textAlign, marginBottom: 0 }]}>
                {tUi('deliveryLabelPrintQty', locale)}
              </Text>
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

            {error ? <Text style={[kiosk.errText, { textAlign }]}>{error}</Text> : null}

            <Pressable
              style={[kiosk.btnPrimaryBlock, busy && styles.btnBusy]}
              onPress={onPrint}
              disabled={busy || !name || !sku}
            >
              {busy ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryLabelPrintSubmit', locale)}</Text>
              )}
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={closeAll} disabled={busy}>
              <Text style={styles.cancelText}>{tUi('deliveryAlertCancel', locale)}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ProductionLabelPreviewModal
        visible={previewOpen}
        label={labelPreview}
        pngBase64={labelPng}
        copies={labelCopies}
        locale={locale}
        labelsPrinted={!printWarning}
        printWarning={printWarning}
        onClose={closeAll}
      />
    </>
  );
}

export function ProductionLabelPrintIconButton({ onPress, locale }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={styles.iconBtn}
      accessibilityLabel={tUi('deliveryLabelPrintA11y', locale)}
    >
      <MaterialCommunityIcons name="label-outline" size={24} color={theme.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
  },
  name: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 },
  sku: { fontSize: 14, color: theme.muted, fontFamily: 'monospace', marginBottom: 16 },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  qtyBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  qtyBtnText: { fontSize: 22, fontWeight: '700', color: theme.text },
  qtyVal: { fontSize: 22, fontWeight: '800', minWidth: 36, textAlign: 'center', color: theme.text },
  btnBusy: { opacity: 0.65 },
  cancelBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: theme.primary, fontWeight: '600', fontSize: 15 },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
