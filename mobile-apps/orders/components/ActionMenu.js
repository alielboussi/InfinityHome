import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';

export default function ActionMenu({ items, triggerLabel = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const visible = (items || []).filter((item) => item && !item.hidden);
  if (!visible.length) return null;
  return (
    <>
      <Pressable style={kiosk.btn} onPress={() => setOpen(true)}>
        <Text style={kiosk.btnText}>{triggerLabel}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{triggerLabel}</Text>
            {visible.map((item) => (
              <Pressable
                key={item.key}
                disabled={item.disabled}
                style={[styles.item, item.disabled && styles.itemDisabled]}
                onPress={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                <Text style={[styles.itemText, item.tone === 'delete' && styles.delete]}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[kiosk.btn, { marginTop: 8 }]} onPress={() => setOpen(false)}>
              <Text style={kiosk.btnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontWeight: '800',
    fontSize: 16,
    color: theme.text,
    marginBottom: 8,
  },
  item: {
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  itemDisabled: { opacity: 0.5 },
  itemText: { fontSize: 16, fontWeight: '700', color: theme.text },
  delete: { color: '#b91c1c' },
});
