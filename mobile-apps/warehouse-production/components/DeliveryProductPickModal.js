import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';
import { tUi } from '../lib/productionKioskI18n';

export default function DeliveryProductPickModal({
  visible,
  locale,
  packetLabel,
  assemblies,
  onPick,
  onClose,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{tUi('deliveryScanPickTitle', locale)}</Text>
          <Text style={styles.hint}>{tUi('deliveryScanPickHint', locale)}</Text>
          {packetLabel ? (
            <Text style={styles.packet}>{packetLabel}</Text>
          ) : null}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {[...(assemblies || [])]
              .sort((a, b) =>
                String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }),
              )
              .map((a, index, arr) => (
                <Pressable
                  key={a.id}
                  style={[
                    styles.row,
                    index === arr.length - 1 && styles.rowLast,
                  ]}
                  onPress={() => onPick(a)}
                >
                  <Text style={styles.rowText}>{a.name}</Text>
                </Pressable>
              ))}
          </ScrollView>
          <Pressable style={[kiosk.btnOutlinePrimary, styles.closeBtn]} onPress={onClose}>
            <Text style={kiosk.btnOutlinePrimaryText}>{tUi('presetPickerClose', locale)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    maxHeight: '80%',
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.text },
  hint: { color: theme.muted, marginTop: 8, lineHeight: 20 },
  packet: { color: theme.primary, marginTop: 8, fontWeight: '600' },
  list: {
    marginTop: 12,
    maxHeight: 280,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceElevated,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { color: theme.text, fontSize: 16, fontWeight: '600' },
  closeBtn: { marginTop: 14 },
});
