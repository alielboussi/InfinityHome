import { StyleSheet, Text, View } from 'react-native';
import { getWarehouseColorChipTheme } from './repoSrc/utils/warehouseColorChip.js';

function ColorChip({ name }) {
  const theme = getWarehouseColorChipTheme(name);
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: theme.bg,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/** Variant colors on warehouse catalog product cards (matches web chip colors). */
export default function WarehouseCatalogColorChips({ colors, compact }) {
  const list = (colors || []).filter((c) => String(c?.name || '').trim());
  if (!list.length) return null;
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {list.map((c) => (
        <ColorChip key={String(c.id || c.name)} name={String(c.name).trim()} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  rowCompact: {
    marginTop: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
