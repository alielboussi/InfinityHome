import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../shared/theme';
import {
  PRODUCTION_TRACKING_DEPARTMENTS,
  PRODUCTION_TRACKING_KINDS,
  PRODUCTION_TRACKING_PROGRESS,
  isProductionTrackingFilterActive,
} from '../shared/productionTrackingListUi';

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function ProductionTrackingFilterModal({
  visible,
  onClose,
  locale,
  tUi,
  department,
  trackKind,
  progress,
  onDepartmentChange,
  onTrackKindChange,
  onProgressChange,
  onClear,
}) {
  const active = isProductionTrackingFilterActive({ department, trackKind, progress });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>{tUi('trackingFilterTitle', locale)}</Text>
            {active ? (
              <Pressable onPress={onClear} accessibilityRole="button">
                <Text style={styles.clear}>{tUi('trackingFilterClear', locale)}</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.groupLabel}>{tUi('trackingFilterDepartment', locale)}</Text>
            <View style={styles.chipRow}>
              {PRODUCTION_TRACKING_DEPARTMENTS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={department === opt.value}
                  onPress={() => onDepartmentChange(opt.value)}
                />
              ))}
            </View>
            <Text style={styles.groupLabel}>{tUi('trackingFilterType', locale)}</Text>
            <View style={styles.chipRow}>
              {PRODUCTION_TRACKING_KINDS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={trackKind === opt.value}
                  onPress={() => onTrackKindChange(opt.value)}
                />
              ))}
            </View>
            <Text style={styles.groupLabel}>{tUi('trackingFilterStatus', locale)}</Text>
            <View style={styles.chipRow}>
              {PRODUCTION_TRACKING_PROGRESS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={progress === opt.value}
                  onPress={() => onProgressChange(opt.value)}
                />
              ))}
            </View>
          </ScrollView>
          <Pressable style={styles.doneBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneText}>{tUi('trackingFilterDone', locale)}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function ProductionTrackingFilterButton({ active, onPress, locale, tUi }) {
  return (
    <Pressable
      style={[styles.filterBtn, active && styles.filterBtnActive]}
      onPress={onPress}
      accessibilityLabel={tUi('trackingFilterA11y', locale)}
    >
      <MaterialCommunityIcons
        name="filter-outline"
        size={22}
        color={active ? theme.primary : '#94a3b8'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: theme.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '800' },
  clear: { color: theme.primary, fontWeight: '700' },
  groupLabel: {
    marginTop: 12,
    marginBottom: 8,
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  chipActive: { backgroundColor: theme.primary },
  chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  doneBtn: {
    marginTop: 16,
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  filterBtnActive: {
    borderColor: theme.primary,
    backgroundColor: '#0f172a',
  },
});