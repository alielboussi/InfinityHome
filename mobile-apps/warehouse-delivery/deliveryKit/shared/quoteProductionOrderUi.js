import { useEffect, useMemo, useState } from 'react';
import {
  collectProductionQuoteArabicPhrases,
  displayQuoteFieldValue,
  expandArabicPhraseVariants,
  formatQuoteDimensionsCmDisplay,
  formatQuoteLineQtyLabel,
} from './quoteArabicTranslate';
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
import {
  isProductionQuoteCustomerOrder,
  isProductionQuoteShowroomOrder,
  firstProductionQuoteLineImageUrl,
  productionQuoteListTitle,
} from './quoteShowroomOrder';
import { orderBadgeTextStyle } from './orderBadgeI18n';

function formatDimensionsCm(line, locale = 'en') {
  return formatQuoteDimensionsCmDisplay(line, locale);
}

function normalizeAccessoriesList(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return arr.map((s) => String(s ?? '').trim()).filter(Boolean);
}

/** Merge flat + metadata workshop fields from API / routing snapshot rows. */
export function normalizeProductionQuoteLine(line) {
  if (!line || typeof line !== 'object') return line;
  const meta = line.metadata && typeof line.metadata === 'object' ? line.metadata : {};
  const trim = (v) => {
    const s = v != null ? String(v).trim() : '';
    return s || '';
  };
  return {
    ...line,
    leather_code: trim(line.leather_code) || trim(meta.leather_code),
    foam_type: trim(line.foam_type) || trim(meta.foam_type),
    wood: trim(line.wood) || trim(meta.wood),
    color_code: trim(line.color_code) || trim(meta.color_code),
    dim_l_cm: trim(line.dim_l_cm) || trim(meta.dim_l_cm),
    dim_w_cm: trim(line.dim_w_cm) || trim(meta.dim_w_cm),
    dim_h_cm: trim(line.dim_h_cm) || trim(meta.dim_h_cm),
    dimension_sets: Array.isArray(line.dimension_sets)
      ? line.dimension_sets
      : (Array.isArray(meta.dimension_sets) ? meta.dimension_sets : undefined),
    dimensions_lwh: trim(line.dimensions_lwh) || trim(meta.dimensions_lwh),
    aluminum_thickness_mm: trim(line.aluminum_thickness_mm) || trim(meta.aluminum_thickness_mm),
    accessories: line.accessories ?? meta.accessories,
    description: trim(line.description) || trim(meta.description) || line.description,
    line_image_url: trim(line.line_image_url) || trim(meta.line_image_url) || trim(meta.floor2_image_url),
    production_completed_qty: line.production_completed_qty,
    production_remaining_qty: line.production_remaining_qty,
    ordered_qty: line.ordered_qty,
  };
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

function buildUpholsteryLineExtraTexts(line, tUi, locale, arabicMap = {}) {
  const show = (v) => displayQuoteFieldValue(locale, v, arabicMap);
  const rows = [];
  if (line.leather_code) {
    rows.push(`${tUi('quoteOrderLeatherCode', locale)}: ${line.leather_code}`);
  }
  const dims = formatDimensionsCm(line, locale);
  if (dims) {
    rows.push(`${tUi('quoteOrderDimensions', locale)}: ${dims}`);
  }
  if (line.foam_type) {
    rows.push(`${tUi('quoteOrderFoamType', locale) || 'Foam type'}: ${show(line.foam_type)}`);
  }
  if (line.wood) {
    rows.push(`${tUi('quoteOrderWood', locale)}: ${show(line.wood)}`);
  }
  if (line.description) {
    const desc = show(line.description);
    rows.push(`${tUi('quoteOrderDescription', locale)}: "${desc}"`);
  }
  const accessories = normalizeAccessoriesList(line.accessories);
  if (accessories.length) {
    const accShown = accessories.map((a) => show(a)).join('، ');
    rows.push(`${tUi('quoteOrderIncludedAccessories', locale)} : ${accShown}`);
  }
  return rows;
}

function buildAluminumLineExtraTexts(line, tUi, locale, arabicMap = {}) {
  const show = (v) => displayQuoteFieldValue(locale, v, arabicMap);
  const rows = [];
  const dims = formatDimensionsCm(line, locale);
  if (dims) {
    rows.push(`${tUi('quoteOrderDimensions', locale)}: ${dims}`);
  }
  if (line.aluminum_thickness_mm) {
    rows.push(`${tUi('quoteOrderAluminumThickness', locale) || 'Thickness'}: ${line.aluminum_thickness_mm}`);
  }
  if (line.color_code) {
    rows.push(`${tUi('quoteOrderColorCode', locale)}: ${line.color_code}`);
  }
  if (line.description) {
    const desc = show(line.description);
    rows.push(`${tUi('quoteOrderDescription', locale)}: "${desc}"`);
  }
  const accessories = normalizeAccessoriesList(line.accessories);
  if (accessories.length) {
    const accShown = accessories.map((a) => show(a)).join('، ');
    rows.push(`${tUi('quoteOrderIncludedAccessories', locale)} : ${accShown}`);
  }
  return rows;
}

function buildCarpentryLineExtraTexts(line, tUi, locale, arabicMap = {}) {
  const show = (v) => displayQuoteFieldValue(locale, v, arabicMap);
  const rows = [];
  if (line.wood) {
    rows.push(`${tUi('quoteOrderWood', locale)}: ${show(line.wood)}`);
  }
  const dims = formatDimensionsCm(line);
  if (dims) {
    rows.push(`${tUi('quoteOrderDimensions', locale)}: ${dims}`);
  }
  if (line.color_code) {
    rows.push(`${tUi('quoteOrderColorCode', locale)}: ${line.color_code}`);
  }
  if (line.description) {
    const desc = show(line.description);
    rows.push(`${tUi('quoteOrderDescription', locale)}: "${desc}"`);
  }
  const accessories = normalizeAccessoriesList(line.accessories);
  if (accessories.length) {
    const accShown = accessories.map((a) => show(a)).join('، ');
    rows.push(`${tUi('quoteOrderIncludedAccessories', locale)} : ${accShown}`);
  }
  return rows;
}

/** Server-backed Arabic map when locale is `ar` (falls back to local dictionary). */
export function useProductionQuoteArabicMap(lines, locale, fetchTranslations, extraPhrases = []) {
  const [map, setMap] = useState({});
  const phraseKey = useMemo(() => {
    const extras = Array.isArray(extraPhrases) ? extraPhrases : [];
    const merged = [...collectProductionQuoteArabicPhrases(lines), ...extras];
    return expandArabicPhraseVariants(merged).join('\0');
  }, [lines, extraPhrases]);

  useEffect(() => {
    if (locale !== 'ar') {
      setMap({});
      return undefined;
    }
    const phrases = expandArabicPhraseVariants(
      phraseKey ? phraseKey.split('\0').filter(Boolean) : [],
    );
    if (!phrases.length) {
      setMap({});
      return undefined;
    }
    let cancelled = false;
    (async () => {
      let serverMap = {};
      if (typeof fetchTranslations === 'function') {
        try {
          serverMap = await fetchTranslations(phrases);
        } catch {
          serverMap = {};
        }
      }
      if (!cancelled) setMap(serverMap || {});
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, phraseKey, fetchTranslations]);

  return map;
}

export function summarizeProductionQuoteCardExtras(lines, route, tUi, locale, arabicMap = {}) {
  const normalized = String(route || '').toLowerCase();
  const list = Array.isArray(lines) ? lines : [];
  const bits = [];
  const show = (v) => displayQuoteFieldValue(locale, v, arabicMap);
  const translate = typeof tUi === 'function'
    ? (key, fallback) => tUi(key, locale) || fallback
    : (_key, fallback) => fallback;
  for (const line of list.slice(0, 3)) {
    const row = normalizeProductionQuoteLine(line);
    if (normalized === 'upholstery') {
      if (row.leather_code) bits.push(`${translate('quoteOrderLeatherCode', 'Leather')}: ${row.leather_code}`);
      const dims = formatDimensionsCm(row, locale);
      if (dims) bits.push(`${translate('quoteOrderDimensions', 'L×W×H (cm)')}: ${dims}`);
      if (row.foam_type) bits.push(`${translate('quoteOrderFoamType', 'Foam')}: ${show(row.foam_type)}`);
      if (row.wood) bits.push(`${translate('quoteOrderWood', 'Wood')}: ${show(row.wood)}`);
      if (row.description) bits.push(`${translate('quoteOrderDescription', 'Desc')}: "${show(row.description)}"`);
    }
    if (normalized === 'carpentry') {
      if (row.wood) bits.push(`${translate('quoteOrderWood', 'Wood')}: ${show(row.wood)}`);
      const dims = formatDimensionsCm(row, locale);
      if (dims) bits.push(`${translate('quoteOrderDimensions', 'L×W×H (cm)')}: ${dims}`);
      if (row.color_code) bits.push(`${translate('quoteOrderColorCode', 'Color')}: ${row.color_code}`);
      const acc = normalizeAccessoriesList(row.accessories);
      if (acc.length) {
        bits.push(`${translate('quoteOrderIncludedAccessories', 'Included Accessories')} : ${acc.map((a) => show(a)).join('، ')}`);
      }
    }
    if (normalized === 'aluminum') {
      const dims = formatDimensionsCm(row, locale);
      if (dims) bits.push(`${translate('quoteOrderDimensions', 'L×W×H (cm)')}: ${dims}`);
      if (row.aluminum_thickness_mm) {
        bits.push(`${translate('quoteOrderAluminumThickness', 'Thickness')}: ${row.aluminum_thickness_mm}`);
      }
      if (row.color_code) bits.push(`${translate('quoteOrderColorCode', 'Color')}: ${row.color_code}`);
      const acc = normalizeAccessoriesList(row.accessories);
      if (acc.length) {
        bits.push(`${translate('quoteOrderIncludedAccessories', 'Included Accessories')} : ${acc.map((a) => show(a)).join('، ')}`);
      }
    }
  }
  return bits.join(' · ');
}

export function QuoteProductionLineExtras({ line, route, textAlign, tUi, locale, arabicMap = {} }) {
  const normalized = String(route || '').toLowerCase();
  const row = normalizeProductionQuoteLine(line);
  let extras = [];
  if (normalized === 'upholstery') {
    extras = buildUpholsteryLineExtraTexts(row, tUi, locale, arabicMap);
  } else if (normalized === 'carpentry') {
    extras = buildCarpentryLineExtraTexts(row, tUi, locale, arabicMap);
  } else if (normalized === 'aluminum') {
    extras = buildAluminumLineExtraTexts(row, tUi, locale, arabicMap);
  }
  if (!extras.length) return null;
  return extras.map((extra) => (
    <Text key={extra} style={[styles.lineExtra, { textAlign }]}>
      {extra}
    </Text>
  ));
}

export function QuoteProductionLineRows({ lines, route, textAlign, tUi, locale, arabicMap = {} }) {
  const normalized = String(route || '').toLowerCase();
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return null;

  return list.map((line, index) => {
    const row = normalizeProductionQuoteLine(line);
    const key = String(row.id || `${row.name}-${index}`);
    const extras = [];
    if (normalized === 'upholstery') {
      extras.push(...buildUpholsteryLineExtraTexts(row, tUi, locale, arabicMap));
    }
    if (normalized === 'carpentry') {
      extras.push(...buildCarpentryLineExtraTexts(row, tUi, locale, arabicMap));
    }
    if (normalized === 'aluminum') {
      extras.push(...buildAluminumLineExtraTexts(row, tUi, locale, arabicMap));
    }
    const nameShown = displayQuoteFieldValue(locale, row.name, arabicMap);
    const qtyUnit = row.unit_abbr || row.unit_label || row.abbreviation || '';
    const qtyLead = locale === 'ar' && qtyUnit
      ? formatQuoteLineQtyLabel(row.quantity, qtyUnit, locale, arabicMap)
      : String(row.quantity ?? 1);
    const qtyShown = locale === 'ar'
      ? formatQuoteLineQtyLabel(row.quantity, '', locale, arabicMap) || String(row.quantity ?? 1)
      : String(row.quantity ?? 1);
    const title = locale === 'ar' && qtyUnit
      ? `${qtyLead} × ${nameShown}`
      : `${qtyShown} × ${nameShown}`;
    return (
      <View key={key} style={styles.lineBlock}>
        <Text style={[styles.lineMain, { textAlign }]}>
          {title}
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

export function QuoteProductionOrderBadges({ quote, textAlign, tUi, locale }) {
  const showroom = isProductionQuoteShowroomOrder(quote);
  const customer = isProductionQuoteCustomerOrder(quote);
  if (!showroom && !customer) return null;
  const badgeTextExtra = orderBadgeTextStyle(locale);
  const rowAlign = locale === 'ar' || textAlign === 'right' ? 'flex-end' : 'flex-start';
  return (
    <View style={[styles.badgeRow, { justifyContent: rowAlign }]}>
      {showroom ? (
        <Text style={[styles.badge, styles.badgeShowroom, badgeTextExtra]}>{tUi('badgeShowroomOrder', locale)}</Text>
      ) : null}
      {customer ? (
        <Text style={[styles.badge, styles.badgeCustomer, badgeTextExtra]}>{tUi('badgeCustomerOrder', locale)}</Text>
      ) : null}
    </View>
  );
}

/** Delivery app queue / sent list rows → same customer vs showroom badges as workshop quotes. */
export function deliveryDestinationBadgeQuote(row) {
  if (!row || typeof row !== 'object') {
    return { showroom_order: false, customer_order: false };
  }
  if (row.showroom_order === true) {
    return { showroom_order: true, customer_order: false };
  }
  const customer = row.customer_order === true
    || row.has_customer === true
    || Boolean(String(row.customer_name || '').trim());
  return { showroom_order: false, customer_order: customer };
}

export function DeliveryDestinationBadges({ row, textAlign, tUi, locale }) {
  return (
    <QuoteProductionOrderBadges
      quote={deliveryDestinationBadgeQuote(row)}
      textAlign={textAlign}
      tUi={tUi}
      locale={locale}
    />
  );
}

/** Floor 2 / line reference thumb on quote list cards (showroom orders). */
export function QuoteProductionListThumb({ quote, textAlign }) {
  const url = firstProductionQuoteLineImageUrl(quote);
  if (!url) return null;
  return (
    <Image
      source={{ uri: url }}
      style={[
        styles.listThumb,
        textAlign === 'right' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
      ]}
      resizeMode="cover"
    />
  );
}

export { productionQuoteListTitle, isProductionQuoteShowroomOrder, isProductionQuoteCustomerOrder };
export { orderBadgeTextStyle } from './orderBadgeI18n';

export function productionQuoteDetailCustomerLabel(quote, tUi, locale, arabicMap, displayQuoteFieldValue) {
  if (isProductionQuoteShowroomOrder(quote)) {
    return tUi('showroomOrderDetailLabel', locale);
  }
  const name = displayQuoteFieldValue(locale, quote.customer_name, arabicMap);
  return name || '—';
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

export function QuoteProductionLineSetBadge({ quote, textAlign, tUi, locale }) {
  const key = String(quote?.production_line_set || '').trim();
  if (!key) return null;
  const labelKey = key === 'floor2_wip'
    ? 'quoteCardFloor2Wip'
    : (key === 'quote_catalog' ? 'quoteCardQuoteProducts' : '');
  if (!labelKey) return null;
  return (
    <Text style={[styles.lineSetBadge, { textAlign }]}>
      {tUi(labelKey, locale)}
    </Text>
  );
}

export function QuoteProductionFloor2ShortfallBanner({ quote, textAlign, tUi, locale }) {
  if (quote?.accepted_at || quote?.floor2_ready !== false) return null;
  if (!quote?.floor2_wip_required) return null;
  const gaps = Array.isArray(quote.floor2_shortfalls) ? quote.floor2_shortfalls : [];
  if (!gaps.length) return null;
  const first = gaps[0];
  const more = gaps.length > 1 ? ` (+${gaps.length - 1} more)` : '';
  return (
    <View style={styles.floor2ShortfallBanner}>
      <Text style={[styles.floor2ShortfallTitle, { textAlign }]}>
        {tUi('quoteFloor2ShortfallTitle', locale)}
      </Text>
      <Text style={[styles.floor2ShortfallBody, { textAlign }]}>
        {(first.name || first.assembly_id)}
        {' — '}
        {tUi('quoteFloor2NeedHave', locale)}
        {': '}
        {first.need}
        {' / '}
        {first.have}
        {more}
      </Text>
      <Text style={[styles.floor2ShortfallHint, { textAlign }]}>
        {tUi('quoteFloor2ManufactureBeforeStart', locale)}
      </Text>
    </View>
  );
}

export function QuoteProductionCardExtras({ quote, route, textAlign, tUi, locale, arabicMap = {} }) {
  const normalized = String(route || '').toLowerCase();
  const hasDrawing = Boolean(String(quote.drawing_url || '').trim());
  const allLines = Array.isArray(quote.lines) ? quote.lines : [];

  if (normalized === 'carpentry' || normalized === 'aluminum') {
    if (!allLines.length && !hasDrawing) return null;
    const buildExtras = normalized === 'aluminum'
      ? buildAluminumLineExtraTexts
      : buildCarpentryLineExtraTexts;
    return (
      <View style={styles.cardExtras}>
        {allLines.map((line, index) => {
          const row = normalizeProductionQuoteLine(line);
          const extras = buildExtras(row, tUi, locale, arabicMap);
          const lineKey = String(row.id || `${row.name}-${index}`);
          const nameShown = displayQuoteFieldValue(locale, row.name, arabicMap);
          return (
            <View key={lineKey} style={styles.cardLineBlock}>
              {row.name ? (
                <Text style={[styles.cardLineTitle, { textAlign }]} numberOfLines={2}>
                  {row.quantity || 1} × {nameShown}
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
      </View>
    );
  }

  const extras = summarizeProductionQuoteCardExtras(allLines, route, tUi, locale, arabicMap);
  if (!extras) return null;
  return (
    <View style={styles.cardExtras}>
      {extras ? <Text style={[styles.cardExtraText, { textAlign }]}>{extras}</Text> : null}
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 2 },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeCustomer: { backgroundColor: '#dbeafe', color: '#1e40af' },
  badgeShowroom: { backgroundColor: '#e0e7ff', color: '#3730a3' },
  lineSetBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
    marginTop: 4,
    marginBottom: 2,
  },
  floor2ShortfallBanner: {
    marginTop: 8,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  floor2ShortfallTitle: { color: '#92400e', fontWeight: '800', fontSize: 12, marginBottom: 4 },
  floor2ShortfallBody: { color: '#78350f', fontSize: 12, fontWeight: '600' },
  floor2ShortfallHint: { color: '#92400e', fontSize: 11, marginTop: 4 },
  listThumb: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#e2e8f0',
  },
});
