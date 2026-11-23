import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

const ICON = '#38bdf8';

/** Shared completed-qty stepper for manufacture jobs and quote lines. */
export default function JobCompletedUnitsRow({
  rowKey,
  productQty,
  savedCount,
  locale,
  textAlign,
  disabled,
  tUi,
  onApply,
}) {
  const [draft, setDraft] = useState(String(savedCount));
  useEffect(() => {
    setDraft(String(savedCount));
  }, [savedCount, rowKey]);

  const clamp = (n) => Math.max(0, Math.min(productQty, n));
  const parsed = () => clamp(Math.floor(Number(String(draft).replace(/\D/g, '')) || 0));

  return (
    <View style={styles.unitBlock}>
      <Text style={[styles.unitHeader, { textAlign }]}>
        {tUi('upholsteryCompletedItemsLabel', locale)}
        <Text style={styles.unitHeaderMuted}>
          {` (${savedCount} / ${productQty})`}
        </Text>
      </Text>
      <Text style={[styles.hint, { textAlign }]}>
        {tUi('upholsteryCompletedItemsHint', locale)}
      </Text>
      <View style={styles.unitEntryRow}>
        <Pressable
          style={styles.unitStepBtn}
          disabled={disabled}
          onPress={() => setDraft(String(clamp(parsed() - 1)))}
          accessibilityLabel="-"
        >
          <MaterialCommunityIcons name="minus" size={28} color={ICON} />
        </Pressable>
        <TextInput
          style={styles.unitCountInput}
          value={draft}
          onChangeText={setDraft}
          keyboardType="number-pad"
          editable={!disabled}
          selectTextOnFocus
          maxLength={4}
        />
        <Pressable
          style={styles.unitStepBtn}
          disabled={disabled}
          onPress={() => setDraft(String(clamp(parsed() + 1)))}
          accessibilityLabel="+"
        >
          <MaterialCommunityIcons name="plus" size={28} color={ICON} />
        </Pressable>
        <Pressable
          style={[styles.unitConfirmBtn, disabled && styles.unitConfirmBtnDisabled]}
          disabled={disabled}
          onPress={() => onApply?.(rowKey, parsed())}
          accessibilityLabel={tUi('upholsteryCompletedItemsApply', locale)}
        >
          <MaterialCommunityIcons name="check-circle" size={46} color="#22c55e" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  unitBlock: { marginBottom: 12 },
  unitHeader: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 4 },
  unitHeaderMuted: { fontSize: 14, fontWeight: '600', color: theme.textMuted },
  hint: { fontSize: 12, color: theme.textMuted, marginBottom: 8 },
  unitEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceElevated,
  },
  unitCountInput: {
    flex: 1,
    minWidth: 56,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceElevated,
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  unitConfirmBtn: { padding: 2 },
  unitConfirmBtnDisabled: { opacity: 0.45 },
});
