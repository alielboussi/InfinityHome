import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../shared/theme';
import { kiosk } from './kioskStyles';
import { tUi } from '../lib/productionKioskI18n';

function DeliveryDriverPicker({
  visible,
  title,
  drivers,
  locale,
  textAlign,
  selectedDriverId,
  loading,
  onClose,
  onSelect,
}) {
  const list = Array.isArray(drivers) ? drivers : [];
  const showLoading = loading && !list.length;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { textAlign }]}>{title}</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {showLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.loadingText, { textAlign }]}>{tUi('loading', locale)}</Text>
              </View>
            ) : null}
            {list.map((d) => {
              const active = String(selectedDriverId) === String(d.id);
              return (
                <Pressable
                  key={d.id}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(d);
                    onClose();
                  }}
                >
                  <Text style={[styles.rowText, active && styles.rowTextActive, { textAlign: 'left' }]}>
                    {d.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={[kiosk.btn, styles.closeBtn]} onPress={onClose}>
            <Text style={kiosk.btnText}>{tUi('presetPickerClose', locale)}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '72%',
    backgroundColor: theme.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 12,
  },
  list: {
    marginBottom: 12,
  },
  loadingWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 15,
    color: theme.muted || '#64748b',
  },
  row: {
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    marginBottom: 8,
    justifyContent: 'center',
  },
  rowActive: {
    borderColor: theme.primary,
    backgroundColor: '#e0f2fe',
  },
  rowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowTextActive: {
    color: '#0369a1',
  },
  closeBtn: {
    width: '100%',
  },
});

export default DeliveryDriverPicker;
