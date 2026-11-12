import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';
import {
  KIOSK_SCROLL_EXTRA_BOTTOM,
  kioskContentStyleWithoutBottom,
  kioskScrollPaddingBottom,
} from '../lib/kioskLayout';

/** Non-virtualized kiosk page scroll (same padding as DeliveryKioskVirtualList). */
export default function DeliveryKioskFormScroll({
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
      automaticallyAdjustKeyboardInsets
      decelerationRate="normal"
      overScrollMode="always"
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
