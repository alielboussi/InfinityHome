import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../shared/theme';
import { tUi } from './productionKioskI18n';

function HintModal({ visible, title, body, locale, textAlign, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {title ? (
            <Text style={[styles.title, { textAlign: textAlign || 'center' }]}>{title}</Text>
          ) : null}
          <Text style={[styles.body, { textAlign: textAlign || 'center' }]}>{body}</Text>
          <Text style={[styles.dismiss, { textAlign: 'center' }]}>
            {tUi('dashHintDismiss', locale)}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProductionPressableHint({
  hintKey,
  hintBody,
  hintTitle,
  locale = 'en',
  textAlign,
  onPress,
  onLongPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  delayLongPress = 450,
}) {
  const [open, setOpen] = useState(false);
  const body = hintBody || (hintKey ? tUi(hintKey, locale) : '');
  const title = hintTitle || '';

  const showHint = () => {
    if (!body.trim()) return;
    setOpen(true);
  };

  return (
    <>
      <Pressable
        style={style}
        onPress={onPress}
        onLongPress={() => {
          showHint();
          onLongPress?.();
        }}
        delayLongPress={delayLongPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
      <HintModal
        visible={open}
        title={title}
        body={body}
        locale={locale}
        textAlign={textAlign}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    maxWidth: 340,
    width: '100%',
    backgroundColor: theme.surfaceElevated || theme.card,
    borderRadius: theme.radius || 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 18,
    paddingHorizontal: 20,
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.textSecondary || theme.textMuted,
  },
  dismiss: {
    marginTop: 14,
    fontSize: 12,
    color: theme.textMuted,
  },
});
