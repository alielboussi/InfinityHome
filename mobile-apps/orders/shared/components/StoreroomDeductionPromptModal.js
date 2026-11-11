import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/**
 * Two-step prompt: pick Storeroom 1, 2, or 3, then confirm before storeroom BOM deduct.
 */
export default function StoreroomDeductionPromptModal({
  visible,
  textAlign = 'left',
  storerooms = [],
  title,
  pickHint,
  confirmHint,
  confirmLabel,
  cancelLabel,
  noStoreroomsHint,
  onCancel,
  onConfirm,
}) {
  const [step, setStep] = useState('pick');
  const [pickedId, setPickedId] = useState('');

  const pickedLabel = useMemo(() => {
    const row = (storerooms || []).find((s) => String(s.id) === String(pickedId));
    return row?.label || row?.name || pickedId;
  }, [pickedId, storerooms]);

  const reset = () => {
    setStep('pick');
    setPickedId('');
  };

  const close = () => {
    reset();
    onCancel?.();
  };

  const afterPick = (id) => {
    const trimmed = String(id || '').trim();
    if (!trimmed) return;
    setPickedId(trimmed);
    setStep('confirm');
  };

  const finalize = () => {
    const id = String(pickedId || '').trim();
    if (!id) return;
    reset();
    onConfirm?.(id);
  };

  if (!visible) return null;

  const list = (storerooms || []).filter((row) => String(row.id || '').trim());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { textAlign }]}>{title}</Text>
          {step === 'pick' ? (
            <>
              <Text style={[styles.hint, { textAlign }]}>{pickHint}</Text>
              {list.length === 0 ? (
                <Text style={[styles.hint, { textAlign, color: theme.danger || '#b91c1c' }]}>
                  {noStoreroomsHint}
                </Text>
              ) : (
                list.map((row) => (
                  <Pressable
                    key={String(row.id)}
                    style={styles.option}
                    onPress={() => afterPick(String(row.id))}
                  >
                    <Text style={styles.optionText}>{row.label || row.name}</Text>
                  </Pressable>
                ))
              )}
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={close}>
                <Text style={styles.btnSecondaryText}>{cancelLabel}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.hint, { textAlign }]}>{confirmHint}</Text>
              <Text style={[styles.picked, { textAlign }]}>{pickedLabel}</Text>
              <View style={styles.row}>
                <Pressable style={[styles.btn, styles.btnSecondary, styles.flex]} onPress={() => setStep('pick')}>
                  <Text style={styles.btnSecondaryText}>{cancelLabel}</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary, styles.flex]} onPress={finalize}>
                  <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10, color: theme.text },
  hint: { fontSize: 14, color: theme.textMuted, marginBottom: 12 },
  picked: { fontSize: 17, fontWeight: '700', color: theme.primary, marginBottom: 16 },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  optionText: { fontSize: 16, fontWeight: '600', color: theme.text },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  flex: { flex: 1 },
  btn: {
    borderRadius: theme.radiusSm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnSecondary: { borderWidth: 1, borderColor: theme.border },
  btnSecondaryText: { fontWeight: '700', color: theme.text },
  btnPrimary: { backgroundColor: theme.primary },
  btnPrimaryText: { fontWeight: '800', color: '#fff' },
});
