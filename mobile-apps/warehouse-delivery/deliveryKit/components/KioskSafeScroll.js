import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';
import {
  KIOSK_SCROLL_EXTRA_BOTTOM,
  kioskContentStyleWithoutBottom,
  kioskScrollPaddingBottom,
} from '../lib/kioskLayout';

/**
 * Scrollable kiosk page with bottom padding above Samsung / Android nav bar.
 */
export default function KioskSafeScroll({
  children,
  contentContainerStyle,
  extraBottom = KIOSK_SCROLL_EXTRA_BOTTOM,
  keyboardShouldPersistTaps = 'handled',
  style,
  ...rest
}) {
  const insets = useSafeAreaInsets();
  const flat = StyleSheet.flatten(contentContainerStyle) || {};
  const userBottom = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 0;
  const paddingBottom = kioskScrollPaddingBottom(insets, extraBottom, userBottom);
  const contentRest = kioskContentStyleWithoutBottom(contentContainerStyle);

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: theme.bg }, style]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      removeClippedSubviews
      nestedScrollEnabled
      decelerationRate="normal"
      overScrollMode="always"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        kiosk.screen,
        { paddingTop: (insets.top ?? 0) + 8, paddingBottom },
        contentRest,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
