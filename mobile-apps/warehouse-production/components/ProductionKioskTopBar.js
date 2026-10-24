import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tUi } from '../lib/productionKioskI18n';
import { kiosk } from './kioskStyles';

export default function ProductionKioskTopBar({ title, locale, onToggleLocale }) {
  return (
    <View style={styles.header}>
      <Text style={[kiosk.title, styles.titleFlex]}>{title}</Text>
      <Pressable style={kiosk.langBtn} onPress={onToggleLocale} accessibilityRole="button">
        <Text style={kiosk.langBtnText}>{tUi('translateToggle', locale)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  titleFlex: { flex: 1 },
});
