import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { kiosk } from '../../components/kioskStyles';
import { theme } from '../theme';

const REQUIRED_OK = 'Ok';

function inputMatchesOk(value) {
  return String(value || '').trim() === REQUIRED_OK;
}

/**
 * Finish / end job guard — user must type Ok (capital O, lowercase k).
 */
export default function ConfirmTypeOkModal({
  visible,
  title,
  message,
  typeHint,
  confirmLabel,
  cancelLabel,
  textAlign = 'left',
  onCancel,
  onConfirm,
}) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!visible) setTyped('');
  }, [visible]);

  const canConfirm = inputMatchesOk(typed);

  const close = () => {
    setTyped('');
    onCancel?.();
  };

  const confirm = () => {
    if (!canConfirm) return;
    setTyped('');
    onConfirm?.();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { textAlign }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { textAlign }]}>{message}</Text>
          ) : null}
          <Text style={[styles.hint, { textAlign }]}>{typeHint}</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={REQUIRED_OK}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[kiosk.input, styles.input, { textAlign: textAlign === 'right' ? 'right' : 'left' }]}
          />
          <View style={styles.actions}>
            <Pressable style={[kiosk.btn, styles.btnSecondary]} onPress={close}>
              <Text style={kiosk.btnText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[kiosk.btn, styles.btnDanger, !canConfirm && styles.btnDisabled]}
              onPress={confirm}
              disabled={!canConfirm}
            >
              <Text style={[kiosk.btnText, !canConfirm && styles.btnTextDisabled]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    backgroundColor: theme.surface || '#1e293b',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border || '#334155',
  },
  title: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 10 },
  message: { fontSize: 15, color: theme.textSecondary, marginBottom: 12, lineHeight: 22 },
  hint: { fontSize: 14, color: theme.muted, marginBottom: 8 },
  input: { marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  btnSecondary: { backgroundColor: theme.surfaceElevated || '#334155', flex: 1 },
  btnDanger: { backgroundColor: theme.danger || '#dc2626', flex: 1 },
  btnDisabled: { opacity: 0.45 },
  btnTextDisabled: { opacity: 0.8 },
});
