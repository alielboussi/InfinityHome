import { useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from './theme';

function formatDimensionsCm(line) {
  const l = line?.dim_l_cm != null && String(line.dim_l_cm).trim() ? String(line.dim_l_cm).trim() : '';
  const w = line?.dim_w_cm != null && String(line.dim_w_cm).trim() ? String(line.dim_w_cm).trim() : '';
  const h = line?.dim_h_cm != null && String(line.dim_h_cm).trim() ? String(line.dim_h_cm).trim() : '';
  if (l && w && h) return `${l} × ${w} × ${h}`;
  const legacy = line?.dimensions_lwh != null && String(line.dimensions_lwh).trim()
    ? String(line.dimensions_lwh).trim()
    : '';
  if (legacy) return legacy.replace(/\s*[x×*]\s*/gi, ' × ');
  const partial = [l, w, h].filter(Boolean);
  return partial.length ? partial.join(' × ') : '';
}

function normalizeAccessoriesList(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return arr.map((s) => String(s ?? '').trim()).filter(Boolean);
}

function carpentryLineHasExtras(line) {
  if (!line) return false;
  return Boolean(
    formatDimensionsCm(line)
    || line.color_code
    || line.wood
    || normalizeAccessoriesList(line.accessories).length
    || line.description,
  );
}

function buildCarpentryLineExtraTexts(line, tUi, locale) {
  const rows = [];
  if (line.wood) {
    rows.push(`${tUi('quoteOrderWood', locale)}: ${line.wood}`);
  }
  const dims = formatDimensionsCm(line);
  if (dims) {
    rows.push(`${tUi('quoteOrderDimensions', locale)}: ${dims}`);
  }
  if (line.color_code) {
    rows.push(`${tUi('quoteOrderColorCode', locale)}: ${line.color_code}`);
  }
  if (line.description) {
    rows.push(`${tUi('quoteOrderDescription', locale)}: "${String(line.description).trim()}"`);
  }
  const accessories = normalizeAccessoriesList(line.accessories);
  if (accessories.length) {
    rows.push(`${tUi('quoteOrderIncludedAccessories', locale)} : ${accessories.join(', ')}`);
  }
  return rows;
}

export function summarizeProductionQuoteCardExtras(lines, route, tUi, locale) {
  const normalized = String(route || '').toLowerCase();
  const list = Array.isArray(lines) ? lines : [];
  const bits = [];
  const translate = typeof tUi === 'function'
    ? (key, fallback) => tUi(key, locale) || fallback
    : (_key, fallback) => fallback;
  for (const line of list.slice(0, 3)) {
    if (normalized === 'upholstery') {
      if (line.leather_code) bits.push(`${translate('quoteOrderLeatherCode', 'Leather')}: ${line.leather_code}`);
      if (line.description) bits.push(`${translate('quoteOrderDescription', 'Desc')}: "${line.description}"`);
    }
    if (normalized === 'carpentry') {
      if (line.wood) bits.push(`${translate('quoteOrderWood', 'Wood')}: ${line.wood}`);
      const dims = formatDimensionsCm(line);
      if (dims) bits.push(`${translate('quoteOrderDimensions', 'L×W×H (cm)')}: ${dims}`);
      if (line.color_code) bits.push(`${translate('quoteOrderColorCode', 'Color')}: ${line.color_code}`);
      const acc = normalizeAccessoriesList(line.accessories);
      if (acc.length) bits.push(`${translate('quoteOrderIncludedAccessories', 'Included Accessories')} : ${acc.join(', ')}`);
    }
  }
  return bits.join(' · ');
}

export function QuoteProductionLineRows({ lines, route, textAlign, tUi, locale }) {
  const normalized = String(route || '').toLowerCase();
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return null;

  return list.map((line, index) => {
    const key = String(line.id || `${line.name}-${index}`);
    const extras = [];
    if (normalized === 'upholstery') {
      if (line.leather_code) {
        extras.push(`${tUi('quoteOrderLeatherCode', locale)}: ${line.leather_code}`);
      }
      if (line.description) {
        extras.push(`${tUi('quoteOrderDescription', locale)}: "${String(line.description).trim()}"`);
      }
      const acc = normalizeAccessoriesList(line.accessories);
      if (acc.length) {
        extras.push(`${tUi('quoteOrderIncludedAccessories', locale)} : ${acc.join(', ')}`);
      }
    }
    if (normalized === 'carpentry') {
      extras.push(...buildCarpentryLineExtraTexts(line, tUi, locale));
    }
    return (
      <View key={key} style={styles.lineBlock}>
        <Text style={[styles.lineMain, { textAlign }]}>
          {line.quantity} × {line.name}
        </Text>
        {extras.map((extra) => (
          <Text key={extra} style={[styles.lineExtra, { textAlign }]}>
            {extra}
          </Text>
        ))}
      </View>
    );
  });
}

export function QuoteProductionDrawingSection({ drawingUrl, textAlign, tUi, locale }) {
  const [open, setOpen] = useState(false);
  const url = String(drawingUrl || '').trim();
  if (!url) return null;

  const openExternal = () => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <>
      <Pressable style={styles.drawingBtn} onPress={() => setOpen(true)}>
        <Text style={styles.drawingBtnText}>{tUi('quoteOrderViewDrawing', locale)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { textAlign }]}>{tUi('quoteOrderDrawingTitle', locale)}</Text>
            <Image source={{ uri: url }} style={styles.modalImage} resizeMode="contain" />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={openExternal}>
                <Text style={styles.modalBtnText}>{tUi('quoteOrderOpenInBrowser', locale)}</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setOpen(false)}>
                <Text style={styles.modalBtnText}>{tUi('cancel', locale)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function QuoteProductionCardExtras({ quote, route, textAlign, tUi, locale }) {
  const normalized = String(route || '').toLowerCase();
  const hasDrawing = Boolean(String(quote.drawing_url || '').trim());
  const allLines = Array.isArray(quote.lines) ? quote.lines : [];

  if (normalized === 'carpentry') {
    if (!allLines.length && !hasDrawing) return null;
    return (
      <View style={styles.cardExtras}>
        {allLines.map((line, index) => {
          const extras = buildCarpentryLineExtraTexts(line, tUi, locale);
          const lineKey = String(line.id || `${line.name}-${index}`);
          return (
            <View key={lineKey} style={styles.cardLineBlock}>
              {line.name ? (
                <Text style={[styles.cardLineTitle, { textAlign }]} numberOfLines={2}>
                  {line.quantity || 1} × {line.name}
                </Text>
              ) : null}
              {extras.map((extra) => (
                <Text key={`${lineKey}-${extra}`} style={[styles.cardExtraText, { textAlign }]}>
                  {extra}
                </Text>
              ))}
            </View>
          );
        })}
        {hasDrawing ? (
          <Text style={[styles.cardDrawingTag, { textAlign }]}>
            {tUi('quoteOrderDrawingAttached', locale)}
          </Text>
        ) : null}
      </View>
    );
  }

  const extras = summarizeProductionQuoteCardExtras(allLines, route, tUi, locale);
  if (!extras && !hasDrawing) return null;
  return (
    <View style={styles.cardExtras}>
      {extras ? <Text style={[styles.cardExtraText, { textAlign }]}>{extras}</Text> : null}
      {hasDrawing ? (
        <Text style={[styles.cardDrawingTag, { textAlign }]}>
          {tUi('quoteOrderDrawingAttached', locale)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lineBlock: { marginBottom: 10 },
  lineMain: { color: theme.textSecondary, fontSize: 15, fontWeight: '600' },
  lineExtra: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  drawingBtn: {
    marginTop: 12,
    alignSelf: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border || '#334155',
  },
  drawingBtnText: { color: theme.primary, fontWeight: '600', textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: theme.bg || '#0f172a',
    borderRadius: 12,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: { color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 12 },
  modalImage: { width: '100%', height: 360, backgroundColor: '#1e293b', borderRadius: 8 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  modalBtn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    backgroundColor: theme.primary,
    borderRadius: 8,
  },
  modalBtnSecondary: { backgroundColor: '#475569' },
  modalBtnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  cardExtras: { marginTop: 6 },
  cardLineBlock: { marginBottom: 6 },
  cardLineTitle: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  cardExtraText: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  cardDrawingTag: { color: theme.primary, fontSize: 12, marginTop: 4, fontWeight: '600' },
});
