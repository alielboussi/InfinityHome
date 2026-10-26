import { Platform } from 'react-native';

const ANDROID_NAV_MIN = 52;

/** Scroll content padding (use with KioskStickyFooter for primary actions). */
export function kioskScreenEdges(insets, extraBottom = 16) {
  return {
    paddingTop: (insets?.top ?? 0) + 8,
    paddingBottom: extraBottom,
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
