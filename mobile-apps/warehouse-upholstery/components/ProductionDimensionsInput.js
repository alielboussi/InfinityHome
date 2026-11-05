import { StyleSheet, Text, TextInput, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { tUi } from '../lib/productionKioskI18n';

export default function ProductionDimensionsInput({
  locale,
  textAlign,
  dimL,
  dimW,
  dimH,
  onChangeL,
  onChangeW,
  onChangeH,
  disabled,
}) {
  return (
    <View style={styles.wrap}>
      <Text style={[kiosk.label, { textAlign }]}>{tUi('dimensionsLabel', locale)}</Text>
      <View style={styles.row}>
        <TextInput
          style={[kiosk.input, styles.dimInput]}
          value={dimL}
          onChangeText={onChangeL}
          keyboardType="decimal-pad"
          placeholder="L"
          placeholderTextColor="#94a3b8"
          editable={!disabled}
          accessibilityLabel={tUi('dimLength', locale)}
        />
        <Text style={styles.sep}>×</Text>
        <TextInput
          style={[kiosk.input, styles.dimInput]}
          value={dimW}
          onChangeText={onChangeW}
          keyboardType="decimal-pad"
          placeholder="W"
          placeholderTextColor="#94a3b8"
          editable={!disabled}
          accessibilityLabel={tUi('dimWidth', locale)}
        />
        <Text style={styles.sep}>×</Text>
        <TextInput
          style={[kiosk.input, styles.dimInput]}
          value={dimH}
          onChangeText={onChangeH}
          keyboardType="decimal-pad"
          placeholder="H"
          placeholderTextColor="#94a3b8"
          editable={!disabled}
          accessibilityLabel={tUi('dimHeight', locale)}
        />
        <Text style={styles.unit}>{tUi('dimUnitCm', locale)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  dimInput: {
    flex: 1,
    minHeight: 48,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  sep: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  unit: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    marginLeft: 2,
  },
});
