import { Platform } from 'react-native';

const ANDROID_NAV_MIN = 72;
export const KIOSK_SCROLL_EXTRA_BOTTOM = 28;

/** Space reserved for the Android 3-button / Samsung nav bar (often reported as 0). */
export function kioskAndroidNavReserve(insets) {
  const reported = Number(insets?.bottom) || 0;
  if (Platform.OS === 'android') return Math.max(reported, ANDROID_NAV_MIN);
  return Math.max(reported, 16);
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

/**
 * Extra gap above flow buttons. Android nav chrome is reserved by UpholsterySafeFrame in App.js
 * so this is not the full nav height (avoids double padding).
 */
export function kioskFooterBottomPad(_insets) {
  return 16;
}

/** Modals sit above the window (outside UpholsterySafeFrame) — include the nav reserve. */
export function kioskModalBottomPad(insets) {
  return kioskAndroidNavReserve(insets) + 12;
}

export function kioskTextAlign(locale) {
  return locale === 'ar' ? 'right' : 'left';
}

/** Physical cm → layout dp (160 dp per inch). */
export function cmToDp(cm) {
  return (Number(cm) / 2.54) * 160;
}

/** Production dashboard tiles (2 cm × 2 cm on screen — fits without scroll). */
export const PRODUCTION_DASH_TILE_CM = 2;
export const productionDashTileSizeDp = () => cmToDp(PRODUCTION_DASH_TILE_CM);
