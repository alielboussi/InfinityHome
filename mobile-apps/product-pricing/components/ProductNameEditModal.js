import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from '../theme';

export default function ProductNameEditModal({
  visible,
  product,
  saving,
  error,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) setDraft(String(product?.name || ''));
  }, [visible, product?.name, product?.id]);

  const handleSave = () => {
    onSave?.(draft);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dismissTap} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {product?.__isCombo ? 'Edit set name' : 'Edit product name'}
          </Text>
          {product?.sku ? <Text style={styles.sku}>SKU: {product.sku}</Text> : null}
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Product name"
            placeholderTextColor={theme.muted}
            autoFocus
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.hint}>Saves to Firestore and updates the portal products-list.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#052018" />
              ) : (
                <Text style={styles.saveText}>Save name</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  dismissTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 16,
    zIndex: 1,
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  sku: { color: theme.muted, fontSize: 12, marginBottom: 10 },
  input: {
    minHeight: 88,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
    lineHeight: 20,
  },
  hint: { color: theme.muted, fontSize: 11, marginTop: 8, lineHeight: 16 },
  error: { color: theme.danger, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  cancelText: { color: theme.muted, fontWeight: '700' },
  saveButton: {
    minWidth: 110,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.border,
    alignItems: 'center',
  },
  saveText: { color: '#052018', fontWeight: '800' },
});
