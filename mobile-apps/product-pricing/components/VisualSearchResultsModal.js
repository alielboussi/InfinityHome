import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import CachedProductImage from './CachedProductImage';
import { theme } from '../theme';

function formatScore(score) {
  const pct = Math.round(Number(score || 0) * 100);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export default function VisualSearchResultsModal({
  visible,
  matches,
  loading,
  error,
  note,
  onClose,
  onSelect,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Photo matches</Text>
          <Text style={styles.hint}>Pick the closest product or set. Scores are suggestions, not guarantees.</Text>

          {loading ? <Text style={styles.status}>Searching catalog…</Text> : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <FlatList
            data={matches}
            keyExtractor={(item) => `${item.entityType || 'product'}_${item.entityId}`}
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => onSelect?.(item)}>
                <View style={styles.thumbWrap}>
                  {item.imageUrl ? (
                    <CachedProductImage uri={item.imageUrl} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Text style={styles.thumbPlaceholderText}>No image</Text>
                    </View>
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.name || 'Unnamed item'}</Text>
                  {item.sku ? <Text style={styles.rowSku}>SKU: {item.sku}</Text> : null}
                  <Text style={styles.rowMeta}>
                    {item.__isCombo ? 'Set' : 'Product'} · Match {formatScore(item.score)}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={!loading ? (
              <Text style={styles.status}>No close matches found. Try a clearer photo of the product.</Text>
            ) : null}
          />

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 16,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '900' },
  hint: { color: theme.muted, fontSize: 12, marginTop: 6, marginBottom: 12, lineHeight: 16 },
  status: { color: theme.muted, marginBottom: 12 },
  note: { color: theme.accent, marginBottom: 12, fontSize: 12, lineHeight: 16 },
  error: { color: theme.danger, marginBottom: 12 },
  list: { maxHeight: 420 },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 10,
    marginBottom: 8,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.bg,
  },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { color: theme.muted, fontSize: 10, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowName: { color: theme.text, fontWeight: '800', fontSize: 14 },
  rowSku: { color: theme.muted, fontSize: 11, marginTop: 2 },
  rowMeta: { color: theme.border, fontSize: 11, marginTop: 6, fontWeight: '700' },
  closeButton: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  closeText: { color: theme.text, fontWeight: '700' },
});
