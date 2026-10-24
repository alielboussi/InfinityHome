import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../shared/theme';

const QWERTY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const ARABIC_BY_QWERTY = {
  q: 'ض', w: 'ص', e: 'ث', r: 'ق', t: 'ف', y: 'غ', u: 'ع', i: 'ه', o: 'خ', p: 'ج',
  a: 'ش', s: 'س', d: 'ي', f: 'ب', g: 'ل', h: 'ا', j: 'ت', k: 'ن', l: 'م',
  z: 'ئ', x: 'ء', c: 'ؤ', v: 'ر', b: 'ى', n: 'ة', m: 'و',
};

export default function ProductionVirtualKeyboard({
  visible,
  onClose,
  onKey,
  onBackspace,
  onSpace,
  onEnter,
  initialLayout = 'ar',
}) {
  const [layout, setLayout] = useState(initialLayout === 'en' ? 'en' : 'ar');

  useEffect(() => {
    if (visible) setLayout(initialLayout === 'en' ? 'en' : 'ar');
  }, [initialLayout, visible]);

  const rows = useMemo(() => QWERTY_ROWS, []);

  const emitKey = (qwertyKey) => {
    if (layout === 'ar') {
      onKey(ARABIC_BY_QWERTY[qwertyKey] || qwertyKey);
      return;
    }
    onKey(qwertyKey);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.toolbar}>
            <Pressable style={styles.toolBtn} onPress={() => setLayout((l) => (l === 'ar' ? 'en' : 'ar'))}>
              <Text style={styles.toolBtnText}>
                {layout === 'ar' ? 'English (QWERTY)' : 'العربية (QWERTY)'}
              </Text>
            </Pressable>
            <Pressable style={styles.toolBtn} onPress={onClose}>
              <Text style={styles.toolBtnText}>✕</Text>
            </Pressable>
          </View>
          {rows.map((row, ri) => (
            <View key={`r-${ri}`} style={styles.row}>
              {row.map((key) => (
                <Pressable key={key} style={styles.key} onPress={() => emitKey(key)}>
                  <Text style={styles.keyMain}>
                    {layout === 'ar' ? (ARABIC_BY_QWERTY[key] || key) : key}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
          <View style={styles.bottomRow}>
            <Pressable style={styles.wideKey} onPress={onSpace}>
              <Text style={styles.keyMain}>Space</Text>
            </Pressable>
            <Pressable style={styles.key} onPress={onBackspace}>
              <Text style={styles.keyMain}>⌫</Text>
            </Pressable>
            <Pressable style={styles.key} onPress={onEnter}>
              <Text style={styles.keyMain}>↵</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    backgroundColor: '#e5e7eb',
    paddingBottom: 12,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  toolBtn: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  toolBtnText: { fontSize: 14, color: theme.text },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  key: {
    minWidth: 32,
    flex: 1,
    maxWidth: 36,
    minHeight: 44,
    backgroundColor: '#fff',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wideKey: {
    flex: 4,
    minHeight: 44,
    backgroundColor: '#fff',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyMain: { fontSize: 16, color: theme.text },
  bottomRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 4,
  },
});
