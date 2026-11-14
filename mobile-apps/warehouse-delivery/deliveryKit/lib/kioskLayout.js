import { Platform, StyleSheet } from 'react-native';

const ANDROID_NAV_MIN = 56;

/** Extra space below scroll content so primary buttons clear the system nav bar. */
export const KIOSK_SCROLL_EXTRA_BOTTOM = 28;

/** Bottom padding for FlatList / ScrollView contentContainerStyle. */
export function kioskScrollPaddingBottom(insets, extraBottom = KIOSK_SCROLL_EXTRA_BOTTOM, userBottom = 0) {
  return kioskFooterBottomPad(insets) + extraBottom + Math.max(0, Number(userBottom) || 0);
}

/** Remove paddingBottom from a flattened style so safe-area math is not overridden. */
export function kioskContentStyleWithoutBottom(contentContainerStyle) {
  const flat = StyleSheet.flatten(contentContainerStyle) || {};
  if (typeof flat.paddingBottom !== 'number') return flat;
  const { paddingBottom: _ignored, ...rest } = flat;
  return rest;
}

/** Scroll content padding (use with KioskStickyFooter for primary actions). */
export function kioskScreenEdges(insets, extraBottom = 16) {
  return {
    paddingTop: (insets?.top ?? 0) + 8,
    paddingBottom: extraBottom,
  };
}

/** Top + bottom safe area (Samsung nav bar). Use on scroll screens without custom footer math. */
export function kioskScreenEdgesSafe(insets, extraBottom = 8) {
  return {
    paddingTop: (insets?.top ?? 0) + 8,
    paddingBottom: kioskFooterBottomPad(insets) + extraBottom,
  };
}

/** Bottom inset for footers when SafeArea reports 0 on Android. */
export function kioskFooterBottomPad(insets) {
  const reported = insets?.bottom ?? 0;
  if (Platform.OS === 'android') {
    return Math.max(reported, ANDROID_NAV_MIN);
  }
  return Math.max(reported, 16);
}

export function kioskTextAlign(locale) {
  return locale === 'ar' ? 'right' : 'left';
}

/** Row flexDirection for locale-aware headers (chip + label). */
export function kioskRowDirection(locale) {
  return locale === 'ar' ? 'row-reverse' : 'row';
}

/** Physical cm → layout dp (160 dp per inch). */
export function cmToDp(cm) {
  return (Number(cm) / 2.54) * 160;
}

/** Production dashboard tiles (2 cm × 2 cm on screen — fits without scroll). */
export const PRODUCTION_DASH_TILE_CM = 2;
export const productionDashTileSizeDp = () => cmToDp(PRODUCTION_DASH_TILE_CM);
