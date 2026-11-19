import { useState } from 'react';
import {
  Alert,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from './theme';
import {
  QuoteProductionLineExtras,
  normalizeProductionQuoteLine,
} from './quoteProductionOrderUi';
import { displayQuoteFieldValue } from './quoteArabicTranslate';

function lineImageUrl(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return String(row?.line_image_url || meta.line_image_url || '').trim();
}

/** Indents line body (image, progress) to align with title beside the ready checkbox. */
function lineBodyAlignStyle(textAlign) {
  const rtl = textAlign === 'right';
  return {
    alignSelf: rtl ? 'flex-end' : 'flex-start',
    marginLeft: rtl ? 0 : 34,
    marginRight: rtl ? 0 : 0,
  };
}

function lineTextIndentStyle(textAlign) {
  const rtl = textAlign === 'right';
  return rtl ? { marginRight: 34, marginLeft: 0 } : { marginLeft: 34, marginRight: 0 };
}

export function QuoteLineReferenceImage({ line, textAlign, tUi, locale }) {
  const [open, setOpen] = useState(false);
  const url = lineImageUrl(normalizeProductionQuoteLine(line));
  if (!url) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.thumbWrap, lineBodyAlignStyle(textAlign)]}
      >
        <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
        <Text style={[styles.thumbHint, { textAlign }]}>{tUi('quoteLineImageEnlarge', locale)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <ScrollView
            style={styles.zoomScroll}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
          >
            <Image source={{ uri: url }} style={styles.zoomImage} resizeMode="contain" />
          </ScrollView>
          <Pressable style={styles.closeZoom} onPress={() => setOpen(false)}>
            <Text style={styles.closeZoomText}>{tUi('cancel', locale)}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function QuoteProductionWorkshopLineRows({
  lines,
  route,
  textAlign,
  tUi,
  locale,
  arabicMap = {},
  orderOpen = false,
  allowPaintingHandoff = false,
  allowFloor1Handoff = false,
  onMarkReady,
  onHandoffWillStart,
  onHandoff,
}) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return null;

  const [qtyModal, setQtyModal] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [confirmQty, setConfirmQty] = useState(null);

  const runHandoffPrompt = (line, qty) => {
    const buttons = [
      { text: tUi('cancel', locale), style: 'cancel' },
    ];
    const runHandoff = (target) => {
      onHandoffWillStart?.(line, target, qty);
      Promise.resolve(onHandoff?.(line, target, qty)).catch((err) => {
        Alert.alert(tUi('quoteOrderFailed', locale), err?.message || String(err));
      });
    };
    if (allowPaintingHandoff) {
      buttons.push({
        text: tUi('quoteLineHandoffPainting', locale),
        onPress: () => runHandoff('painting'),
      });
    }
    if (allowFloor1Handoff) {
      buttons.push({
        text: tUi('quoteLineHandoffFloor1', locale),
        onPress: () => runHandoff('floor1'),
      });
    }
    buttons.push({
      text: tUi('quoteLineHandoffDelivery', locale),
      onPress: () => runHandoff('delivery'),
    });
    const message = allowFloor1Handoff
      ? tUi('quoteOrderDispositionPrompt', locale)
      : '';
    Alert.alert(tUi('quoteLineHandoffTitle', locale), message, buttons);
  };

  const submitReady = async (line, qty) => {
    try {
      await onMarkReady?.(line, qty);
      InteractionManager.runAfterInteractions(() => {
        runHandoffPrompt(line, qty);
      });
    } catch (err) {
      Alert.alert(tUi('quoteOrderFailed', locale), err?.message || String(err));
    }
  };

  return (
    <>
      {list.map((line, index) => {
        const row = normalizeProductionQuoteLine(line);
        const key = String(row.id || `${row.name}-${index}`);
        const ordered = Math.max(
          Number(row.ordered_qty) || 0,
          Number(row.production_completed_qty || 0) + Number(row.production_remaining_qty ?? row.quantity ?? 0),
          Number(row.quantity) || 1,
        );
        const completed = Math.max(0, Number(row.production_completed_qty) || 0);
        const remaining = Math.max(
          0,
          Number(row.production_remaining_qty ?? (ordered - completed)),
        );
        const displayQty = remaining > 0 ? remaining : ordered;
        const nameShown = displayQuoteFieldValue(locale, row.name, arabicMap);
        const title = `${displayQty} × ${nameShown}`;
        const canMark = orderOpen && remaining > 0 && row.id;

        return (
          <View key={key} style={styles.lineBlock}>
            <View style={styles.lineTitleRow}>
              {canMark ? (
                <Pressable
                  style={styles.checkBox}
                  onPress={() => {
                    setQtyModal(row);
                    setQtyDraft(String(remaining));
                  }}
                />
              ) : (
                <View style={styles.checkBoxSpacer} />
              )}
              <Text style={[styles.lineMain, { textAlign, flex: 1 }]}>{title}</Text>
            </View>
            {completed > 0 ? (
              <Text style={[styles.progress, lineTextIndentStyle(textAlign), { textAlign }]}>
                {completed} / {ordered} {tUi('quoteLineProgress', locale)}
              </Text>
            ) : null}
            {remaining > 0 && completed > 0 ? (
              <Text style={[styles.remaining, lineTextIndentStyle(textAlign), { textAlign }]}>
                {tUi('quoteLineRemaining', locale)}: {remaining}
              </Text>
            ) : null}
            <QuoteLineReferenceImage line={row} textAlign={textAlign} tUi={tUi} locale={locale} />
            <QuoteProductionLineExtras
              line={row}
              route={route}
              textAlign={textAlign}
              tUi={tUi}
              locale={locale}
              arabicMap={arabicMap}
            />
          </View>
        );
      })}

      <Modal visible={Boolean(qtyModal)} transparent animationType="fade" onRequestClose={() => setQtyModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { textAlign }]}>{tUi('quoteLineReadyQtyTitle', locale)}</Text>
            <TextInput
              style={styles.qtyInput}
              keyboardType="number-pad"
              value={qtyDraft}
              onChangeText={setQtyDraft}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnSecondary} onPress={() => setQtyModal(null)}>
                <Text style={styles.modalBtnText}>{tUi('cancel', locale)}</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtn}
                onPress={() => {
                  const n = Math.max(1, Math.floor(Number(qtyDraft) || 0));
                  setQtyModal(null);
                  setConfirmQty({ line: qtyModal, qty: n });
                }}
              >
                <Text style={styles.modalBtnText}>{tUi('quoteLineReadyQtyConfirm', locale)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(confirmQty)} transparent animationType="fade" onRequestClose={() => setConfirmQty(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { textAlign }]}>
              {tUi('quoteLineReadyConfirmBody', locale)} ({confirmQty?.qty})
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnSecondary} onPress={() => setConfirmQty(null)}>
                <Text style={styles.modalBtnText}>{tUi('cancel', locale)}</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtn}
                onPress={async () => {
                  const payload = confirmQty;
                  setConfirmQty(null);
                  if (payload?.line) await submitReady(payload.line, payload.qty);
                }}
              >
                <Text style={styles.modalBtnText}>{tUi('quoteLineMarkReady', locale)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  lineBlock: { marginBottom: 14 },
  lineTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lineMain: { color: theme.textSecondary, fontSize: 15, fontWeight: '600' },
  progress: { color: theme.primary, fontSize: 13, fontWeight: '700', marginTop: 4 },
  remaining: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.primary,
    marginTop: 2,
  },
  checkBoxSpacer: { width: 22 },
  thumbWrap: { marginTop: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#1e293b' },
  thumbHint: { color: theme.textMuted, fontSize: 11, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: theme.bg || '#0f172a',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: { color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 12 },
  qtyInput: {
    borderWidth: 1,
    borderColor: theme.border || '#334155',
    borderRadius: 8,
    padding: 12,
    color: theme.text,
    fontSize: 18,
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 8 },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: theme.primary,
    borderRadius: 8,
  },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#475569',
    borderRadius: 8,
  },
  modalBtnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  zoomScroll: { flex: 1 },
  zoomContent: { flexGrow: 1, justifyContent: 'center' },
  zoomImage: { width: '100%', height: 420 },
  closeZoom: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#475569',
    borderRadius: 8,
  },
  closeZoomText: { color: '#fff', fontWeight: '600' },
});