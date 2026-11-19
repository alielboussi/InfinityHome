import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from './theme';
import {
  applyQuoteDimensionSetsToLineFields,
  readQuoteDimensionSets,
} from './quoteLineDimensions';
import { resolveQuoteLineQuantity } from './quoteLineQuantity';

function lineQty(line) {
  return resolveQuoteLineQuantity(line?.quantity, line?.unit_price);
}

export function patchQuoteLineQuantityWithDimensions(line, quantityText) {
  const nextQty = resolveQuoteLineQuantity(quantityText, line?.unit_price);
  const resized = readQuoteDimensionSets(line, nextQty);
  return {
    quantity: quantityText,
    ...applyQuoteDimensionSetsToLineFields(resized),
  };
}

export default function QuoteLineDimensionSets({
  line,
  onPatch,
  labelFor,
  locale = 'en',
}) {
  const qty = lineQty(line);
  const sets = readQuoteDimensionSets(line, qty);
  const multi = sets.length > 1;
  const pieceLabel = (index) => (
    locale === 'ar' ? `قطعة ${index + 1}` : `Piece ${index + 1}`
  );

  const patchSets = (nextSets) => {
    onPatch(applyQuoteDimensionSetsToLineFields(nextSets));
  };

  const updateIndex = (index, field, value) => {
    const next = sets.map((set, i) => (
      i === index ? { ...set, [field]: value } : set
    ));
    patchSets(next);
  };

  return (
    <View style={styles.wrap}>
      {sets.map((set, index) => (
        <View key={`dim-${index}`} style={styles.row}>
          {multi ? (
            <Text style={styles.piece}>{pieceLabel(index)}</Text>
          ) : null}
          <View style={styles.grid}>
            {[['dim_l_cm', 'dimL', 'L'], ['dim_w_cm', 'dimW', 'W'], ['dim_h_cm', 'dimH', 'H']].map(([key, labelKey, ph]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{labelFor(labelKey)}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder={ph}
                  placeholderTextColor={theme.textDim}
                  value={set[key] || ''}
                  onChangeText={(v) => updateIndex(index, key, v)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 6 },
  piece: { color: theme.textDim, fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flex: 1, minWidth: 88 },
  label: { color: theme.textDim, fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.text,
    backgroundColor: theme.surface,
  },
});