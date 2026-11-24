import { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kioskModalBottomPad } from '../lib/kioskLayout';
import { theme } from './theme';
import {
  QuoteProductionLineExtras,
  normalizeProductionQuoteLine,
} from './quoteProductionOrderUi';
import { displayQuoteFieldValue, formatQuoteLineQtyLabel } from './quoteArabicTranslate';
import JobCompletedUnitsRow from './components/JobCompletedUnitsRow';

function lineImageUrl(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return String(
    row?.line_image_url || meta.line_image_url || meta.floor2_image_url || '',
  ).trim();
}

/** RN 0.88+ — InteractionManager removed; defer second Alert after qty modal / animations. */
function deferAfterUiIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout: 400 });
    return;
  }
  setTimeout(fn, 0);
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

export function QuoteLineReferenceImage({ line, textAlign, tUi, locale, compactRight = false }) {
  const [open, setOpen] = useState(false);
  const url = lineImageUrl(normalizeProductionQuoteLine(line));
  if (!url) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={compactRight ? styles.thumbWrapInline : [styles.thumbWrap, lineBodyAlignStyle(textAlign)]}
      >
        <Image source={{ uri: url }} style={compactRight ? styles.thumbInline : styles.thumb} resizeMode="cover" />
        {compactRight ? null : (
          <Text style={[styles.thumbHint, { textAlign }]}>{tUi('quoteLineImageEnlarge', locale)}</Text>
        )}
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

/** Android Alert supports at most 3 buttons — use this for carpentry / multi-destination handoff. */
export function QuoteProductionDispositionModal({
  visible,
  title,
  message,
  textAlign,
  tUi,
  locale,
  choices = [],
  onPick,
  onCancel,
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const list = Array.isArray(choices) ? choices.filter((c) => c?.key && c?.label) : [];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.modalBackdrop, { paddingBottom: kioskModalBottomPad(insets) }]}>
        <View style={styles.modalCard}>
          <Text style={[styles.modalTitle, { textAlign }]}>{title}</Text>
          {message ? (
            <Text style={[styles.dispositionMessage, { textAlign }]}>{message}</Text>
          ) : null}
          {list.map((choice) => (
            <Pressable
              key={choice.key}
              style={styles.dispositionChoiceBtn}
              onPress={() => onPick?.(choice.key)}
            >
              <Text style={styles.dispositionChoiceText}>{choice.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.modalBtnSecondary, styles.dispositionCancelBtn]} onPress={onCancel}>
            <Text style={styles.modalBtnText}>{tUi('cancel', locale)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  allowDeliveryHandoff = String(route || '').toLowerCase() !== 'carpentry',
  dispositionMessage,
  onMarkReady,
  onHandoffWillStart,
  onHandoff,
  /** Same completed-qty stepper as manufacture jobs (Upholstery). */
  useCompletedQtyStepper = false,
  onSetCompleted,
}) {
  const list = Array.isArray(lines) ? lines : [];

  const [qtyModal, setQtyModal] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [confirmQty, setConfirmQty] = useState(null);
  const [handoffPick, setHandoffPick] = useState(null);
  const insets = useSafeAreaInsets();
  const modalBottom = { paddingBottom: kioskModalBottomPad(insets) };

  if (!list.length) return null;

  const resolvedDispositionMessage =
    dispositionMessage
    ?? (allowPaintingHandoff
      ? tUi('quoteOrderCarpentryDispositionPrompt', locale)
      : (allowFloor1Handoff ? tUi('quoteOrderDispositionPrompt', locale) : ''));

  const invokeHandoff = (line, target, qty) => {
    onHandoffWillStart?.(line, target, qty);
    Promise.resolve(onHandoff?.(line, target, qty)).catch((err) => {
      Alert.alert(tUi('quoteOrderFailed', locale), err?.message || String(err));
    });
  };

  const runHandoffPrompt = (line, qty) => {
    const useModal = Boolean(allowPaintingHandoff);
    if (useModal) {
      setHandoffPick({ line, qty });
      return;
    }
    const buttons = [{ text: tUi('cancel', locale), style: 'cancel' }];
    const runHandoff = (target) => invokeHandoff(line, target, qty);
    if (allowFloor1Handoff) {
      buttons.push({
        text: tUi('quoteLineHandoffFloor1', locale),
        onPress: () => runHandoff('floor1'),
      });
    }
    if (allowDeliveryHandoff) {
      buttons.push({
        text: tUi('quoteLineHandoffDelivery', locale),
        onPress: () => runHandoff('delivery'),
      });
    }
    const message = resolvedDispositionMessage;
    Alert.alert(tUi('quoteLineHandoffTitle', locale), message, buttons);
  };

  const handoffChoices = [];
  if (allowPaintingHandoff) {
    handoffChoices.push({
      key: 'painting',
      label: tUi('quoteLineHandoffPainting', locale),
    });
  }
  if (allowFloor1Handoff) {
    handoffChoices.push({
      key: 'floor1',
      label: tUi('quoteLineHandoffFloor1', locale),
    });
  }
  if (allowDeliveryHandoff) {
    handoffChoices.push({
      key: 'delivery',
      label: tUi('quoteLineHandoffDelivery', locale),
    });
  }

  const submitReady = async (line, qty) => {
    try {
      const markResult = await onMarkReady?.(line, qty);
      const readyQty = Math.max(
        1,
        Math.floor(Number(markResult?.ready_qty ?? qty) || 0),
      );
      deferAfterUiIdle(() => {
        runHandoffPrompt(line, readyQty);
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
        const displayQty = useCompletedQtyStepper
          ? ordered
          : (remaining > 0 ? remaining : ordered);
        const qtyUnit = String(row.unit_abbr || row.unit || '').trim();
        const nameShown = String(row.name || '').trim();
        const qtyLead =
          locale === 'ar'
            ? formatQuoteLineQtyLabel(displayQty, qtyUnit, locale, arabicMap) || String(displayQty)
            : String(displayQty);
        const title = `${qtyLead} × ${nameShown}`;
        const canMark = orderOpen && remaining > 0 && row.id;

        return (
          <View key={key} style={styles.lineBlock}>
            <View style={styles.lineTitleRow}>
              {useCompletedQtyStepper ? null : canMark ? (
                <Pressable
                  style={styles.checkBox}
                  onPress={() => {
                    setQtyModal(row);
                    setQtyDraft('');
                  }}
                />
              ) : (
                <View style={styles.checkBoxSpacer} />
              )}
              <Text style={[styles.lineMain, { textAlign, flex: 1 }]}>{title}</Text>
              <QuoteLineReferenceImage
                line={row}
                textAlign={textAlign}
                tUi={tUi}
                locale={locale}
                compactRight
              />
            </View>
            {useCompletedQtyStepper && (orderOpen || remaining > 0) ? (
              <JobCompletedUnitsRow
                rowKey={key}
                productQty={ordered}
                savedCount={completed}
                locale={locale}
                textAlign={textAlign}
                disabled={!orderOpen || !row.id}
                tUi={tUi}
                onApply={async (_id, count) => {
                  const added = await onSetCompleted?.(row, count);
                  const qty = Math.floor(Number(added) || 0);
                  if (qty < 1) return;
                  deferAfterUiIdle(() => runHandoffPrompt(row, qty));
                }}
              />
            ) : useCompletedQtyStepper ? null : (
              <>
            {completed > 0 ? (
              <Text style={[styles.progress, lineTextIndentStyle(textAlign), { textAlign }]}>
                {tUi('quoteLineCompletedQty', locale)}: {completed}
              </Text>
            ) : null}
            {remaining > 0 && completed > 0 ? (
              <Text style={[styles.remaining, lineTextIndentStyle(textAlign), { textAlign }]}>
                {tUi('quoteLineRemainingQty', locale)}: {remaining}
              </Text>
            ) : null}
              </>
            )}
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
        <View style={[styles.modalBackdrop, modalBottom]}>
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
                  const n = Math.floor(Number(qtyDraft) || 0);
                  if (!Number.isFinite(n) || n < 1) {
                    Alert.alert(tUi('quoteLineReadyQtyTitle', locale), tUi('needQty', locale));
                    return;
                  }
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
        <View style={[styles.modalBackdrop, modalBottom]}>
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

      <QuoteProductionDispositionModal
        visible={Boolean(handoffPick)}
        title={tUi('quoteLineHandoffTitle', locale)}
        message={resolvedDispositionMessage}
        textAlign={textAlign}
        tUi={tUi}
        locale={locale}
        choices={handoffChoices}
        onPick={(target) => {
          const payload = handoffPick;
          setHandoffPick(null);
          if (payload?.line) invokeHandoff(payload.line, target, payload.qty);
        }}
        onCancel={() => setHandoffPick(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  lineBlock: { marginBottom: 14 },
  lineTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  thumbWrapInline: { marginTop: 0 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#1e293b' },
  thumbInline: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#1e293b' },
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
  dispositionMessage: { color: theme.textSecondary, fontSize: 14, marginBottom: 14, lineHeight: 20 },
  dispositionChoiceBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.primary,
    borderRadius: 8,
    marginBottom: 8,
  },
  dispositionChoiceText: { color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 15 },
  dispositionCancelBtn: { marginTop: 4 },
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